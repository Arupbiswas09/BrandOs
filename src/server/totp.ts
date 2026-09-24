import "server-only";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/*
 * Time-based one-time codes (RFC 6238, the six-digit codes that Google
 * Authenticator, 1Password, Authy and friends show). SHA-1, 30-second steps,
 * six digits: the defaults every app understands.
 */

const STEP = 30;
const DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("Not base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret, base32 as the apps expect. */
export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226) for one counter value. */
export function hotp(secret: string, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

export const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP);

/**
 * Checks a code against the current step and one step either side (clock
 * drift). Returns the step it matched, or null. Codes for steps at or
 * before `after` are refused, so each code works only once.
 */
export function verifyTotp(secret: string, code: string, after = 0, now = Date.now()): number | null {
  const want = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(want)) return null;
  const cur = stepAt(now);
  for (const step of [cur, cur - 1, cur + 1]) {
    if (step <= after) continue;
    const got = hotp(secret, step);
    if (timingSafeEqual(Buffer.from(got), Buffer.from(want))) return step;
  }
  return null;
}

/** The link an authenticator app reads from the QR code. */
export function otpauthUri(secret: string, account: string, issuer = "BrandOS"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const q = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP) });
  return `otpauth://totp/${label}?${q.toString()}`;
}

/* Recovery codes: ten random characters shown as xxxxx-xxxxx, stored hashed. */

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function newRecoveryCodes(n = 8): string[] {
  return Array.from({ length: n }, () => {
    let c = "";
    for (let i = 0; i < 10; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    return `${c.slice(0, 5)}-${c.slice(5)}`;
  });
}

const normaliseRecovery = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The codes are long and random, so a plain SHA-256 is enough to store them. */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normaliseRecovery(code)).digest("base64url");
}

/** Looks like a recovery code rather than a six-digit one. */
export const isRecoveryShape = (code: string) => normaliseRecovery(code).length === 10;
