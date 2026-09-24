import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/*
 * Small tamper-proof values for short-lived cookies (the half-finished
 * two-step sign-in, the Google sign-in state). The payload is readable but
 * cannot be changed or forged without the key.
 *
 * The key is AUTH_SECRET. Without it each server process makes up its own,
 * which is fine for one instance: at worst a sign-in that is half-way
 * through when the server restarts has to start again. Set AUTH_SECRET when
 * running more than one instance.
 */

const holder = globalThis as unknown as { __bosKey?: Buffer };

function key(): Buffer {
  const env = process.env.AUTH_SECRET;
  if (env && env.length >= 16) return Buffer.from(env);
  holder.__bosKey ??= randomBytes(32);
  return holder.__bosKey;
}

const mac = (body: string) => createHmac("sha256", key()).update(body).digest("base64url");

/** Signs a JSON value that stops being accepted after `ttlMs`. */
export function sign(value: Record<string, unknown>, ttlMs: number): string {
  const body = Buffer.from(JSON.stringify({ ...value, exp: Date.now() + ttlMs })).toString("base64url");
  return `${body}.${mac(body)}`;
}

/** The signed value, or null when it was changed, forged or has expired. */
export function unsign<T extends Record<string, unknown>>(token: string | undefined | null): (T & { exp: number }) | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp: number };
    return typeof v.exp === "number" && v.exp > Date.now() ? v : null;
  } catch {
    return null;
  }
}
