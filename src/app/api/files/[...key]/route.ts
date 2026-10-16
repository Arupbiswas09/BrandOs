import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { getViewer } from "@/server/session";
import { readStoredFile } from "@/server/storage";

/** Streams an uploaded file to someone who is allowed to see its asset. */
const PREVIEWABLE = /^image\/(png|jpe?g|gif|webp|avif)$/;

/** Even if a file is opened directly, nothing in it may run. */
const FILE_CSP = "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox";
/**
 * A PDF asked for inline (the Brand Kit's guidelines) opens in the browser's
 * own PDF viewer. Some browsers will not start it inside a sandboxed document
 * or one that forbids objects, so neither is set; it still loads nothing else
 * and may only be framed by BrandOS itself.
 */
const PDF_CSP = "default-src 'none'; object-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'";

export async function GET(req: Request, ctx: RouteContext<"/api/files/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.map(decodeURIComponent).join("/");
  const me = await getViewer();
  if (!me) return new Response("Sign in first.", { status: 401 });
  const [, assetId] = key.split("/");
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  const asset = all.assets.find((a) => a.id === assetId);
  const ref = asset?.files.find((f) => f.key === key);
  if (!asset || !ref || !vis.asset(asset.id)) return new Response("Not found.", { status: 404 });
  const file = await readStoredFile(key);
  if (!file) return new Response("The file is missing from storage.", { status: 404 });
  const body: BodyInit = Buffer.isBuffer(file.body) ? new Uint8Array(file.body) : (file.body as ReadableStream);
  const type = ref.type || "application/octet-stream";
  const asked = new URL(req.url).searchParams.get("inline") === "1";
  const pdf = asked && type === "application/pdf";
  return new Response(body, {
    headers: {
      "Content-Type": type,
      // Raster images and PDFs may render inline when asked; everything else downloads. SVG never renders (it can run script).
      "Content-Disposition": `${asked && (PREVIEWABLE.test(type) || pdf) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(ref.name)}`,
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": pdf ? PDF_CSP : FILE_CSP,
      ...(file.size ? { "Content-Length": String(file.size) } : {}),
    },
  });
}
