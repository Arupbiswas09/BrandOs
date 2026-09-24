"use server";

import { refresh } from "next/cache";
import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { can } from "@/lib/access";
import { qrPath } from "@/lib/qr";
import { authMode, currentSessionId, getViewer } from "@/server/session";
import { clearFailures, isThrottled, LIMITS, recordFailure } from "@/server/throttle";
import { hashRecoveryCode, isRecoveryShape, newRecoveryCodes, newSecret, otpauthUri, verifyTotp } from "@/server/totp";
import { enabledTwoFactor } from "@/server/two-factor";

/*
 * Account security: two-step verification and signed-in devices.
 * Everything here needs real sign-in (password mode); demo mode has no
 * passwords to protect.
 */

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

async function me() {
  if (authMode() !== "password") return null;
  return getViewer();
}

function newId(prefix: string) {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

/* ---------- Two-step verification ---------- */

export type TwoFactorSetup = { ok: true; secret: string; uri: string; qr: { d: string; size: number } } | Fail;

/** Starts set-up: a fresh secret that only counts once a code from it is confirmed. */
export async function beginTwoFactor(): Promise<TwoFactorSetup> {
  const u = await me();
  if (!u) return fail("You are signed out.");
  if (await enabledTwoFactor(u.id)) return fail("Two-step verification is already on.");
  const secret = newSecret();
  const db = await getDb();
  await db.insert(s.twoFactor).values({ userId: u.id, secret })
    .onConflictDoUpdate({ target: s.twoFactor.userId, set: { secret, enabledAt: null, recoveryCodes: [], lastStep: 0, createdAt: new Date() } });
  const uri = otpauthUri(secret, u.email ?? u.name);
  return { ok: true, secret, uri, qr: qrPath(uri) };
}

export type CodesResult = { ok: true; codes: string[] } | Fail;

/** Finishes set-up with the first code from the app, and hands out the recovery codes once. */
export async function confirmTwoFactor(code: string): Promise<CodesResult> {
  const u = await me();
  if (!u) return fail("You are signed out.");
  const key = "code:" + u.id;
  if (await isThrottled([[key, LIMITS.code]])) return fail("Too many wrong codes. Wait fifteen minutes and try again.");
  const db = await getDb();
  const [row] = await db.select().from(s.twoFactor).where(and(eq(s.twoFactor.userId, u.id), isNull(s.twoFactor.enabledAt))).limit(1);
  if (!row) return fail("Start again: set-up has expired or is already finished.");
  const step = verifyTotp(row.secret, code);
  if (step === null) {
    await recordFailure([key]);
    return fail("That code is not right. Make sure the time on your phone is set automatically.");
  }
  await clearFailures([key]);
  const codes = newRecoveryCodes();
  await db.update(s.twoFactor).set({ enabledAt: new Date(), lastStep: step, recoveryCodes: codes.map(hashRecoveryCode) }).where(eq(s.twoFactor.userId, u.id));
  refresh();
  return { ok: true, codes };
}

/** Checks a current code (or unused recovery code) before a change that weakens security. */
async function checkCode(userId: string, code: string): Promise<Fail | null> {
  const key = "code:" + userId;
  if (await isThrottled([[key, LIMITS.code]])) return fail("Too many wrong codes. Wait fifteen minutes and try again.");
  const tf = await enabledTwoFactor(userId);
  if (!tf) return fail("Two-step verification is not on.");
  const db = await getDb();
  if (isRecoveryShape(code)) {
    const h = hashRecoveryCode(code);
    if (tf.recoveryCodes.includes(h)) {
      await db.update(s.twoFactor).set({ recoveryCodes: tf.recoveryCodes.filter((c) => c !== h) }).where(eq(s.twoFactor.userId, userId));
      await clearFailures([key]);
      return null;
    }
  } else {
    const step = verifyTotp(tf.secret, code, tf.lastStep);
    if (step !== null) {
      await db.update(s.twoFactor).set({ lastStep: step }).where(eq(s.twoFactor.userId, userId));
      await clearFailures([key]);
      return null;
    }
  }
  await recordFailure([key]);
  return fail("That code is not right.");
}

export async function disableTwoFactor(code: string): Promise<{ ok: true } | Fail> {
  const u = await me();
  if (!u) return fail("You are signed out.");
  const bad = await checkCode(u.id, code);
  if (bad) return bad;
  const db = await getDb();
  await db.delete(s.twoFactor).where(eq(s.twoFactor.userId, u.id));
  refresh();
  return { ok: true };
}

/** New recovery codes; the old ones stop working. */
export async function regenerateRecoveryCodes(code: string): Promise<CodesResult> {
  const u = await me();
  if (!u) return fail("You are signed out.");
  const bad = await checkCode(u.id, code);
  if (bad) return bad;
  const codes = newRecoveryCodes();
  const db = await getDb();
  await db.update(s.twoFactor).set({ recoveryCodes: codes.map(hashRecoveryCode) }).where(eq(s.twoFactor.userId, u.id));
  refresh();
  return { ok: true, codes };
}

/* ---------- Signed-in devices ---------- */

/** Signs out one of your own sessions (not the one you are using). */
export async function revokeSession(id: string): Promise<{ ok: true } | Fail> {
  const u = await me();
  if (!u) return fail("You are signed out.");
  if (id === (await currentSessionId())) return fail("Use Sign out to end this session.");
  const db = await getDb();
  await db.delete(s.sessions).where(and(eq(s.sessions.id, id), eq(s.sessions.userId, u.id)));
  refresh();
  return { ok: true };
}

export async function revokeOtherSessions(): Promise<{ ok: true } | Fail> {
  const u = await me();
  if (!u) return fail("You are signed out.");
  const sid = await currentSessionId();
  if (!sid) return fail("You are signed out.");
  const db = await getDb();
  await db.delete(s.sessions).where(and(eq(s.sessions.userId, u.id), ne(s.sessions.id, sid)));
  refresh();
  return { ok: true };
}

/* ---------- Admin tools on the Team page ---------- */

async function adminTarget(userId: string) {
  const u = await me();
  if (!u) return { error: fail("You are signed out.") };
  if (!can(u, "access")) return { error: fail("Only admins can do that.") };
  const db = await getDb();
  const [target] = await db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(eq(s.users.id, userId)).limit(1);
  if (!target) return { error: fail("That person no longer exists.") };
  return { me: u, target, db };
}

/** For a teammate who lost their phone and their recovery codes. They can set it up again after signing in. */
export async function resetTeammateTwoFactor(userId: string): Promise<{ ok: true } | Fail> {
  const r = await adminTarget(userId);
  if ("error" in r) return r.error!;
  if (r.target.id === r.me.id) return fail("Turn off your own two-step verification in Settings.");
  await r.db.delete(s.twoFactor).where(eq(s.twoFactor.userId, userId));
  await r.db.insert(s.activity).values({ id: newId("ac"), userId: r.me.id, action: "reset two-step verification for", type: "person", itemId: userId, label: r.target.name });
  refresh();
  return { ok: true };
}

/** Ends every session a teammate has, on every device. */
export async function signOutTeammateEverywhere(userId: string): Promise<{ ok: true } | Fail> {
  const r = await adminTarget(userId);
  if ("error" in r) return r.error!;
  if (r.target.id === r.me.id) return fail("Use “Sign out everywhere else” in Settings.");
  await r.db.delete(s.sessions).where(eq(s.sessions.userId, userId));
  await r.db.insert(s.activity).values({ id: newId("ac"), userId: r.me.id, action: "signed out everywhere", type: "person", itemId: userId, label: r.target.name });
  refresh();
  return { ok: true };
}
