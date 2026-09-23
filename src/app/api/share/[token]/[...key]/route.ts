import { loadShare } from "@/server/share";
import { readStoredFile } from "@/server/storage";

/** Files on a client share page. Only files of cleared assets in that brand. */
export async function GET(_req: Request, ctx: RouteContext<"/api/share/[token]/[...key]">) {
  const { token, key: parts } = await ctx.params;
  const key = parts.map(decodeURIComponent).join("/");
  const data = await loadShare(token);
  if (!data) return new Response("This link has expired.", { status: 404 });
  const ref = data.assets.flatMap((a) => a.files).find((f) => f.key === key);
  if (!ref) return new Response("Not found.", { status: 404 });
  const file = await readStoredFile(key);
  if (!file) return new Response("The file is missing from storage.", { status: 404 });
  const body: BodyInit = Buffer.isBuffer(file.body) ? new Uint8Array(file.body) : (file.body as ReadableStream);
  return new Response(body, {
    headers: {
      "Content-Type": ref.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(ref.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
