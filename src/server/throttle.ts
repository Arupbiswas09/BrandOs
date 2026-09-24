import "server-only";
import { headers } from "next/headers";
import { inArray, lt, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";

/*
 * A brake on password and code guessing, kept in the database so it
 * survives restarts and is shared by every server instance.
 *
 * Each key (an email, an IP, one person's two-step codes) counts failures in
 * a fixed 15-minute window. Once a key reaches its limit, tries are refused
 * until the window runs out.
 */

export const WINDOW_MS = 15 * 60 * 1000;

export const LIMITS = {
  /** Wrong passwords for one email address. */
  email: 5,
  /** Wrong passwords from one IP address, across every email. */
  ip: 20,
  /** Wrong two-step codes for one person. */
  code: 5,
  /** Password reset emails to one address. */
  reset: 5,
} as const;

export type Limit = [key: string, max: number];

/** True when any of the keys has used up its tries for this window. */
export async function isThrottled(limits: Limit[]): Promise<boolean> {
  const wanted = limits.filter(([k]) => k);
  if (!wanted.length) return false;
  const db = await getDb();
  const since = new Date(Date.now() - WINDOW_MS);
  const rows = await db.select().from(s.loginAttempts).where(inArray(s.loginAttempts.key, wanted.map(([k]) => k)));
  return rows.some((r) => r.windowStart > since && r.count >= (wanted.find(([k]) => k === r.key)?.[1] ?? Infinity));
}

/** Counts one failure against each key, starting a fresh window when the old one ran out. */
export async function recordFailure(keys: string[]) {
  const db = await getDb();
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_MS);
  for (const key of keys.filter(Boolean)) {
    const stale = sql`${s.loginAttempts.windowStart} < ${since.toISOString()}::timestamptz`;
    await db.insert(s.loginAttempts).values({ key, count: 1, windowStart: now }).onConflictDoUpdate({
      target: s.loginAttempts.key,
      set: {
        count: sql`case when ${stale} then 1 else ${s.loginAttempts.count} + 1 end`,
        windowStart: sql`case when ${stale} then ${now.toISOString()}::timestamptz else ${s.loginAttempts.windowStart} end`,
      },
    });
  }
  // Old counters are useless; sweep them now and then.
  if (Math.random() < 0.05) await db.delete(s.loginAttempts).where(lt(s.loginAttempts.windowStart, new Date(now.getTime() - 24 * 3600 * 1000)));
}

/** Forgets the failures for these keys (after a successful sign-in). */
export async function clearFailures(keys: string[]) {
  const wanted = keys.filter(Boolean);
  if (!wanted.length) return;
  const db = await getDb();
  await db.delete(s.loginAttempts).where(inArray(s.loginAttempts.key, wanted));
}

/** The caller's address as the proxy in front of the app reports it. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || h.get("x-real-ip")?.trim() || "").slice(0, 64);
}
