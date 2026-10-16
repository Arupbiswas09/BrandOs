import type { Metadata } from "next";
import { AuthShell, FormError, GoogleButton, OrRule } from "@/components/auth-shell";
import { redirect } from "next/navigation";
import { ne } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { allowedDomain, googleEnabled } from "@/server/google";
import { mailEnabled } from "@/server/mail";
import { authMode, getViewer } from "@/server/session";
import { LinkBtn } from "@/components/link-btn";
import { DemoPicker, PasswordForm } from "./forms";

export const metadata: Metadata = { title: "Sign in" };

/** What went wrong on the way back (Google, or a refused sign-in). The URL carries a code, never details. */
function signInError(code: string | undefined): string | null {
  const domain = allowedDomain();
  switch (code) {
    case "no-access": return "That account does not have access to BrandOS any more. It is for the agency team only. Ask an admin if you think this is wrong.";
    case "google-account": return "That Google account is not on the team here. Ask an admin to invite the email address you use with Google.";
    case "google-domain": return `Only ${domain ? "@" + domain : "company"} Google accounts can sign in here.`;
    case "google-unverified": return "Google has not verified that email address yet.";
    case "google-cancelled": return "Google sign-in was cancelled.";
    case "google-expired": return "That sign-in took too long or was started in another tab. Try again.";
    case "google": return "Google sign-in did not work. Try again, or use your password.";
    default: return null;
  }
}

export default async function SignIn({ searchParams }: PageProps<"/sign-in">) {
  if (await getViewer()) redirect("/");
  const mode = authMode();
  const db = await getDb();
  const [anyone] = await db.select({ id: s.users.id }).from(s.users).limit(1);
  if (!anyone) redirect("/setup");
  // BrandOS is internal only: people with the old Client role are not offered.
  const people = mode === "demo"
    ? (await db.select({ id: s.users.id, name: s.users.name, initials: s.users.initials, role: s.users.role, access: s.users.access }).from(s.users).where(ne(s.users.access, "Client")))
    : [];
  const q = await searchParams;
  const error = signInError(typeof q.error === "string" ? q.error : undefined);
  const google = googleEnabled();
  return (
    <AuthShell
      title={mode === "demo" ? "Choose who to sign in as" : "Welcome back"}
      sub={mode === "demo"
        ? "This is the demo workspace. Pick a teammate to see BrandOS through their eyes. Each role sees and does different things."
        : "Sign in to your agency's BrandOS."}
    >
      {error && <FormError className="mb-5">{error}</FormError>}
      {mode === "demo" ? <DemoPicker people={people} /> : (
        <>
          {google && <><GoogleButton /><OrRule /></>}
          <PasswordForm />
          {mailEnabled() && <LinkBtn href="/sign-in/code" size="lg" className="mt-3 w-full">Email me a sign-in code instead</LinkBtn>}
        </>
      )}
    </AuthShell>
  );
}
