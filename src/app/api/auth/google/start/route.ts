import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authorizeUrl, googleEnabled, newAttempt } from "@/server/google";
import { sign } from "@/server/signed";

export const dynamic = "force-dynamic";

/** Sends the browser to Google, remembering the state and PKCE verifier in a short-lived signed cookie. */
export async function GET() {
  if (!googleEnabled()) redirect("/sign-in");
  const a = newAttempt();
  const jar = await cookies();
  jar.set("bos_oauth", sign({ state: a.state, nonce: a.nonce, verifier: a.verifier }, 10 * 60 * 1000), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/google",
    maxAge: 600,
  });
  redirect(authorizeUrl(a));
}
