import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-wash px-6">
      <div className="max-w-[400px] text-center">
        <div className="eyebrow mb-3">404</div>
        <h1 className="m-0 mb-2 font-serif text-[34px] font-normal tracking-[-0.02em]">Nothing on this street</h1>
        <p className="mb-6 mt-0 text-[15px] leading-[1.55] text-mute-1">The page moved, was deleted, or the link was mistyped.</p>
        <Link href="/" className="inline-block rounded-[9px] bg-[#2D4A5C] px-5 py-2.5 text-[14px] font-semibold text-white hover:brightness-110">Back to the Street</Link>
      </div>
    </main>
  );
}
