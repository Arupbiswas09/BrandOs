import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-wash px-6 py-12">
      <div className="w-full max-w-[460px] rounded-2xl border border-[#E1E7E4] bg-surface px-6 py-10 text-center shadow-card sm:px-10">
        <div className="eyebrow mb-2">404</div>
        <h1 className="display m-0 mb-2 text-display">Nothing at this address</h1>
        <p className="mx-auto mb-7 mt-0 max-w-[38ch] text-body leading-[1.55] text-mute-1 text-pretty">The page moved, was deleted, or the link was mistyped.</p>
        <Link href="/" className="inline-flex items-center rounded-lg bg-[#2D4A5C] px-5 py-2.5 text-body font-semibold text-white transition hover:brightness-110">Go to the dashboard</Link>
      </div>
    </main>
  );
}
