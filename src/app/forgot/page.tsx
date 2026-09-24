import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import Link from "next/link";
import { ForgotForm } from "./form";

export const metadata: Metadata = { title: "Forgot password" };

export default function Forgot() {
  return (
    <AuthShell title="Forgot your password?" sub="Enter the email you sign in with and we will send a link to choose a new one.">
      <ForgotForm />
      <p className="mt-6 text-[14px]"><Link href="/sign-in" className="font-medium text-accent hover:underline">← Back to sign in</Link></p>
    </AuthShell>
  );
}
