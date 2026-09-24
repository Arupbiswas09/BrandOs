import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import pkg from "../../../../package.json";

export const dynamic = "force-dynamic";

/** The build that is running: a git SHA when the host provides one, otherwise the package version. */
function version() {
  const sha = process.env.GIT_SHA || process.env.SOURCE_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || "";
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 12) : pkg.version;
}

/**
 * For uptime checks and load balancers: 200 when the database answers, 503
 * when it does not. Says nothing about configuration, errors or secrets.
 */
export async function GET() {
  let db = false;
  try {
    const conn = await getDb();
    await conn.execute(sql`select 1`);
    db = true;
  } catch {
    db = false;
  }
  return Response.json(
    { ok: db, db: db ? "up" : "down", version: version(), uptime: Math.round(process.uptime()) },
    { status: db ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
