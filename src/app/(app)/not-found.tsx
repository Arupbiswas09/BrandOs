import Link from "next/link";
import { SpotArt } from "@/components/art";

/** A missing page inside the app keeps the sidebar and header around it. */
export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-[520px] px-6 py-16 sm:py-24">
      <div className="rounded-2xl border border-line bg-white px-6 py-10 text-center shadow-[0_1px_2px_rgba(15,23,42,.04)] sm:px-10">
        <SpotArt kind="search" className="mx-auto mb-4" />
        <div className="eyebrow mb-2">404</div>
        <h1 className="m-0 mb-2 text-[24px] font-semibold tracking-[-0.02em]">This page is not here</h1>
        <p className="mx-auto mb-7 mt-0 max-w-[40ch] text-[15px] leading-[1.55] text-mute-1 text-pretty">It moved, was deleted, or the link was mistyped. Search with <kbd className="kbd">/</kbd> or head back to the dashboard.</p>
        <Link href="/" className="inline-flex items-center rounded-[9px] bg-accent px-5 py-2.5 text-[15px] font-semibold text-on-accent transition hover:brightness-110">Go to the dashboard</Link>
      </div>
    </div>
  );
}
