import type { Metadata } from "next";
import { AuthShell, GoogleButton, OrRule } from "@/components/auth-shell";
import { redirect } from "next/navigation";
import { getDb, schema as s } from "@/db";
import { allowedDomain, googleEnabled } from "@/server/google";
import { authMode, getViewer } from "@/server/session";
import { DemoPicker, PasswordForm } from "./forms";

export const metadata: Metadata = { title: "Sign in" };

/** What went wrong on the way back from Google (the callback passes a code, never details). */
function googleError(code: string | undefined): string | null {
  const domain = allowedDomain();
  switch (code) {
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
  const people = mode === "demo"
    ? (await db.select({ id: s.users.id, name: s.users.name, initials: s.users.initials, role: s.users.role, access: s.users.access }).from(s.users))
    : [];
  const q = await searchParams;
  const error = googleError(typeof q.error === "string" ? q.error : undefined);
  const google = googleEnabled();
  return (
    <AuthShell
      title={mode === "demo" ? "Choose who to sign in as" : "Welcome back"}
      sub={mode === "demo"
        ? "This is the demo workspace. Pick a teammate to see BrandOS through their eyes — each role sees and does different things."
        : "Sign in to your agency's BrandOS."}
    >
      {mode === "demo" ? <DemoPicker people={people} /> : (
        <>
          {error && <div role="alert" className="mb-5 rounded-[9px] bg-[rgba(194,65,18,.07)] px-3 py-2 text-[15px] text-[#A63A12]">{error}</div>}
          {google && <><GoogleButton /><OrRule /></>}
          <PasswordForm />
        </>
      )}
    </AuthShell>
  );
}
