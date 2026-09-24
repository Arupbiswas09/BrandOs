import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { authMode } from "@/server/session";
import { SetupForm } from "./form";

export const metadata: Metadata = { title: "Set up BrandOS" };

// Whether anyone exists is a live question, never a build-time one.
export const dynamic = "force-dynamic";

export default async function Setup() {
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.users);
  if (n > 0) redirect("/sign-in");
  return (
    <AuthShell wide title="Set up your workspace" sub="Two minutes. You become the first admin and your agency becomes the first client. Invite the team straight after.">
      <SetupForm needsPassword={authMode() === "password"} />
    </AuthShell>
  );
}
