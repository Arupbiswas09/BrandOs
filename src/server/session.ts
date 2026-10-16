import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb, schema as s } from "@/db";
import type { ShareLink } from "@/db/schema";
import { sign, unsign } from "@/server/signed";
import { clientIp } from "@/server/throttle";

const COOKIE = "bos_session";
const THIRTY_DAYS = 30 * 24 * 3600 * 1000;
/** How stale "last active" may get before a request writes it again. */
const SEEN_EVERY = 5 * 60 * 1000;

export type AuthMode = "demo" | "password";

/**
 * Real passwords in production, the teammate picker everywhere else.
 * BRANDOS_AUTH=demo|password overrides either way.
 */
export function authMode(): AuthMode {
  const v = process.env.BRANDOS_AUTH;
  if (v === "password" || v === "demo") return v;
  return process.env.NODE_ENV === "production" ? "password" : "demo";
}

export const getViewer = cache(async () => {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (!sid) return null;
  const db = await getDb();
  const rows = await db
    .select({ user: s.users, lastSeenAt: s.sessions.lastSeenAt })
    .from(s.sessions)
    .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
    .where(and(eq(s.sessions.id, sid), gt(s.sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  // BrandOS is internal only: anyone still holding the old Client role is signed out.
  if (!row || !mayUseBrandOS(row.user)) return null;
  // "Last active" for the sessions list, written at most every five minutes.
  if (Date.now() - row.lastSeenAt.getTime() > SEEN_EVERY) {
    await db.update(s.sessions).set({ lastSeenAt: new Date() }).where(eq(s.sessions.id, sid));
  }
  return row.user;
});

/** The id of the session this request is signed in with, if any. */
export async function currentSessionId(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

export async function requireViewer() {
  const user = await getViewer();
  if (!user) redirect("/sign-in");
  return user;
}

/**
 * BrandOS is internal only. People who still have the old Client role keep
 * their records (what they wrote stays), but they cannot sign in: they are
 * shown as "No access" and every way in refuses them.
 */
export const mayUseBrandOS = (u: { access: string } | null | undefined) => !!u && u.access !== "Client";

/** Where a refused sign-in lands; the sign-in page explains it in plain words. */
export const NO_ACCESS_PATH = "/sign-in?error=no-access";

/**
 * Only callable from Server Actions or Route Handlers (it sets a cookie).
 * The last check before anyone gets a session, whichever way they signed in
 * (password, Google, an emailed code, an invite link, the demo picker).
 */
export async function startSession(userId: string) {
  const db = await getDb();
  const [who] = await db.select({ access: s.users.access }).from(s.users).where(eq(s.users.id, userId)).limit(1);
  if (!mayUseBrandOS(who)) {
    (await cookies()).delete(PENDING);
    redirect(NO_ACCESS_PATH);
  }
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + THIRTY_DAYS);
  const userAgent = ((await headers()).get("user-agent") ?? "").slice(0, 400);
  const ip = await clientIp();
  await db.insert(s.sessions).values({ id, userId, expiresAt, userAgent, ip });
  const jar = await cookies();
  jar.delete(PENDING);
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/*
 * Two-step sign-in. After the password (or Google) checks out for someone
 * with two-step verification on, they get this short-lived signed cookie
 * instead of a session. Only a correct code turns it into a session.
 */
const PENDING = "bos_2fa";
const PENDING_TTL = 5 * 60 * 1000;

export async function startPending(userId: string) {
  const jar = await cookies();
  jar.set(PENDING, sign({ uid: userId }, PENDING_TTL), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PENDING_TTL / 1000,
  });
}

/** Who is half-way through signing in on this browser, if anyone. */
export async function pendingUserId(): Promise<string | null> {
  const v = unsign<{ uid: string }>((await cookies()).get(PENDING)?.value);
  return typeof v?.uid === "string" ? v.uid : null;
}

export async function clearPending() {
  (await cookies()).delete(PENDING);
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
  const [recents, reads, feeds] = await Promise.all([
    db.select({ kind: s.recents.kind, itemId: s.recents.itemId })
      .from(s.recents).where(eq(s.recents.userId, userId))
      .orderBy(desc(s.recents.visitedAt)).limit(8),
    db.select({ commentId: s.reads.commentId }).from(s.reads).where(eq(s.reads.userId, userId)),
    db.select({ createdAt: s.calendarFeeds.createdAt, lastUsedAt: s.calendarFeeds.lastUsedAt }).from(s.calendarFeeds).where(eq(s.calendarFeeds.userId, userId)),
  ]);
  // Client share links are gone (BrandOS is internal only). The table stays, untouched; nothing reads it.
  const shareLinks: ShareLink[] = [];
  return { recents, readIds: new Set(reads.map((r) => r.commentId)), shareLinks, calendarFeed: feeds[0] ?? null };
}
