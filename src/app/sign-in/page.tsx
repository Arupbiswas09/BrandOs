import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { redirect } from "next/navigation";
import { getDb, schema as s } from "@/db";
import { authMode, getViewer } from "@/server/session";
import { DemoPicker, PasswordForm } from "./forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignIn() {
  if (await getViewer()) redirect("/");
  const mode = authMode();
  const db = await getDb();
  const [anyone] = await db.select({ id: s.users.id }).from(s.users).limit(1);
  if (!anyone) redirect("/setup");
  const people = mode === "demo"
    ? (await db.select({ id: s.users.id, name: s.users.name, initials: s.users.initials, role: s.users.role, access: s.users.access }).from(s.users))
    : [];
  return (
    <AuthShell
      title={mode === "demo" ? "Choose who to sign in as" : "Welcome back"}
      sub={mode === "demo"
        ? "This is the demo workspace. Pick a teammate to see BrandOS through their eyes — each role sees and does different things."
        : "Sign in to your agency's BrandOS."}
    >
      {mode === "demo" ? <DemoPicker people={people} /> : <PasswordForm />}
    </AuthShell>
  );
}
