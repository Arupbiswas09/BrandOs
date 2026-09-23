import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "./form";

export const metadata: Metadata = { title: "Forgot password" };

export default function Forgot() {
  return (
    <main className="flex min-h-screen items-start justify-center bg-wash px-4 py-16 sm:py-24">
      <div className="w-full max-w-[440px] animate-rise">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[#2D4A5C] text-[14px] font-bold text-white">B</span>
          <span className="text-[17px] font-semibold tracking-[-0.015em]">BrandOS</span>
        </div>
        <h1 className="m-0 mb-2 font-serif text-[34px] font-normal leading-[1.1] tracking-[-0.02em]">Forgot your password?</h1>
        <p className="mb-8 mt-0 text-[15px] leading-[1.55] text-mute-2">Enter the email you sign in with and we will send a link to choose a new one.</p>
        <ForgotForm />
        <p className="mt-6 text-[14px]"><Link href="/sign-in" className="text-accent hover:underline">Back to sign in</Link></p>
      </div>
    </main>
  );
}
