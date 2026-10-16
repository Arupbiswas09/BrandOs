import { LinkBtn } from "@/components/link-btn";

/** A missing page inside the app keeps the sidebar and header around it. */
export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-[520px] px-6 py-16 sm:py-24">
      <div className="rounded-xl border border-line bg-surface px-6 py-10 text-center shadow-card sm:px-10">
        <div className="eyebrow mb-2">404</div>
        <h1 className="display m-0 mb-2 text-display">This page is not here</h1>
        <p className="mx-auto mb-7 mt-0 max-w-[40ch] text-body leading-[1.55] text-mute-1 text-pretty">It moved, was deleted, or the link was mistyped. Search with <kbd className="kbd">/</kbd> or head back to the dashboard.</p>
        <LinkBtn href="/" variant="primary" size="lg">Go to the dashboard</LinkBtn>
      </div>
    </div>
  );
}
