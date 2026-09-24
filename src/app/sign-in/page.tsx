import type { Metadata } from "next";
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
    <main className="flex min-h-screen items-start justify-center bg-wash px-4 py-16 sm:py-24">
      <div className="w-full max-w-[440px] animate-rise">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[#0F2A5F] text-[15px] font-bold text-white">B</span>
          <span className="text-[17px] font-semibold tracking-[-0.015em]">BrandOS</span>
        </div>
        <h1 className="m-0 mb-2 text-[26px] font-semibold leading-[1.1] tracking-[-0.02em]">
          {mode === "demo" ? "Who is walking in?" : "Sign in"}
        </h1>
        <p className="mb-8 mt-0 text-[15px] leading-[1.55] text-[#475569]">
          {mode === "demo"
            ? "This is the demo building. Pick a teammate to see BrandOS through their eyes — what they can do and which clients they can see."
            : "Every client, brand, offer and asset your agency works on, in one building."}
        </p>
        {mode === "demo" ? <DemoPicker people={people} /> : <PasswordForm />}
      </div>
    </main>
  );
}
