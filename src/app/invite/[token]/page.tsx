import type { Metadata } from "next";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { InviteForm } from "./form";

export const metadata: Metadata = { title: "Join the team" };

export default async function Invite({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const db = await getDb();
  const [row] = await db
    .select({ name: s.users.name, email: s.users.email })
    .from(s.invites)
    .innerJoin(s.users, eq(s.users.id, s.invites.userId))
    .where(and(eq(s.invites.token, token), isNull(s.invites.usedAt), gt(s.invites.expiresAt, new Date())))
    .limit(1);
  return (
    <main className="flex min-h-screen items-start justify-center bg-wash px-4 py-16 sm:py-24">
      <div className="w-full max-w-[440px] animate-rise">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[#2D4A5C] text-[14px] font-bold text-white">B</span>
          <span className="text-[16px] font-semibold tracking-[-0.015em]">BrandOS</span>
        </div>
        {row ? (
          <>
            <h1 className="m-0 mb-2 font-serif text-[34px] font-normal leading-[1.1] tracking-[-0.02em]">Welcome, {row.name.split(" ")[0]}.</h1>
            <p className="mb-8 mt-0 text-[14px] text-[#566560]">Set a password and you are in.</p>
            <InviteForm token={token} email={row.email ?? ""} />
          </>
        ) : (
          <>
            <h1 className="m-0 mb-2 font-serif text-[34px] font-normal leading-[1.1] tracking-[-0.02em]">This link has expired</h1>
            <p className="mt-0 text-[14px] text-[#566560]">Invite links work once and last a week. Ask whoever invited you for a fresh one.</p>
          </>
        )}
      </div>
    </main>
  );
}
