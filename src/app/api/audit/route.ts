import { can } from "@/lib/access";
import { EV, parseAuditQuery } from "@/lib/audit";
import { readAudit, recordSecurity } from "@/server/audit";
import { getViewer } from "@/server/session";

export const dynamic = "force-dynamic";

const MAX_ROWS = 50_000;

/** One CSV cell. Cells that start like a formula are prefixed so spreadsheets show them as text. */
function cell(v: string) {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The audit log as CSV, with the same filters as the page (admins only). */
export async function GET(req: Request) {
  const me = await getViewer();
  if (!me) return new Response("Sign in first.", { status: 401 });
  if (!can(me, "access")) return new Response("Only admins can export the audit log.", { status: 403 });
  const q = parseAuditQuery(new URL(req.url).searchParams);
  const { rows, users } = await readAudit(q, { limit: MAX_ROWS, offset: 0 });
  const names = new Map(users.map((u) => [u.id, u]));
  const lines = [
    ["Time (UTC)", "Person", "Person email", "Action", "Type", "Item", "Detail", "Item id"].join(","),
    ...rows.map((r) => {
      const u = names.get(r.userId);
      return [r.createdAt.toISOString(), u?.name ?? (r.userId ? `Removed person (${r.userId})` : "Nobody signed in"), u?.email ?? "", r.action, r.type, r.label, r.field, r.itemId]
        .map((v) => cell(String(v ?? ""))).join(",");
    }),
  ];
  const date = new Date().toISOString().slice(0, 10);
  await recordSecurity({ userId: me.id, action: EV.auditExported, label: `brandos-audit-${date}.csv`, field: `${rows.length} rows`, withIp: true });
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="brandos-audit-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
