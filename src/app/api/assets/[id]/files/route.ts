import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { can, canChange } from "@/lib/access";
import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { getViewer } from "@/server/session";
import { humanSize, saveFile, storageProblem } from "@/server/storage";
import { checkUpload } from "@/server/uploads";
import { getUploadPolicy, myLimits } from "@/server/limits";
import { checkBatch } from "@/lib/upload-policy";

export async function POST(req: Request, ctx: RouteContext<"/api/assets/[id]/files">) {
  const { id } = await ctx.params;
  const me = await getViewer();
  if (!me) return Response.json({ error: "You are signed out." }, { status: 401 });
  const problem = storageProblem();
  if (problem) return Response.json({ error: problem }, { status: 503 });
  if (!can(me, "upload")) return Response.json({ error: "Uploading is switched off for you. Ask an admin if you need it." }, { status: 403 });
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  const asset = all.assets.find((a) => a.id === id);
  if (!asset || !vis.asset(id)) return Response.json({ error: "That asset is not here." }, { status: 404 });
  if (!canChange(me, asset)) return Response.json({ error: "Contributors can only upload to work they own." }, { status: 403 });
  if (!asset.brandId && !can(me, "library")) return Response.json({ error: "Only managers and admins can change the Global Library." }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return Response.json({ error: "No file came through." }, { status: 400 });
  // Check every file before storing any, so a refused file does not leave half an upload behind.
  const checked = files.map((f) => ({ f, c: checkUpload(f.name, f.type) }));
  const refused = checked.find((x) => !x.c.ok);
  if (refused && !refused.c.ok) return Response.json({ error: refused.c.error }, { status: 415 });
  // Sizes, kinds, files per upload and storage allowances, as set in Team and access → Limits.
  const limit = checkBatch(files.map((f) => ({ name: f.name, size: f.size })), myLimits(all, await getUploadPolicy(), me));
  if (limit) return Response.json({ error: limit }, { status: 413 });

  const added = [];
  for (const { f, c } of checked) {
    const clean = f.name.replace(/[^\w.\- ()]+/g, "_").slice(-120) || "file";
    const key = `assets/${id}/${crypto.randomUUID().slice(0, 8)}-${clean}`;
    await saveFile(key, f);
    added.push({ name: f.name.slice(0, 300), size: humanSize(f.size), bytes: f.size, uploadedBy: me.id, key, type: c.ok ? c.type : "application/octet-stream", url: `/api/files/${key}` });
  }
  // Same file name again replaces the older entry rather than listing it twice.
  const names = new Set(added.map((x) => x.name));
  const next = [...asset.files.filter((x) => !names.has(x.name)), ...added];
  const db = await getDb();
  await db.update(s.assets).set({ files: next, updatedAt: new Date() }).where(eq(s.assets.id, id));
  await db.insert(s.activity).values({
    id: "ac" + crypto.randomUUID().slice(0, 10), userId: me.id, action: "uploaded to", type: "asset", itemId: id, label: asset.name,
    field: added.length === 1 ? added[0].name : `${added.length} files`,
  });
  return Response.json({ ok: true, files: added });
}
