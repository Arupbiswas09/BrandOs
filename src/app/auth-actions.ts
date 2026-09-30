"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb, schema as s } from "@/db";
import { can } from "@/lib/access";
import { hashPassword, verifyPassword } from "@/server/password";
import { authMode, clearPending, currentSessionId, endSession, getViewer, pendingUserId, startSession } from "@/server/session";
import { clearFailures, clientIp, isThrottled, LIMITS, recordFailure, type Limit } from "@/server/throttle";
import { hashRecoveryCode, isRecoveryShape, verifyTotp } from "@/server/totp";
import { afterFirstFactor, enabledTwoFactor } from "@/server/two-factor";
import { appUrl, deliver, mailEnabled, sendMail } from "@/server/mail";
import { CODE_TTL_MS, issueCode, redeemCode } from "@/server/sign-in-code";
import { recordSecurity } from "@/server/audit";
import { BREACHED_MESSAGE, isBreachedPassword } from "@/server/pwned";
import { EV } from "@/lib/audit";

export type FormState = { error?: string; email?: string } | undefined;

/** Password sign-in. Failures count per email and per IP, in the database (see server/throttle). */
export async function signInWithPassword(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };
  const ip = await clientIp();
  const keys: Limit[] = [["email:" + email, LIMITS.email], [ip && "ip:" + ip, LIMITS.ip]];
  // Not logged while throttled, so a script cannot flood the audit log for one address.
  if (await isThrottled(keys)) return { error: "Too many tries. Wait fifteen minutes and try again, or reset your password.", email };
  const db = await getDb();
  const [u] = await db.select().from(s.users).where(eq(s.users.email, email)).limit(1);
  const ok = await verifyPassword(password, u?.passwordHash);
  if (!u || !ok) {
    await recordFailure(keys.map(([k]) => k));
    // The email only, never what was typed as the password.
    await recordSecurity({
      userId: u?.id, action: EV.signInFailed, label: email.slice(0, 200),
      field: !u ? "no account with that email" : u.passwordHash ? "wrong password" : "no password set yet", withIp: true,
    });
    return { error: "That email and password do not match.", email };
  }
  await clearFailures(["email:" + email]);
  redirect(await afterFirstFactor(u.id));
}

/** The second step: a six-digit code from the authenticator app, or a recovery code. */
export async function verifySecondStep(_: FormState, form: FormData): Promise<FormState> {
  const uid = await pendingUserId();
  if (!uid) return { error: "That took too long. Go back and sign in again.", email: "expired" };
  const code = String(form.get("code") ?? "").trim();
  if (!code) return { error: "Enter the code from your authenticator app." };
  const key = "code:" + uid;
  if (await isThrottled([[key, LIMITS.code]])) return { error: "Too many wrong codes. Wait fifteen minutes and try again." };
  const tf = await enabledTwoFactor(uid);
  if (!tf) {
    // Two-step was switched off meanwhile (an admin reset it); the first step already passed.
    await endSession();
    await startSession(uid);
    redirect("/");
  }
  const db = await getDb();
  let ok = false;
  if (isRecoveryShape(code)) {
    const h = hashRecoveryCode(code);
    if (tf.recoveryCodes.includes(h)) {
      await db.update(s.twoFactor).set({ recoveryCodes: tf.recoveryCodes.filter((c) => c !== h) }).where(eq(s.twoFactor.userId, uid));
      ok = true;
    }
  } else {
    const step = verifyTotp(tf.secret, code, tf.lastStep);
    if (step !== null) {
      await db.update(s.twoFactor).set({ lastStep: step }).where(eq(s.twoFactor.userId, uid));
      ok = true;
    }
  }
  if (!ok) {
    await recordFailure([key]);
    return { error: "That code is not right. Check the time on your phone, or use a recovery code." };
  }
  await clearFailures([key]);
  await clearPending();
  await endSession();
  await startSession(uid);
  await recordSecurity({ userId: uid, action: EV.signedIn, field: "two-step code", withIp: true });
  redirect("/");
}

export type CodeState = { error?: string; email?: string; sent?: boolean; note?: string } | undefined;

const looksLikeEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v);

/**
 * "Email me a sign-in code". Answers the same way whether or not the address
 * has an account, so it cannot be used to find out who works here.
 */
async function requestSignInCode(form: FormData): Promise<CodeState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!looksLikeEmail(email)) return { error: "That email address does not look right.", email };
  if (!mailEnabled()) return { error: "Email is not set up on this BrandOS yet, so we cannot send a code. Sign in with your password.", email };
  const ip = await clientIp();
  const keys: Limit[] = [["codemail:" + email, LIMITS.codeMail], [ip && "codemail-ip:" + ip, LIMITS.ip]];
  if (await isThrottled(keys)) return { error: "We have sent several codes already. Use the newest one, or wait fifteen minutes and ask again.", email, sent: true };
  await recordFailure(keys.map(([k]) => k));
  const db = await getDb();
  const [u] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, email)).limit(1);
  await recordSecurity({ userId: u?.id, action: EV.codeRequested, label: email.slice(0, 200), field: u ? "code emailed" : "no account with that email", withIp: true });
  // After the answer is sent, so a known address takes no longer to answer than an unknown one.
  if (u) after(async () => {
    const code = await issueCode(u.id);
    await sendMail({
      to: email,
      subject: "Your BrandOS sign-in code",
      heading: "Your sign-in code",
      body: `Enter this code on the sign-in page. It works once and for ${CODE_TTL_MS / 60000} minutes. If you did not ask for it, ignore this email: nobody can get in without the code.`,
      code,
      footer: "Never share this code. BrandOS will never ask you for it.",
    });
  });
  return { email, sent: true };
}

/** The code from the email. People with two-step verification go on to the authenticator step. */
async function verifySignInCode(form: FormData): Promise<CodeState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  if (!looksLikeEmail(email)) return { error: "Start again and enter your email address.", sent: false };
  if (code.length !== 6) return { error: "The code is six digits.", email, sent: true };
  const ip = await clientIp();
  const keys: Limit[] = [["codein:" + email, LIMITS.codeGuess], [ip && "ip:" + ip, LIMITS.ip]];
  if (await isThrottled(keys)) return { error: "Too many wrong codes. Wait fifteen minutes and try again.", email, sent: true };
  const db = await getDb();
  const [u] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, email)).limit(1);
  const result = u ? await redeemCode(u.id, code) : "wrong";
  if (result !== "ok") {
    await recordFailure(keys.map(([k]) => k));
    await recordSecurity({ userId: u?.id, action: EV.signInFailed, label: email.slice(0, 200), field: !u ? "no account with that email" : result === "expired" ? "expired email code" : "wrong email code", withIp: true });
    return {
      error: result === "expired" ? "That code has expired or was used up. Send a new one." : "That code is not right. Check the newest email from BrandOS.",
      email, sent: true,
    };
  }
  await clearFailures(["codein:" + email, "codemail:" + email, "email:" + email]);
  redirect(await afterFirstFactor(u!.id, "email code"));
}

/** One action for both steps of the code sign-in, so the form keeps a single state. */
export async function codeSignIn(_: CodeState, form: FormData): Promise<CodeState> {
  return form.get("intent") === "verify" ? verifySignInCode(form) : requestSignInCode(form);
}

/** Admins check the email settings by sending themselves one. */
export async function sendTestEmail(): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const me = await getViewer();
  if (!me || !can(me, "access")) return { ok: false, error: "Only admins can send a test email." };
  if (!me.email) return { ok: false, error: "Your account has no email address." };
  if (!mailEnabled()) return { ok: false, error: "Email is not set up on this server yet (SMTP_HOST or RESEND_API_KEY)." };
  const r = await deliver({
    to: me.email,
    subject: "BrandOS test email",
    heading: "Email works",
    body: `This is the test you sent from Settings. Invites, password resets, sign-in codes and notifications will arrive the same way.`,
    action: { label: "Open BrandOS", href: appUrl() },
  });
  await recordSecurity({ userId: me.id, action: EV.testEmail, label: me.email, field: r.ok ? "accepted" : "failed", withIp: true });
  return r.ok ? { ok: true, to: me.email } : { ok: false, error: r.error };
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
  await recordSecurity({ userId: me.id, action: purpose === "invite" ? EV.inviteLink : EV.resetLink, itemId: u.id, label: u.name });
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
  if (await isThrottled([["reset:" + email, LIMITS.reset]])) return { email: "sent" };
  await recordFailure(["reset:" + email]);
  const db = await getDb();
  const [u] = await db.select().from(s.users).where(eq(s.users.email, email)).limit(1);
  await recordSecurity({ userId: u?.id, action: EV.resetRequested, label: email.slice(0, 200), field: u ? "link emailed" : "no account with that email", withIp: true });
  // After the answer is sent, so a known address takes no longer to answer than an unknown one.
  if (u) after(async () => {
    const token = randomBytes(24).toString("base64url");
    await db.insert(s.invites).values({ token, userId: u.id, purpose: "reset", expiresAt: new Date(Date.now() + 3600 * 1000) });
    await sendMail({
      to: email,
      subject: "Reset your BrandOS password",
      heading: "Reset your password",
      body: "Someone asked to reset the password for this address. If it was you, use the link below within an hour. If not, ignore this email and nothing changes.",
      action: { label: "Choose a new password", href: `${appUrl()}/invite/${token}` },
    });
  });
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
  if (await isBreachedPassword(password)) return { error: BREACHED_MESSAGE, email };
  await db.transaction(async (tx) => {
    await tx.update(s.users).set({ email, passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(s.users.id, inv.userId));
    await tx.update(s.invites).set({ usedAt: new Date() }).where(eq(s.invites.token, token));
    // A new password signs out every other device.
    await tx.delete(s.sessions).where(eq(s.sessions.userId, inv.userId));
  });
  await recordSecurity({ userId: inv.userId, action: EV.setPassword, label: email, field: `${inv.purpose} link`, withIp: true });
  // A reset link proves the email, not the phone: two-step still applies.
  redirect(await afterFirstFactor(inv.userId, "link"));
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const me = await getViewer();
  if (!me) return { error: "You are signed out." };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  // People who joined with Google have no password yet and may set one.
  if (authMode() === "password" && me.passwordHash && !(await verifyPassword(current, me.passwordHash))) return { error: "Your current password is not right." };
  if (next.length < 10) return { error: "Use at least ten characters." };
  if (await isBreachedPassword(next)) return { error: BREACHED_MESSAGE };
  const db = await getDb();
  await db.update(s.users).set({ passwordHash: await hashPassword(next) }).where(eq(s.users.id, me.id));
  await recordSecurity({ userId: me.id, action: EV.changedPassword, label: me.email ?? me.name, withIp: true });
  // A new password signs out every other device.
  const sid = await currentSessionId();
  if (sid) await db.delete(s.sessions).where(and(eq(s.sessions.userId, me.id), ne(s.sessions.id, sid)));
  refresh();
  return { error: undefined, email: "saved" };
}
