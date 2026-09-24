import type { Metadata } from "next";
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
    <main className="flex min-h-screen items-start justify-center bg-wash px-4 py-14 sm:py-20">
      <div className="w-full max-w-[520px] animate-rise">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[#0F2A5F] text-[14px] font-bold text-white">B</span>
          <span className="text-[17px] font-semibold tracking-[-0.015em]">BrandOS</span>
        </div>
        <h1 className="m-0 mb-2 text-[28px] font-semibold leading-[1.1] tracking-[-0.02em]">Welcome. Let&apos;s open the doors.</h1>
        <p className="mb-8 mt-0 text-[16px] leading-[1.55] text-mute-2">Two minutes. You become the first admin, and your agency becomes the first client on the street. You can invite the team straight after.</p>
        <SetupForm needsPassword={authMode() === "password"} />
      </div>
    </main>
  );
}
