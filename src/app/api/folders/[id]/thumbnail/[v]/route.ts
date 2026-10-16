import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { getViewer } from "@/server/session";
import { serveThumbnail } from "@/server/thumbnails";

/** Serves a folder's custom thumbnail to someone who can see its offer. The last segment only makes each picture a new address. */
export async function GET(req: Request, ctx: RouteContext<"/api/folders/[id]/thumbnail/[v]">) {
  const { id } = await ctx.params;
  const me = await getViewer();
  if (!me) return new Response("Sign in first.", { status: 401 });
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  const folder = all.folders.find((f) => f.id === id);
  if (!folder || !vis.offer(folder.offerId)) return new Response("Not found.", { status: 404 });
  return serveThumbnail(req, folder.thumbnail);
}
