import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import type { ClientFile, FileRef } from "@/db/schema";
import { can } from "@/lib/access";
import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { getViewer } from "@/server/session";
import { humanSize, saveFile, storageProblem } from "@/server/storage";
import { checkUpload } from "@/server/uploads";
import { getUploadPolicy, myLimits } from "@/server/limits";
import { checkBatch } from "@/lib/upload-policy";
import { putNewVersion } from "@/lib/client-files";

/**
 * Adds files to a client's page, or replaces one ("replace" = the file's id).
 * The file it replaces is kept as an earlier version, never deleted. Who may:
 * people who set up clients (`structure`) and may upload; everyone who can
 * see the client can open them through /api/files.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/clients/[id]/files">) {
  const { id } = await ctx.params;
  const me = await getViewer();
  if (!me) return Response.json({ error: "You are signed out." }, { status: 401 });
  const problem = storageProblem();
  if (problem) return Response.json({ error: problem }, { status: 503 });
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  const client = all.clients.find((c) => c.id === id);
  if (!client || !vis.client(id)) return Response.json({ error: "That client is not here." }, { status: 404 });
  if (!can(me, "structure")) return Response.json({ error: "Only people who set up clients (managers and admins) can change a client's files." }, { status: 403 });
  if (!can(me, "upload")) return Response.json({ error: "Uploading is switched off for you. Ask an admin if you need it." }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return Response.json({ error: "No file came through." }, { status: 400 });
  const replaceField = form?.get("replace");
  const replaceId = typeof replaceField === "string" ? replaceField : "";
  if (replaceId) {
    if (files.length !== 1) return Response.json({ error: "Replace one file at a time." }, { status: 400 });
    if (!client.files.some((f) => f.id === replaceId)) return Response.json({ error: "That file is not on this client any more. Refresh and try again." }, { status: 404 });
  }
  // Every file is checked before any is stored, so a refused one leaves nothing half done.
  const checked = files.map((f) => ({ f, c: checkUpload(f.name, f.type) }));
  const refused = checked.find((x) => !x.c.ok);
  if (refused && !refused.c.ok) return Response.json({ error: refused.c.error }, { status: 415 });
  const limit = checkBatch(files.map((f) => ({ name: f.name, size: f.size })), myLimits(all, await getUploadPolicy(), me));
  if (limit) return Response.json({ error: limit }, { status: 413 });

  const now = new Date();
  const stored: FileRef[] = [];
  for (const { f, c } of checked) {
    const clean = f.name.replace(/[^\w.\- ()]+/g, "_").slice(-120) || "file";
    const key = `clients/${id}/${crypto.randomUUID().slice(0, 8)}-${clean}`;
    await saveFile(key, f);
    stored.push({ name: f.name.slice(0, 300), size: humanSize(f.size), bytes: f.size, uploadedBy: me.id, key, type: c.ok ? c.type : "application/octet-stream", url: `/api/files/${key}` });
  }

  let next: ClientFile[] = client.files;
  for (const fresh of stored) next = putNewVersion(next, fresh, { replaceId: replaceId || undefined, by: me.id, at: now.toISOString() });

  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(s.clients).set({ files: next, updatedAt: now }).where(eq(s.clients.id, id));
    await tx.insert(s.activity).values({
      id: "ac" + crypto.randomUUID().slice(0, 10), userId: me.id, action: replaceId ? "replaced a file on" : "uploaded to", type: "client", itemId: id, label: client.name,
      field: stored.length === 1 ? stored[0].name : `${stored.length} files`,
    });
  });
  return Response.json({ ok: true, files: stored, replaced: replaceId || undefined });
}
