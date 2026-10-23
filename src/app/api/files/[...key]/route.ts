import type { FileRef } from "@/db/schema";
import { readAll, makeVisibility, scopeFor, type All } from "@/server/data";
import { getViewer } from "@/server/session";
import { readStoredFile } from "@/server/storage";
import { parseRange, readStoredRange, storedSize } from "@/server/stored-range";
import { noteImageOwner } from "@/lib/note-images";
import { clientFileByKey } from "@/lib/client-files";

/** Streams an uploaded file to someone who is allowed to see its asset. */
const PREVIEWABLE = /^image\/(png|jpe?g|gif|webp|avif)$/;
/** Played in the page, so served as byte ranges: seeking works and Safari plays it at all. */
const MEDIA = /^(video|audio)\//;

/** Even if a file is opened directly, nothing in it may run. */
const FILE_CSP = "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox";
/**
 * A PDF asked for inline (the Brand Kit's guidelines) opens in the browser's
 * own PDF viewer. Some browsers will not start it inside a sandboxed document
 * or one that forbids objects, so neither is set; it still loads nothing else
 * and may only be framed by BrandOS itself.
 */
const PDF_CSP = "default-src 'none'; object-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'";

/**
 * The file behind a key, if this person may have it: one of the asset's
 * files now, or an earlier version kept when it was replaced. Either way the
 * asset has to be one they can see. Note pictures and client files follow
 * the note's item and the client.
 */
function findFile(all: All, vis: ReturnType<typeof makeVisibility>, key: string): FileRef | null {
  // A picture in a note: anyone who can see the note's offer or asset, while a note still shows it.
  if (key.startsWith("notes/")) {
    const owner = noteImageOwner(key);
    if (!owner) return null;
    const note = all.comments.find((c) => c.kind === owner.kind && c.itemId === owner.itemId && (c.images ?? []).some((i) => i.key === key));
    if (!note || !(note.kind === "offer" ? vis.offer(note.itemId) : vis.asset(note.itemId))) return null;
    return note.images.find((i) => i.key === key) ?? null;
  }
  // A file on a client's page, current or an earlier version: anyone who can see the client.
  if (key.startsWith("clients/")) {
    const [, clientId] = key.split("/");
    const client = all.clients.find((c) => c.id === clientId);
    if (!client || !vis.client(client.id)) return null;
    return clientFileByKey(client.files ?? [], key);
  }
  const [, assetId] = key.split("/");
  const asset = all.assets.find((a) => a.id === assetId);
  const current = asset?.files.find((f) => f.key === key);
  if (asset && current) return vis.asset(asset.id) ? current : null;
  const earlier = all.fileVersions.find((v) => v.file.key === key && vis.asset(v.assetId));
  return earlier?.file ?? null;
}

export async function GET(req: Request, ctx: RouteContext<"/api/files/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.map(decodeURIComponent).join("/");
  const me = await getViewer();
  if (!me) return new Response("Sign in first.", { status: 401 });
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  const ref = findFile(all, vis, key);
  if (!ref) return new Response("Not found.", { status: 404 });
  const type = ref.type || "application/octet-stream";
  const asked = new URL(req.url).searchParams.get("inline") === "1";
  const pdf = asked && type === "application/pdf";
  const headers: Record<string, string> = {
    "Content-Type": type,
    // Raster images and PDFs may render inline when asked; everything else downloads. SVG never renders (it can run script).
    "Content-Disposition": `${asked && (PREVIEWABLE.test(type) || pdf) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(ref.name)}`,
    "Cache-Control": "private, max-age=0, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": pdf ? PDF_CSP : FILE_CSP,
  };

  if (MEDIA.test(type)) return serveMedia(req, key, headers);

  const file = await readStoredFile(key);
  if (!file) return new Response("The file is missing from storage.", { status: 404 });
  const body: BodyInit = Buffer.isBuffer(file.body) ? new Uint8Array(file.body) : (file.body as ReadableStream);
  return new Response(body, { headers: { ...headers, ...(file.size ? { "Content-Length": String(file.size) } : {}) } });
}

/** Video and audio, whole or one byte range (206), streamed from storage. */
async function serveMedia(req: Request, key: string, headers: Record<string, string>): Promise<Response> {
  const size = await storedSize(key);
  if (size === null) return new Response("The file is missing from storage.", { status: 404 });
  const base = { ...headers, "Accept-Ranges": "bytes" };
  if (size === 0) return new Response(null, { headers: { ...base, "Content-Length": "0" } });
  // No validators are sent, so a conditional range cannot be confirmed: the whole file it is.
  const range = req.headers.get("if-range") ? null : parseRange(req.headers.get("range"), size);
  if (range === "unsatisfiable") return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const part = await readStoredRange(key, start, end);
  if (!part) return new Response("The file is missing from storage.", { status: 404 });
  if (!range || !part.partial) return new Response(part.body, { headers: { ...base, "Content-Length": String(size) } });
  return new Response(part.body, {
    status: 206,
    headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
  });
}
