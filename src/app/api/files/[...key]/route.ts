import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { getViewer } from "@/server/session";
import { readStoredFile } from "@/server/storage";

/** Streams an uploaded file to someone who is allowed to see its asset. */
const PREVIEWABLE = /^image\/(png|jpe?g|gif|webp|avif)$/;

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
  return new Response(body, {
    headers: {
      "Content-Type": ref.type || "application/octet-stream",
      // Raster images may render inline for previews; everything else downloads. SVG never renders (it can run script).
      "Content-Disposition": `${new URL(req.url).searchParams.get("inline") === "1" && PREVIEWABLE.test(ref.type ?? "") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(ref.name)}`,
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      ...(file.size ? { "Content-Length": String(file.size) } : {}),
    },
  });
}
