import { timingSafeEqual } from "node:crypto";
import { runLinkChecks } from "@/server/link-check";

export const dynamic = "force-dynamic";

/**
 * The daily link check. Call once a day with
 *   Authorization: Bearer $CRON_SECRET
 * (see docs/DEPLOY.md). Links checked in the last 20 hours are skipped, so
 * running it twice is harmless; a run stops starting new checks after four
 * minutes and leaves the rest for the next one (`remaining`).
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ ok: false, error: "CRON_SECRET is not set, so the link check is switched off." }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return Response.json({ ok: false, error: "Not allowed." }, { status: 401 });
  }
  try {
    const r = await runLinkChecks();
    return Response.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("link check failed", e);
    return Response.json({ ok: false, error: "The link check failed. See the server log." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
