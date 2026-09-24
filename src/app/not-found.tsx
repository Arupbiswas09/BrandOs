import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-wash px-6">
      <div className="max-w-[400px] text-center">
        <div className="eyebrow mb-3">404</div>
        <h1 className="m-0 mb-2 text-[26px] font-semibold tracking-[-0.02em]">Nothing on this street</h1>
        <p className="mb-6 mt-0 text-[16px] leading-[1.55] text-mute-1">The page moved, was deleted, or the link was mistyped.</p>
        <Link href="/" className="inline-block rounded-[9px] bg-[#0F2A5F] px-5 py-2.5 text-[15px] font-semibold text-white hover:brightness-110">Back to the Street</Link>
      </div>
    </main>
  );
}
