import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { getViewer } from "@/server/session";
import { readStoredFile } from "@/server/storage";

/** Streams an uploaded file to someone who is allowed to see its asset. */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[...key]">) {
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
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(ref.name)}`,
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      ...(file.size ? { "Content-Length": String(file.size) } : {}),
    },
  });
}
