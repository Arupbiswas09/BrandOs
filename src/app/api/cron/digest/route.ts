import { timingSafeEqual } from "node:crypto";
import { runDigest } from "@/server/notify";

export const dynamic = "force-dynamic";

/**
 * The morning digest. Call once a day with
 *   Authorization: Bearer $CRON_SECRET
 * (see docs/DEPLOY.md). Running it twice the same day sends nothing new.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ ok: false, error: "CRON_SECRET is not set, so the digest is switched off." }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return Response.json({ ok: false, error: "Not allowed." }, { status: 401 });
  }
  try {
    const r = await runDigest();
    return Response.json(r, { status: r.ok ? 200 : 500, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("digest failed", e);
    return Response.json({ ok: false, error: "The digest failed. See the server log." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
