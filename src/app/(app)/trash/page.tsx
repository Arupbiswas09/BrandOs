import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { can } from "@/lib/access";
import { requireViewer } from "@/server/session";
import { BIN_DAYS, purgeExpiredTrash } from "@/server/trash";
import { Trash } from "@/components/pages/trash";

export const metadata: Metadata = { title: "Recycle bin" };

export default async function Page() {
  const me = await requireViewer();
  if (!can(me, "del")) return <Trash entries={[]} allowed={false} days={BIN_DAYS} />;
  const db = await getDb();
  await purgeExpiredTrash(db);
  const rows = await db.select({
    id: s.trash.id, kind: s.trash.kind, label: s.trash.label, context: s.trash.context,
    deletedBy: s.trash.deletedBy, deletedAt: s.trash.deletedAt, rows: s.trash.rows,
  }).from(s.trash).orderBy(desc(s.trash.deletedAt));
  // Send counts, not the stored rows themselves.
  const entries = rows.map(({ rows: r, ...e }) => ({
    ...e,
    deletedAt: e.deletedAt.getTime(),
    contains: Object.entries(r).filter(([k, v]) => ["brands", "services", "offers", "assets", "comments"].includes(k) && v.length).map(([k, v]) => `${v.length} ${k === "assets" ? "asset" : k.replace(/s$/, "")}${v.length === 1 ? "" : "s"}`),
  }));
  return <Trash entries={entries} allowed days={BIN_DAYS} />;
}
