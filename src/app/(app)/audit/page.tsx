import type { Metadata } from "next";
import { can } from "@/lib/access";
import { AUDIT_PAGE_SIZE, parseAuditQuery } from "@/lib/audit";
import { readAudit } from "@/server/audit";
import { requireViewer } from "@/server/session";
import { AuditLog, type AuditRow } from "@/components/pages/audit";

export const metadata: Metadata = { title: "Audit log" };

export default async function Page(props: PageProps<"/audit">) {
  const me = await requireViewer();
  const query = parseAuditQuery(await props.searchParams);
  if (!can(me, "access")) return <AuditLog allowed={false} rows={[]} people={[]} total={0} query={query} />;
  const { rows, total, users } = await readAudit(query, { limit: AUDIT_PAGE_SIZE, offset: (query.page - 1) * AUDIT_PAGE_SIZE });
  const byId = new Map(users.map((u) => [u.id, u]));
  // Names are resolved here so people who were removed still show up sensibly.
  const list: AuditRow[] = rows.map((r) => ({
    id: r.id, at: r.createdAt.getTime(), userId: r.userId,
    who: byId.get(r.userId)?.name ?? (r.userId ? "Removed person" : "Someone"),
    action: r.action, type: r.type, label: r.label, field: r.field,
  }));
  return <AuditLog allowed rows={list} people={users.map((u) => ({ id: u.id, name: u.name, access: u.access }))} total={total} query={query} />;
}
