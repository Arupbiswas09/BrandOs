"use client";

import { forwardRef, type AnchorHTMLAttributes } from "react";
import { useApp } from "@/components/app/provider";
import { cx } from "@/components/ui";

/*
 * A link that looks like a button, for things that really are links: open a
 * page in a new tab, download a file. Same heights, radius and press feedback
 * as `Btn`, so a link and a button side by side line up.
 */

type Variant = "primary" | "secondary" | "quiet";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "border border-transparent bg-accent font-semibold text-on-accent hover:brightness-110 theme-fade",
  secondary: "border border-line bg-surface font-medium text-ink-3 hover:border-line-strong hover:bg-wash",
  // A small text action inside a row: accent text, a soft tint on hover.
  quiet: "border border-transparent font-medium text-accent hover:bg-soft",
};
const SIZE: Record<Size, string> = { sm: "h-8 rounded-lg px-3 text-meta", md: "h-9 rounded-lg px-3.5 text-body" };
const QUIET_SIZE = "h-6 rounded-lg px-1.5 text-small";

export function linkBtn(variant: Variant = "secondary", size: Size = "sm") {
  return cx(
    "inline-flex flex-none items-center justify-center gap-1.5 whitespace-nowrap transition-[background-color,border-color,color,filter,transform] duration-150 ease-snap active:scale-[0.97] [&>svg]:flex-none",
    variant === "quiet" ? QUIET_SIZE : SIZE[size],
    VARIANT[variant],
  );
}

export const LinkBtn = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }>(
  function LinkBtn({ variant = "secondary", size = "sm", className, ...rest }, ref) {
    return <a ref={ref} className={cx(linkBtn(variant, size), className)} {...rest} />;
  },
);

/** The address as people read it: no scheme, no trailing slash. */
export const displayUrl = (href: string) => href.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");

/** Copies a link and says so. */
export function useCopyLink() {
  const { toast } = useApp();
  return async (href: string) => {
    try {
      await navigator.clipboard.writeText(href);
      toast("Link copied");
    } catch {
      toast("The link could not be copied. Open it and copy it from the address bar.", "error");
    }
  };
}
