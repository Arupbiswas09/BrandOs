import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { InviteForm } from "./form";

export const metadata: Metadata = { title: "Join the team" };

export default async function Invite({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const db = await getDb();
  const [row] = await db
    .select({ name: s.users.name, email: s.users.email, purpose: s.invites.purpose })
    .from(s.invites)
    .innerJoin(s.users, eq(s.users.id, s.invites.userId))
    .where(and(eq(s.invites.token, token), isNull(s.invites.usedAt), gt(s.invites.expiresAt, new Date())))
    .limit(1);
  return (
    row ? (
      <AuthShell title={`Welcome, ${row.name.split(" ")[0]}`} sub={row.purpose === "reset" ? "Choose a new password and you are back in." : "Set a password and you are in."}>
        <InviteForm token={token} email={row.email ?? ""} reset={row.purpose === "reset"} />
      </AuthShell>
    ) : (
      <AuthShell title="This link has expired" sub="Invite and reset links work once and do not last forever. Ask whoever sent it for a fresh one.">
        <a href="/sign-in" className="text-[14px] font-medium text-accent hover:underline">← Back to sign in</a>
      </AuthShell>
    )
  );
}
