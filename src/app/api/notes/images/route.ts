import type { FileRef } from "@/db/schema";
import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { getViewer } from "@/server/session";
import { humanSize, saveFile, storageProblem } from "@/server/storage";
import { checkUpload } from "@/server/uploads";
import { getUploadPolicy, myLimits } from "@/server/limits";
import { checkBatch } from "@/lib/upload-policy";
import { MAX_NOTE_IMAGES, NOTE_IMAGE_HINT, isNoteImage, mayAddNoteImages, noteImagePrefix } from "@/lib/note-images";

/**
 * Stores the pictures for a note that is about to be posted or saved, on an
 * offer or asset the person can see and comment on. The note itself is
 * written by postComment or editComment, which only accept keys stored here
 * by the same person for the same item. Until then nobody can open them.
 */
export async function POST(req: Request) {
  const me = await getViewer();
  if (!me) return Response.json({ error: "You are signed out." }, { status: 401 });
  if (!mayAddNoteImages(me)) return Response.json({ error: "Your role does not allow pictures in notes. Ask an admin if you need it." }, { status: 403 });
  const problem = storageProblem();
  if (problem) return Response.json({ error: problem }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const kind = form?.get("kind");
  const itemId = form?.get("itemId");
  if ((kind !== "offer" && kind !== "asset") || typeof itemId !== "string" || !itemId) return Response.json({ error: "Say which offer or asset the note is on." }, { status: 400 });
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  if (!(kind === "offer" ? vis.offer(itemId) : vis.asset(itemId))) return Response.json({ error: "That is not here." }, { status: 404 });

  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return Response.json({ error: "No picture came through." }, { status: 400 });
  if (files.length > MAX_NOTE_IMAGES) return Response.json({ error: `A note holds up to ${MAX_NOTE_IMAGES} pictures.` }, { status: 400 });
  // Pictures only, checked by extension and claimed type like every upload, and stored with the type from our own list.
  const checked = files.map((f) => ({ f, c: checkUpload(f.name, f.type) }));
  for (const { f, c } of checked) {
    if (!c.ok) return Response.json({ error: c.error }, { status: 415 });
    if (!isNoteImage({ name: f.name, type: c.type })) return Response.json({ error: `${f.name} is not a picture. Notes take ${NOTE_IMAGE_HINT}.` }, { status: 415 });
  }
  // The same size limits and storage allowance as any other upload.
  const limit = checkBatch(files.map((f) => ({ name: f.name, size: f.size })), myLimits(all, await getUploadPolicy(), me));
  if (limit) return Response.json({ error: limit }, { status: 413 });

  const prefix = noteImagePrefix(kind, itemId, me.id);
  const added: FileRef[] = [];
  for (const { f, c } of checked) {
    const clean = f.name.replace(/[^\w.\- ()]+/g, "_").slice(-120) || "picture.png";
    const key = `${prefix}${crypto.randomUUID().slice(0, 8)}-${clean}`;
    await saveFile(key, f);
    added.push({ name: f.name.slice(0, 300), size: humanSize(f.size), bytes: f.size, uploadedBy: me.id, key, type: c.ok ? c.type : "image/png", url: `/api/files/${key}` });
  }
  return Response.json({ ok: true, files: added });
}
