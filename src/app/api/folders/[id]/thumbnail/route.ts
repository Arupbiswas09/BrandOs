import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { can, canChange } from "@/lib/access";
import { checkBatch } from "@/lib/upload-policy";
import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { getUploadPolicy, myLimits } from "@/server/limits";
import { getViewer } from "@/server/session";
import { removeStoredFile, storageProblem } from "@/server/storage";
import { keyInUse, readThumbnail, storeThumbnail } from "@/server/thumbnails";

/*
 * The picture on a folder card on an offer page. POST sets it from one
 * image; DELETE goes back to the first asset's picture. Whoever can change
 * the offer can change its folders.
 */

async function gate(id: string, uploading: boolean) {
  const me = await getViewer();
  if (!me) return { error: Response.json({ error: "You are signed out." }, { status: 401 }) };
  if (!can(me, "edit")) return { error: Response.json({ error: "Your role does not allow that. Ask an admin if you need it." }, { status: 403 }) };
  if (uploading && !can(me, "upload")) return { error: Response.json({ error: "Uploading is switched off for you. Ask an admin if you need it." }, { status: 403 }) };
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  const folder = all.folders.find((f) => f.id === id);
  const offer = folder ? all.offers.find((o) => o.id === folder.offerId) : undefined;
  if (!folder || !offer || !vis.offer(offer.id)) return { error: Response.json({ error: "That folder is not here any more." }, { status: 404 }) };
  if (!canChange(me, offer)) return { error: Response.json({ error: "Contributors can only change work they own." }, { status: 403 }) };
  return { me, all, folder, offer };
}

export async function POST(req: Request, ctx: RouteContext<"/api/folders/[id]/thumbnail">) {
  const { id } = await ctx.params;
  const problem = storageProblem();
  if (problem) return Response.json({ error: problem }, { status: 503 });
  const g = await gate(id, true);
  if ("error" in g) return g.error;
  const { me, all, folder, offer } = g;

  const picked = await readThumbnail(req);
  if (!picked.ok) return Response.json({ error: picked.error }, { status: picked.status });
  const limit = checkBatch([{ name: picked.file.name, size: picked.file.size }], myLimits(all, await getUploadPolicy(), me));
  if (limit) return Response.json({ error: limit }, { status: 413 });

  const thumbnail = await storeThumbnail(`thumbnails/folders/${id}`, picked.file, picked.type, me.id, (v) => `/api/folders/${id}/thumbnail/${v}`);
  const db = await getDb();
  await db.update(s.assetFolders).set({ thumbnail, updatedAt: new Date() }).where(eq(s.assetFolders.id, id));
  await db.insert(s.activity).values({
    id: "ac" + crypto.randomUUID().slice(0, 10), userId: me.id, action: "changed the thumbnail of the folder", type: "offer", itemId: offer.id, label: offer.name, field: folder.name,
  });
  const old = folder.thumbnail?.key;
  if (old && !keyInUse(all, old, { folderId: id })) await removeStoredFile(old);
  return Response.json({ ok: true, thumbnail });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/folders/[id]/thumbnail">) {
  const { id } = await ctx.params;
  const g = await gate(id, false);
  if ("error" in g) return g.error;
  const { me, all, folder, offer } = g;
  if (!folder.thumbnail) return Response.json({ ok: true });
  const db = await getDb();
  await db.update(s.assetFolders).set({ thumbnail: null, updatedAt: new Date() }).where(eq(s.assetFolders.id, id));
  await db.insert(s.activity).values({
    id: "ac" + crypto.randomUUID().slice(0, 10), userId: me.id, action: "reset the thumbnail of the folder", type: "offer", itemId: offer.id, label: offer.name, field: folder.name,
  });
  const old = folder.thumbnail.key;
  if (old && !keyInUse(all, old, { folderId: id })) await removeStoredFile(old);
  return Response.json({ ok: true });
}
