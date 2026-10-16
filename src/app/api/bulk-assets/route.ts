import { and, desc, eq, gte, like } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import type { FileRef } from "@/db/schema";
import { can, canChange } from "@/lib/access";
import { ASSET_TYPES } from "@/lib/constants";
import { AUTO_TYPE, tidyName, typeForFile } from "@/lib/files";
import { checkBatch } from "@/lib/upload-policy";
import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { getUploadPolicy, myLimits } from "@/server/limits";
import { getViewer } from "@/server/session";
import { humanSize, removeStoredFile, saveFile, storageProblem } from "@/server/storage";
import { checkUpload } from "@/server/uploads";

/*
 * Many files in, one asset per file. Each file becomes a draft asset owned
 * by the uploader, named after the file, with that file attached; on an
 * offer page it is linked to the offer (and filed in the folder it was
 * dropped into). Same rules as uploading to one asset: allowed to edit and
 * upload, can see the brand and offer, the file types and limits in Team and
 * access → Limits, all checked before anything is stored.
 *
 * The browser sends big drops in several requests of at most the "files per
 * upload" limit; `continues=1` adds a request's assets to the same line in
 * the activity feed ("added 30 assets to …").
 */

const json = (body: unknown, status = 200) => Response.json(body, { status });
const newId = (prefix: string) => prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);

const fieldsSchema = z.object({
  brandId: z.string().max(60),
  offerId: z.string().max(60),
  folderId: z.string().max(60),
  type: z.string().max(60).refine((t) => t === AUTO_TYPE || t in ASSET_TYPES, "Pick what kind of assets these are."),
  continues: z.enum(["", "1"]),
});
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

/** The activity line merges requests of one drop that land within this long of each other. */
const SAME_DROP_MS = 15 * 60_000;
const ADDED = /^added (\d+) assets? to$/;

export async function POST(req: Request) {
  const me = await getViewer();
  if (!me) return json({ error: "You are signed out." }, 401);
  const problem = storageProblem();
  if (problem) return json({ error: problem }, 503);
  if (!can(me, "edit")) return json({ error: "Your role does not allow adding assets. Ask an admin if you need it." }, 403);
  if (!can(me, "upload")) return json({ error: "Uploading is switched off for you. Ask an admin if you need it." }, 403);

  const form = await req.formData().catch(() => null);
  if (!form) return json({ error: "No file came through." }, 400);
  const parsed = fieldsSchema.safeParse({
    brandId: text(form.get("brandId")), offerId: text(form.get("offerId")), folderId: text(form.get("folderId")),
    type: text(form.get("type")) || AUTO_TYPE, continues: text(form.get("continues")),
  });
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Something in the upload is not right." }, 400);
  const f = parsed.data;
  const files = [...form.getAll("files"), ...form.getAll("files[]")].filter((x): x is File => x instanceof File && x.size > 0);
  if (!files.length) return json({ error: "No file came through." }, 400);
  // Names chosen in the browser, one per file in the same order. Blank or missing means "from the file name".
  const names = [...form.getAll("names"), ...form.getAll("names[]")].map((v) => (typeof v === "string" ? v.trim().slice(0, 200) : ""));
  if (names.length && names.length !== files.length) return json({ error: "The names and files did not match up. Try again." }, 400);

  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  const brandId = f.brandId || null;
  const brand = brandId ? all.brands.find((b) => b.id === brandId) : null;
  if (brandId && (!brand || !vis.brand(brandId))) return json({ error: "That brand is not here." }, 404);
  if (!brandId && !can(me, "library")) return json({ error: "Only managers and admins can add to the Global Library." }, 403);
  const offer = f.offerId ? all.offers.find((o) => o.id === f.offerId) : null;
  if (f.offerId) {
    if (!offer || !vis.offer(offer.id)) return json({ error: "That offer is not here any more." }, 404);
    if (brandId && offer.brandId !== brandId) return json({ error: "Assets can only be linked to offers in their own brand." }, 400);
    if (!canChange(me, offer)) return json({ error: "Contributors can only add to offers they own. Ask its owner or an editor." }, 403);
  }
  const folder = f.folderId ? all.folders.find((x) => x.id === f.folderId && x.offerId === offer?.id) : null;
  if (f.folderId && !folder) return json({ error: "That folder is not here any more." }, 404);

  // Check every file before storing any, so a refused file does not leave half an upload behind.
  const checked = files.map((file) => ({ file, c: checkUpload(file.name, file.type) }));
  const refused = checked.find((x) => !x.c.ok);
  if (refused && !refused.c.ok) return json({ error: refused.c.error }, 415);
  const limit = checkBatch(files.map((x) => ({ name: x.name, size: x.size })), myLimits(all, await getUploadPolicy(), me));
  if (limit) return json({ error: limit }, 413);

  const made: { id: string; name: string; type: string; file: FileRef }[] = [];
  const stored: string[] = [];
  try {
    for (const [i, { file, c }] of checked.entries()) {
      const id = newId("as");
      const clean = file.name.replace(/[^\w.\- ()]+/g, "_").slice(-120) || "file";
      const key = `assets/${id}/${crypto.randomUUID().slice(0, 8)}-${clean}`;
      await saveFile(key, file);
      stored.push(key);
      const stype = c.ok ? c.type : "application/octet-stream";
      made.push({
        id,
        name: names[i] || tidyName(file.name),
        type: f.type === AUTO_TYPE ? typeForFile({ name: file.name, type: stype }, !brandId) : f.type,
        file: { name: file.name.slice(0, 300), size: humanSize(file.size), bytes: file.size, uploadedBy: me.id, key, type: stype, url: `/api/files/${key}` },
      });
    }
    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx.insert(s.assets).values(made.map((m) => ({
        id: m.id, brandId, name: m.name, type: m.type, status: "Draft" as const, ownerId: me.id, files: [m.file],
        isTemplate: m.type === "Template",
        items: m.type === "Checklist" ? [] : null,
        // As when one asset is added: library reference material needs no review.
        ...(ASSET_TYPES[m.type]?.cat === "global" && !brandId && { review: "Approved" as const }),
      })));
      if (offer) {
        await tx.insert(s.links).values(made.map((m) => ({ id: newId("lk"), assetId: m.id, offerId: offer.id, folderId: folder?.id ?? null, createdBy: me.id })));
      }
      // One line in the activity feed for the whole drop.
      const target = offer
        ? { type: "offer", itemId: offer.id, label: offer.name, field: folder ? `${folder.name} folder` : "" }
        : brand
          ? { type: "brand", itemId: brand.id, label: brand.name, field: "" }
          : { type: "library", itemId: "library", label: "Global Library", field: "" };
      const [last] = f.continues
        ? await tx.select().from(s.activity).where(and(
          eq(s.activity.userId, me.id), eq(s.activity.type, target.type), eq(s.activity.itemId, target.itemId),
          like(s.activity.action, "added % to"), gte(s.activity.createdAt, new Date(Date.now() - SAME_DROP_MS)),
        )).orderBy(desc(s.activity.createdAt)).limit(1)
        : [];
      const before = Number(ADDED.exec(last?.action ?? "")?.[1] ?? 0);
      const n = before + made.length;
      const action = `added ${n} asset${n === 1 ? "" : "s"} to`;
      if (last && before) await tx.update(s.activity).set({ action, createdAt: new Date() }).where(eq(s.activity.id, last.id));
      else await tx.insert(s.activity).values({ id: newId("ac"), userId: me.id, action, ...target });
    });
  } catch (e) {
    // Nothing half-made stays behind: the files go again if the assets could not be written.
    for (const k of stored) await removeStoredFile(k);
    console.error(e);
    return json({ error: "The files did not save. Try again in a moment." }, 500);
  }
  return json({ ok: true, ids: made.map((m) => m.id), assets: made.map((m) => ({ id: m.id, name: m.name, type: m.type, file: m.file })) });
}
