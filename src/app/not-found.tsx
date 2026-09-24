import Link from "next/link";
import { SpotArt } from "@/components/art";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-wash px-6 py-12">
      <div className="w-full max-w-[460px] rounded-2xl border border-[#E2E8F0] bg-white px-6 py-10 text-center shadow-[0_1px_2px_rgba(15,23,42,.04)] sm:px-10">
        <SpotArt kind="search" className="mx-auto mb-4" />
        <div className="eyebrow mb-2">404</div>
        <h1 className="m-0 mb-2 text-[26px] font-semibold tracking-[-0.02em]">Nothing at this address</h1>
        <p className="mx-auto mb-7 mt-0 max-w-[38ch] text-[15px] leading-[1.55] text-mute-1 text-pretty">The page moved, was deleted, or the link was mistyped.</p>
        <Link href="/" className="inline-flex items-center rounded-[9px] bg-[#0F2A5F] px-5 py-2.5 text-[15px] font-semibold text-white transition hover:brightness-110">Go to the dashboard</Link>
      </div>
    </main>
  );
}
