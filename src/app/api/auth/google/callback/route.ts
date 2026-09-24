import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { finishSignIn, googleEnabled } from "@/server/google";
import { unsign } from "@/server/signed";
import { afterFirstFactor } from "@/server/two-factor";

export const dynamic = "force-dynamic";

/**
 * Google sends the browser back here. The state must match the cookie set
 * by /start, and the email must belong to someone already on the team.
 */
export async function GET(req: NextRequest) {
  if (!googleEnabled()) redirect("/sign-in");
  const jar = await cookies();
  const saved = unsign<{ state: string; nonce: string; verifier: string }>(jar.get("bos_oauth")?.value);
  jar.delete({ name: "bos_oauth", path: "/api/auth/google" });

  const q = req.nextUrl.searchParams;
  if (q.get("error")) redirect("/sign-in?error=google-cancelled");
  const code = q.get("code");
  if (!saved || !code || q.get("state") !== saved.state) redirect("/sign-in?error=google-expired");

  let email: string;
  try {
    ({ email } = await finishSignIn(code, saved.verifier, saved.nonce));
  } catch (e) {
    const why = e instanceof Error ? e.message : "";
    redirect(`/sign-in?error=${why === "domain" ? "google-domain" : why === "unverified" ? "google-unverified" : "google"}`);
  }

  const db = await getDb();
  const [u] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, email)).limit(1);
  if (!u) redirect("/sign-in?error=google-account");
  redirect(await afterFirstFactor(u.id));
}
