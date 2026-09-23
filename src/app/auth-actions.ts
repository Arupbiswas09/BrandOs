"use server";

import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb, schema as s } from "@/db";
import { can } from "@/lib/access";
import { hashPassword, verifyPassword } from "@/server/password";
import { authMode, endSession, getViewer, startSession } from "@/server/session";
import { appUrl, mailEnabled, sendMail } from "@/server/mail";

export type FormState = { error?: string; email?: string } | undefined;

// A small in-memory brake on password guessing. Per server instance, which is
// enough to stop a script; put a real limiter in front for anything public.
const attempts = new Map<string, { n: number; until: number }>();
function throttled(key: string) {
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now && a.n >= 5) return true;
  return false;
}
function recordFailure(key: string) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.until < now) attempts.set(key, { n: 1, until: now + 60_000 });
  else a.n += 1;
}

export async function signInWithPassword(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };
  if (throttled(email)) return { error: "Too many tries. Wait a minute and try again.", email };
  const db = await getDb();
  const [u] = await db.select().from(s.users).where(eq(s.users.email, email)).limit(1);
  const ok = await verifyPassword(password, u?.passwordHash);
  if (!u || !ok) {
    recordFailure(email);
    return { error: "That email and password do not match.", email };
  }
  attempts.delete(email);
  await endSession();
  await startSession(u.id);
  redirect("/");
}

/** Admins create a one-time link a teammate uses to set their password. */
export async function createInvite(userId: string): Promise<{ ok: true; path: string; emailed: boolean } | { ok: false; error: string }> {
  const me = await getViewer();
  if (!me || !can(me, "access")) return { ok: false, error: "Only admins can invite people." };
  const db = await getDb();
  const [u] = await db.select().from(s.users).where(eq(s.users.id, userId));
  if (!u) return { ok: false, error: "That person does not exist." };
  const token = randomBytes(24).toString("base64url");
  const purpose = u.passwordHash ? "reset" : "invite";
  await db.insert(s.invites).values({ token, userId, purpose, createdBy: me.id, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) });
  const path = `/invite/${token}`;
  let emailed = false;
  if (u.email && mailEnabled()) {
    emailed = await sendMail({
      to: u.email,
      subject: purpose === "invite" ? `${me.name} invited you to BrandOS` : "Set a new BrandOS password",
      heading: purpose === "invite" ? "You are invited to BrandOS" : "Set a new password",
      body: purpose === "invite"
        ? `${me.name} added you to the team. Choose a password to get in. The link works once and lasts a week.`
        : `${me.name} sent you a link to set a new password. It works once and lasts a week.`,
      action: { label: purpose === "invite" ? "Join the team" : "Set a new password", href: appUrl() + path },
    });
  }
  return { ok: true, path, emailed };
}

/**
 * "Forgot password". Always answers the same way whether or not the
 * address has an account, so it cannot be used to find out who works here.
 */
export async function requestReset(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "That email address does not look right.", email };
  if (!mailEnabled()) return { error: "Email is not set up on this BrandOS yet, so we cannot send a link. Ask an admin to send you a reset link from the Team page.", email };
  if (throttled("reset:" + email)) return { email: "sent" };
  recordFailure("reset:" + email);
  const db = await getDb();
  const [u] = await db.select().from(s.users).where(eq(s.users.email, email)).limit(1);
  if (u) {
    const token = randomBytes(24).toString("base64url");
    await db.insert(s.invites).values({ token, userId: u.id, purpose: "reset", expiresAt: new Date(Date.now() + 3600 * 1000) });
    await sendMail({
      to: email,
      subject: "Reset your BrandOS password",
      heading: "Reset your password",
      body: "Someone asked to reset the password for this address. If it was you, use the link below within an hour. If not, ignore this email and nothing changes.",
      action: { label: "Choose a new password", href: `${appUrl()}/invite/${token}` },
    });
  }
  return { email: "sent" };
}

export async function acceptInvite(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (password.length < 10) return { error: "Use at least ten characters.", email };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "That email address does not look right.", email };
  const db = await getDb();
  const [inv] = await db.select().from(s.invites)
    .where(and(eq(s.invites.token, token), isNull(s.invites.usedAt), gt(s.invites.expiresAt, new Date()))).limit(1);
  if (!inv) return { error: "This invite has expired or was already used. Ask for a new one.", email };
  const [clash] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, email));
  if (clash && clash.id !== inv.userId) return { error: "Someone already uses that email address.", email };
  await db.transaction(async (tx) => {
    await tx.update(s.users).set({ email, passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(s.users.id, inv.userId));
    await tx.update(s.invites).set({ usedAt: new Date() }).where(eq(s.invites.token, token));
    // A new password signs out every other device.
    await tx.delete(s.sessions).where(eq(s.sessions.userId, inv.userId));
  });
  await endSession();
  await startSession(inv.userId);
  redirect("/");
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const me = await getViewer();
  if (!me) return { error: "You are signed out." };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (authMode() === "password" && !(await verifyPassword(current, me.passwordHash))) return { error: "Your current password is not right." };
  if (next.length < 10) return { error: "Use at least ten characters." };
  const db = await getDb();
  await db.update(s.users).set({ passwordHash: await hashPassword(next) }).where(eq(s.users.id, me.id));
  return { error: undefined, email: "saved" };
}
