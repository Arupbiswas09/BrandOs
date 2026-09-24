import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getViewer, pendingUserId } from "@/server/session";
import { CodeForm } from "./form";

export const metadata: Metadata = { title: "Two-step verification" };

/** The second step of signing in, for people with two-step verification on. */
export default async function Verify() {
  if (await getViewer()) redirect("/");
  if (!(await pendingUserId())) redirect("/sign-in");
  return (
    <AuthShell title="Enter your code" sub="Open your authenticator app and type the six-digit code for BrandOS.">
      <CodeForm />
    </AuthShell>
  );
}
