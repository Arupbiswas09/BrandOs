import { can } from "@/lib/access";
import { readAll } from "@/server/data";
import { getViewer } from "@/server/session";

/** Admins can download the whole workspace as JSON (backups, moving hosts). */
export async function GET() {
  const me = await getViewer();
  if (!me) return new Response("Sign in first.", { status: 401 });
  if (!can(me, "access")) return new Response("Only admins can export the workspace.", { status: 403 });
  const all = await readAll();
  const users = all.users.map(({ passwordHash: _p, ...u }) => u);
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), exportedBy: me.email ?? me.id, ...all, users }, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="brandos-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
