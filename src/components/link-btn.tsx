import Link from "next/link";
import type { ComponentProps } from "react";

/*
 * A link that looks like a Btn: same heights, radius, colours and press
 * feedback. For moving somewhere (the dashboard, back to sign in), where a
 * real link is right and a <button> is not. Kept in step with Btn in ui.tsx.
 */

/** ui.tsx is a client module, so server pages cannot call its cx(); this one is local. */
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const VARIANT = {
  primary: "border border-transparent bg-accent text-on-accent font-semibold hover:brightness-110 theme-fade",
  secondary: "border border-line bg-surface text-ink-3 font-medium hover:bg-wash hover:border-line-strong",
  ghost: "border border-transparent bg-transparent text-mute-2 hover:text-ink",
} as const;
const SIZE = { sm: "h-8 px-3 text-meta", md: "h-9 px-3.5 text-body", lg: "h-10 px-4 text-body" } as const;

export function LinkBtn({ variant = "secondary", size = "md", className, ...rest }: ComponentProps<typeof Link> & { variant?: keyof typeof VARIANT; size?: keyof typeof SIZE }) {
  return (
    <Link
      className={cx("inline-flex flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg transition-[background-color,border-color,color,filter,transform] duration-150 ease-snap active:scale-[0.97] [&>svg]:flex-none", SIZE[size], VARIANT[variant], className)}
      {...rest}
    />
  );
}
