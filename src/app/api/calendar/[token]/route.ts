import { feedFor } from "@/server/calendar";

export const dynamic = "force-dynamic";

/**
 * A person's private calendar feed: /api/calendar/<token>.ics
 * The token is the only credential, so unknown tokens get a plain 404.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/calendar/[token]">) {
  const { token } = await ctx.params;
  const ics = await feedFor(token.replace(/\.ics$/i, ""));
  if (!ics) return new Response("This calendar link does not exist or was turned off.", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="brandos.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
