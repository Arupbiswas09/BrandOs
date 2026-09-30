import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { keyedHash } from "@/server/signed";

/*
 * "Email me a sign-in code": a six-digit code that proves the person can read
 * their inbox. It is a first factor like a password, so anyone with two-step
 * verification on still enters their authenticator code afterwards.
 */

export const CODE_TTL_MS = 10 * 60 * 1000;
/** Wrong guesses one code survives before it is thrown away. */
export const CODE_TRIES = 5;

const hashFor = (userId: string, code: string) => keyedHash(`sign-in-code:${userId}:${code}`);

/** Makes a fresh code for this person, replacing any earlier one, and returns it for the email. */
export async function issueCode(userId: string): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const db = await getDb();
  const row = { codeHash: hashFor(userId, code), attempts: 0, expiresAt: new Date(Date.now() + CODE_TTL_MS), createdAt: new Date() };
  await db.insert(s.signInCodes).values({ userId, ...row }).onConflictDoUpdate({ target: s.signInCodes.userId, set: row });
  return code;
}

/**
 * Checks a typed code. A right code is used up; a wrong one counts against
 * the code, which stops working after five misses or ten minutes.
 */
export async function redeemCode(userId: string, typed: string): Promise<"ok" | "wrong" | "expired"> {
  const db = await getDb();
  const [row] = await db.select().from(s.signInCodes).where(eq(s.signInCodes.userId, userId)).limit(1);
  if (!row || row.expiresAt <= new Date() || row.attempts >= CODE_TRIES) {
    if (row) await db.delete(s.signInCodes).where(eq(s.signInCodes.userId, userId));
    return "expired";
  }
  const want = Buffer.from(row.codeHash);
  const got = Buffer.from(hashFor(userId, typed));
  if (want.length === got.length && timingSafeEqual(want, got)) {
    await db.delete(s.signInCodes).where(eq(s.signInCodes.userId, userId));
    return "ok";
  }
  await db.update(s.signInCodes).set({ attempts: row.attempts + 1 }).where(eq(s.signInCodes.userId, userId));
  return "wrong";
}
