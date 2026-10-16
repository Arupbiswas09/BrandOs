"use client";

import { ArrowRight } from "lucide-react";
import type { Cta } from "@/db/schema";
import { cx } from "@/components/ui";
import { ctaUrl } from "@/components/funnel/linked";
import { displayUrl } from "@/components/link-button";

/**
 * A call to action as a small label: its words and where it goes. It is not
 * drawn as a button, because inside BrandOS it does nothing; the destination
 * opens in a new tab when it is a real address.
 */
export function CtaTag({ c, className }: { c: Cta; className?: string }) {
  const url = ctaUrl(c.url);
  const cls = cx("inline-flex max-w-full items-center gap-1.5 rounded-sm border border-line px-1.5 py-0.5 text-small", className);
  const body = (
    <>
      <span aria-hidden className="size-2 flex-none rounded-full" style={{ background: c.style === "solid" ? c.bg : c.fg }} />
      <span className="flex-none font-medium text-ink-3">{c.text}</span>
      {c.url && <><ArrowRight aria-hidden size={12} className="flex-none text-mute-2" /><span className="min-w-0 truncate text-mute-2">{displayUrl(c.url)}</span></>}
    </>
  );
  return url
    ? <a href={url} target="_blank" rel="noreferrer" title={`${c.text}: opens ${c.url}`} className={cx(cls, "transition-colors hover:border-line-strong hover:bg-wash")}>{body}</a>
    : <span className={cls}>{body}</span>;
}
