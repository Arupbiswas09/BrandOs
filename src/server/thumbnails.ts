import "server-only";
import type { FileRef } from "@/db/schema";
import type { All } from "@/server/data";
import { humanSize, readStoredFile, saveFile } from "@/server/storage";
import { checkUpload } from "@/server/uploads";

/*
 * Custom thumbnails for asset cards and offer folders: one raster image each,
 * stored through the same storage layer as asset files but kept out of the
 * file list, and served only by the thumbnail routes (which check who asks).
 */

/** Raster images a browser shows inline. SVG is left out: it can carry script. */
const THUMB_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);
export const THUMB_TYPES_LABEL = "PNG, JPG, WebP, GIF or AVIF";

/** Whether the first bytes really are the image the extension says, so a renamed file cannot pose as one. */
function looksLike(type: string, b: Uint8Array) {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  const ascii = (i: number, s: string) => at(i, ...[...s].map((c) => c.charCodeAt(0)));
  switch (type) {
    case "image/png": return at(0, 0x89, 0x50, 0x4e, 0x47);
    case "image/jpeg": return at(0, 0xff, 0xd8, 0xff);
    case "image/gif": return ascii(0, "GIF8");
    case "image/webp": return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "image/avif": return ascii(4, "ftyp") && (ascii(8, "avif") || ascii(8, "avis") || ascii(8, "mif1"));
    default: return false;
  }
}

/** Which thumbnail type these bytes really are, judged by their first bytes alone, or null for anything else (SVG, HTML, broken files). */
export function sniffThumbnailType(b: Uint8Array): string | null {
  for (const type of THUMB_TYPES) if (looksLike(type, b)) return type;
  return null;
}

/** The one image in a thumbnail upload, or why it is refused. */
export async function readThumbnail(req: Request): Promise<{ ok: true; file: File; type: string } | { ok: false; error: string; status: number }> {
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, error: "No image came through.", status: 400 };
  if (files.length > 1) return { ok: false, error: "A thumbnail is one image. Send one at a time.", status: 400 };
  const file = files[0];
  const checked = checkUpload(file.name, file.type);
  if (!checked.ok) return { ok: false, error: checked.error, status: 415 };
  const refused = `Thumbnails can be ${THUMB_TYPES_LABEL} images.`;
  if (!THUMB_TYPES.has(checked.type)) return { ok: false, error: refused, status: 415 };
  if (!looksLike(checked.type, new Uint8Array(await file.slice(0, 16).arrayBuffer()))) {
    return { ok: false, error: `${file.name} is not a readable image. ${refused}`, status: 415 };
  }
  return { ok: true, file, type: checked.type };
}

/** Stores the image under `prefix` and returns its reference. `url` turns the version into the address it is served at. */
export async function storeThumbnail(prefix: string, file: File, type: string, userId: string, url: (version: string) => string): Promise<FileRef> {
  const version = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const clean = file.name.replace(/[^\w.\- ()]+/g, "_").slice(-80) || "thumbnail";
  const key = `${prefix}/${version}-${clean}`;
  await saveFile(key, file);
  return { name: file.name.slice(0, 200), size: humanSize(file.size), bytes: file.size, uploadedBy: userId, key, type, url: url(version) };
}

/** Whether any asset (its files or thumbnail) or folder other than `except` still points at this stored file. */
export function keyInUse(all: Pick<All, "assets" | "folders">, key: string, except: { assetId?: string; folderId?: string }) {
  return all.assets.some((a) => a.files.some((f) => f.key === key) || (a.id !== except.assetId && a.thumbnail?.key === key))
    || all.folders.some((f) => f.id !== except.folderId && f.thumbnail?.key === key);
}

/**
 * Streams a stored thumbnail. Always inline: only raster images are ever stored as one.
 * Browsers check back each time (so lost access is lost at once) and get a 304 while it is unchanged.
 */
export async function serveThumbnail(req: Request, ref: FileRef | null | undefined): Promise<Response> {
  if (!ref?.key || !ref.type || !THUMB_TYPES.has(ref.type)) return new Response("Not found.", { status: 404 });
  const etag = `"${ref.key.split("/").pop()?.split("-")[0] ?? "t"}"`;
  const cache = { "Cache-Control": "private, max-age=0, must-revalidate", ETag: etag };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: cache });
  const file = await readStoredFile(ref.key);
  if (!file) return new Response("The image is missing from storage.", { status: 404 });
  const body: BodyInit = Buffer.isBuffer(file.body) ? new Uint8Array(file.body) : (file.body as ReadableStream);
  return new Response(body, {
    headers: {
      ...cache,
      "Content-Type": ref.type,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(ref.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      ...(file.size ? { "Content-Length": String(file.size) } : {}),
    },
  });
}
