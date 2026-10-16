"use client";

import { Star } from "lucide-react";
import { IconBtn, cx } from "@/components/ui";
import type { StarKind } from "@/lib/stars";
import { useStar } from "./use-star";

/**
 * Stars or unstars one client, brand, service, offer or asset for me. The
 * star fills in the accent colour straight away; if the server refuses, it
 * empties again and a toast says why.
 */
export function StarButton({ kind, id, name, size = "md", className }: {
  kind: StarKind;
  id: string;
  /** The item's name, for the button's label: "Star Free Marketing Audit". */
  name: string;
  /** "sm" is 28px for rows and cards, "md" 32px for page and drawer headers. */
  size?: "sm" | "md";
  className?: string;
}) {
  const { on, toggle } = useStar(kind, id);
  return (
    <IconBtn
      label={on ? `Unstar ${name}` : `Star ${name}`}
      aria-pressed={on}
      size={size}
      onClick={() => void toggle()}
      className={cx(on && "text-accent hover:text-accent", className)}
    >
      <Star aria-hidden fill={on ? "currentColor" : "none"} strokeWidth={on ? 1.75 : 2} />
    </IconBtn>
  );
}
