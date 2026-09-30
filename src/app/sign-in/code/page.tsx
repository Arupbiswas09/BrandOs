import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { mailEnabled } from "@/server/mail";
import { authMode, getViewer } from "@/server/session";
import { CodeForm } from "./form";

export const metadata: Metadata = { title: "Sign in with a code" };

export default async function SignInWithCode() {
  if (await getViewer()) redirect("/");
  // The demo picks a person instead, and without email there is no way to send a code.
  if (authMode() === "demo" || !mailEnabled()) redirect("/sign-in");
  return (
    <AuthShell title="Sign in with a code" sub="No password needed. We email you a six-digit code that works once, for ten minutes.">
      <CodeForm />
      <p className="mt-6 text-[14px]"><Link href="/sign-in" className="font-medium text-accent hover:underline">← Sign in with a password instead</Link></p>
    </AuthShell>
  );
}
