import { readAll, makeVisibility, scopeFor } from "@/server/data";
import { getViewer } from "@/server/session";
import { serveThumbnail } from "@/server/thumbnails";

/**
 * Serves an asset's custom thumbnail to someone who can see the asset. The
 * last segment only makes each new picture a new address; whatever it says,
 * the current picture comes back.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/assets/[id]/thumbnail/[v]">) {
  const { id } = await ctx.params;
  const me = await getViewer();
  if (!me) return new Response("Sign in first.", { status: 401 });
  const all = await readAll();
  const vis = makeVisibility(all, scopeFor(all, me.id));
  const asset = all.assets.find((a) => a.id === id);
  if (!asset || !vis.asset(id)) return new Response("Not found.", { status: 404 });
  return serveThumbnail(req, asset.thumbnail);
}
