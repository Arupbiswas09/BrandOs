import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { appUrl } from "@/server/mail";
import { authMode } from "@/server/session";

/*
 * "Continue with Google": OpenID Connect, authorization-code flow with PKCE,
 * done with plain fetch. Google only proves who someone is. It never creates
 * an account: the email has to belong to someone already on the team.
 *
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   from Google Cloud → Credentials
 *   GOOGLE_ALLOWED_DOMAIN                    optional, e.g. "thatha.net"
 *
 * The redirect URI to register is APP_URL + /api/auth/google/callback.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

export function googleEnabled(): boolean {
  return authMode() === "password" && !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export const googleCallbackUrl = () => `${appUrl()}/api/auth/google/callback`;

/** Only emails at this domain may use Google sign-in, when set. */
export function allowedDomain(): string | null {
  const d = process.env.GOOGLE_ALLOWED_DOMAIN?.trim().toLowerCase().replace(/^@/, "");
  return d || null;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

/** Fresh state, nonce and PKCE pair for one sign-in attempt. */
export function newAttempt() {
  const verifier = b64url(randomBytes(32));
  return {
    state: b64url(randomBytes(24)),
    nonce: b64url(randomBytes(24)),
    verifier,
    challenge: b64url(createHash("sha256").update(verifier).digest()),
  };
}

export function authorizeUrl(a: { state: string; nonce: string; challenge: string }): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleCallbackUrl(),
    response_type: "code",
    scope: "openid email profile",
    state: a.state,
    nonce: a.nonce,
    code_challenge: a.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  const hd = allowedDomain();
  if (hd) q.set("hd", hd); // a hint for the account chooser; still checked below
  return `${AUTH_URL}?${q.toString()}`;
}

export type GoogleIdentity = { email: string; sub: string; name?: string };

/**
 * Swaps the one-time code for an ID token and checks it. Google's tokeninfo
 * endpoint checks the signature; the claims are checked here.
 * Throws a short reason on any failure.
 */
export async function finishSignIn(code: string, verifier: string, nonce: string): Promise<GoogleIdentity> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleCallbackUrl(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("token");
  const { id_token: idToken } = (await res.json()) as { id_token?: string };
  if (!idToken) throw new Error("token");

  const info = await fetch(`${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`, { cache: "no-store" });
  if (!info.ok) throw new Error("token");
  const c = (await info.json()) as Record<string, string | undefined>;

  if (!ISSUERS.includes(c.iss ?? "")) throw new Error("token");
  if (c.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error("token");
  if (!c.exp || Number(c.exp) * 1000 < Date.now()) throw new Error("token");
  if (c.nonce !== nonce) throw new Error("token");
  // tokeninfo returns booleans as strings.
  if (String(c.email_verified) !== "true" || !c.email) throw new Error("unverified");

  const email = c.email.trim().toLowerCase();
  const hd = allowedDomain();
  if (hd && !email.endsWith("@" + hd)) throw new Error("domain");
  return { email, sub: c.sub ?? "", name: c.name };
}
