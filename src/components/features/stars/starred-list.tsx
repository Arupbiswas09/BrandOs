"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/app/provider";
import { cx } from "@/components/ui";
import { hexA, onColor, readable } from "@/lib/color";
import { starredItems, type StarredItem } from "@/lib/stars";
import { usePendingStars } from "./use-star";

/** My starred items as things to show, counting stars in flight. Archived or missing items are left out. */
export function useStarredItems(): StarredItem[] {
  const { ws } = useApp();
  const pending = usePendingStars();
  return useMemo(() => starredItems(ws, pending), [ws, pending]);
}

/** Whether this starred item is the page (or the asset drawer) on screen now. */
export function useIsHere() {
  const { assetId } = useApp();
  const pathname = usePathname();
  return (x: StarredItem) => (x.kind === "asset" ? assetId === x.id : !assetId && x.href === pathname);
}

/**
 * The small tile in front of a starred item: a brand's own mark on its
 * colour, otherwise the item's code (OF, SVC, LP, AUTO…) tinted with its
 * brand's colour.
 */
export function StarTile({ item, size = "sm" }: { item: StarredItem; size?: "sm" | "md" | "square" }) {
  const solid = item.kind === "brand";
  const style = solid ? { background: item.color, color: onColor(item.color) } : { background: hexA(item.color, 0.12), color: readable(item.color) };
  const box = { sm: "h-5 w-9 rounded-sm", md: "h-8 w-10 rounded-md", square: "h-9 w-9 rounded-lg" }[size];
  return (
    <span aria-hidden className={cx("flex flex-none items-center justify-center overflow-hidden font-mono text-micro font-semibold leading-none tracking-[0.04em]", box)} style={style}>
      {item.code}
    </span>
  );
}
