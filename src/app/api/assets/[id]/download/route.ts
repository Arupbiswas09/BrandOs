import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { getViewer } from "@/server/session";
import { readStoredFile } from "@/server/storage";
import { ZIP_LIMIT_BYTES, zipNames, zipStream } from "@/server/zip";
import { parseSize } from "@/lib/upload-policy";

/** RFC 5987 value for filename*: percent-encoded UTF-8, including the characters encodeURIComponent leaves alone. */
const rfc5987 = (s: string) => encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Every uploaded file on an asset, as one zip named after the asset. Same checks as /api/files. */
export async function GET(_req: Request, ctx: RouteContext<"/api/assets/[id]/download">) {
  const { id } = await ctx.params;
  const me = await getViewer();
  if (!me) return new Response("Sign in first.", { status: 401 });
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  const asset = all.assets.find((a) => a.id === id);
  if (!asset || !vis.asset(asset.id)) return new Response("Not found.", { status: 404 });

  const stored = asset.files.filter((f): f is typeof f & { key: string } => !!f.key);
  if (!stored.length) return new Response("This asset has no uploaded files to download.", { status: 404 });
  const total = stored.reduce((n, f) => n + (f.bytes ?? parseSize(f.size)), 0);
  if (total > ZIP_LIMIT_BYTES) return new Response("These files are too big to zip together. Download them one at a time.", { status: 413 });

  const names = zipNames(stored.map((f) => f.name));
  // Files are read from storage one at a time as the zip is sent, so nothing big sits in memory.
  const body = zipStream(stored.map((f, i) => ({ name: names[i], open: () => readStoredFile(f.key) })));

  const base = asset.name.replace(/[\\/\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 150) || "asset";
  const ascii = base.replace(/[^\x20-\x7e]+/g, "_").replace(/["\\]/g, "_");
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${ascii}.zip"; filename*=UTF-8''${rfc5987(`${base}.zip`)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
