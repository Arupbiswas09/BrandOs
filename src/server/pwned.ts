import "server-only";
import { createHash } from "node:crypto";

export const BREACHED_MESSAGE =
  "That password has turned up in a public data breach, so attackers try it first. Choose a different one.";

/**
 * Checks a password against Have I Been Pwned without sending it anywhere.
 * Only the first five characters of its SHA-1 hash leave the server
 * (k-anonymity); the match happens here.
 *
 * Returns true only when the password is known to be breached. If the service
 * is slow or down we let the password through (fail open) and log a warning,
 * so an outage never locks people out. Set PWNED_CHECK=off to skip it.
 */
export async function isBreachedPassword(password: string): Promise<boolean> {
  if (process.env.PWNED_CHECK === "off" || !password) return false;
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      // Padding hides how many matches the prefix had from anyone watching.
      headers: { "Add-Padding": "true", "User-Agent": "BrandOS password check" },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [s, n] = line.trim().split(":");
      if (s === suffix && Number(n) > 0) return true;
    }
    return false;
  } catch (e) {
    console.warn(`Breached-password check skipped: Have I Been Pwned did not answer (${e instanceof Error ? e.message : String(e)}).`);
    return false;
  }
}
