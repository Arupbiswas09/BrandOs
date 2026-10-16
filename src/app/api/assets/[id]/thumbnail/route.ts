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
 * The picture on an asset's card. POST sets it from one image (pasted,
 * dropped or chosen); DELETE goes back to the first image among its files.
 * Same checks as uploading files to the asset.
 */

async function gate(id: string) {
  const me = await getViewer();
  if (!me) return { error: Response.json({ error: "You are signed out." }, { status: 401 }) };
  if (!can(me, "upload")) return { error: Response.json({ error: "Uploading is switched off for you. Ask an admin if you need it." }, { status: 403 }) };
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  const asset = all.assets.find((a) => a.id === id);
  if (!asset || !vis.asset(id)) return { error: Response.json({ error: "That asset is not here." }, { status: 404 }) };
  if (!canChange(me, asset)) return { error: Response.json({ error: "Contributors can only change work they own." }, { status: 403 }) };
  if (!asset.brandId && !can(me, "library")) return { error: Response.json({ error: "Only managers and admins can change the Global Library." }, { status: 403 }) };
  return { me, all, asset };
}

export async function POST(req: Request, ctx: RouteContext<"/api/assets/[id]/thumbnail">) {
  const { id } = await ctx.params;
  const problem = storageProblem();
  if (problem) return Response.json({ error: problem }, { status: 503 });
  const g = await gate(id);
  if ("error" in g) return g.error;
  const { me, all, asset } = g;

  const picked = await readThumbnail(req);
  if (!picked.ok) return Response.json({ error: picked.error }, { status: picked.status });
  const limit = checkBatch([{ name: picked.file.name, size: picked.file.size }], myLimits(all, await getUploadPolicy(), me));
  if (limit) return Response.json({ error: limit }, { status: 413 });

  const thumbnail = await storeThumbnail(`thumbnails/assets/${id}`, picked.file, picked.type, me.id, (v) => `/api/assets/${id}/thumbnail/${v}`);
  const db = await getDb();
  await db.update(s.assets).set({ thumbnail, updatedAt: new Date() }).where(eq(s.assets.id, id));
  await db.insert(s.activity).values({
    id: "ac" + crypto.randomUUID().slice(0, 10), userId: me.id, action: "changed the thumbnail of", type: "asset", itemId: id, label: asset.name, field: thumbnail.name,
  });
  // A clone made since keeps pointing at the old picture, so it stays while anything uses it.
  const old = asset.thumbnail?.key;
  if (old && !keyInUse(all, old, { assetId: id })) await removeStoredFile(old);
  return Response.json({ ok: true, thumbnail });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/assets/[id]/thumbnail">) {
  const { id } = await ctx.params;
  const g = await gate(id);
  if ("error" in g) return g.error;
  const { me, all, asset } = g;
  if (!asset.thumbnail) return Response.json({ ok: true });
  const db = await getDb();
  await db.update(s.assets).set({ thumbnail: null, updatedAt: new Date() }).where(eq(s.assets.id, id));
  await db.insert(s.activity).values({
    id: "ac" + crypto.randomUUID().slice(0, 10), userId: me.id, action: "reset the thumbnail of", type: "asset", itemId: id, label: asset.name, field: "",
  });
  const old = asset.thumbnail.key;
  if (old && !keyInUse(all, old, { assetId: id })) await removeStoredFile(old);
  return Response.json({ ok: true });
}
