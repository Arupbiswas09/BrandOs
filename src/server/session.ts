import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb, schema as s } from "@/db";

const COOKIE = "bos_session";
const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

export type AuthMode = "demo" | "password";

/**
 * Demo mode lets anyone pick a teammate to sign in as, which is how the
 * prototype worked. Set BRANDOS_AUTH=password to require real sign-in.
 */
export function authMode(): AuthMode {
  return process.env.BRANDOS_AUTH === "password" ? "password" : "demo";
}

export const getViewer = cache(async () => {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (!sid) return null;
  const db = await getDb();
  const rows = await db
    .select({ user: s.users })
    .from(s.sessions)
    .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
    .where(and(eq(s.sessions.id, sid), gt(s.sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.user ?? null;
});

export async function requireViewer() {
  const user = await getViewer();
  if (!user) redirect("/sign-in");
  return user;
}

/** Only callable from Server Actions or Route Handlers (it sets a cookie). */
export async function startSession(userId: string) {
  const db = await getDb();
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + THIRTY_DAYS);
  await db.insert(s.sessions).values({ id, userId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (sid) {
    const db = await getDb();
    await db.delete(s.sessions).where(eq(s.sessions.id, sid));
  }
  jar.delete(COOKIE);
}

export async function viewerExtras(userId: string) {
  const db = await getDb();
  const [recents, reads] = await Promise.all([
    db.select({ kind: s.recents.kind, itemId: s.recents.itemId })
      .from(s.recents).where(eq(s.recents.userId, userId))
      .orderBy(desc(s.recents.visitedAt)).limit(8),
    db.select({ commentId: s.reads.commentId }).from(s.reads).where(eq(s.reads.userId, userId)),
  ]);
  return { recents, readIds: new Set(reads.map((r) => r.commentId)) };
}
