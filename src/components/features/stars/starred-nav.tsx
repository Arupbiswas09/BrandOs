"use client";

import Link from "next/link";
import { useId } from "react";
import { useApp } from "@/components/app/provider";
import { cx } from "@/components/ui";
import { NAV_STARS, type StarredItem } from "@/lib/stars";
import { StarTile, useIsHere, useStarredItems } from "./starred-list";

const rowCls = (here: boolean, mini: boolean) => cx(
  "flex w-full items-center rounded-md text-left text-meta font-medium transition-colors duration-150",
  mini ? "h-9 justify-center" : "h-8 gap-2.5 px-3",
  here ? "bg-hl text-hl-ink" : "text-mute-1 hover:bg-hover hover:text-ink",
);

/**
 * "Starred" at the top of the sidebar: up to ten things I use constantly,
 * one click away. Assets open in the drawer; everything else opens its page.
 * Shows nothing at all until I star something. `mini` is the folded sidebar,
 * where each row is just its tile.
 */
export function StarredNav({ mini = false, className }: { mini?: boolean; className?: string }) {
  const { openAsset } = useApp();
  const items = useStarredItems();
  const isHere = useIsHere();
  const headingId = useId();
  if (!items.length) return null;
  const shown = items.slice(0, NAV_STARS);
  const more = items.length - shown.length;

  const row = (x: StarredItem) => {
    const here = isHere(x);
    const body = (
      <>
        <StarTile item={x} size={mini ? "square" : "sm"} />
        {mini ? <span className="sr-only">{x.name}</span> : <span className="min-w-0 flex-1 truncate">{x.name}</span>}
      </>
    );
    const title = mini ? x.name : undefined;
    return (
      <li key={x.key}>
        {x.href
          ? <Link href={x.href} className={rowCls(here, mini)} aria-current={here ? "page" : undefined} title={title}>{body}</Link>
          : <button type="button" onClick={() => openAsset(x.id)} className={rowCls(here, mini)} aria-current={here ? "true" : undefined} aria-haspopup="dialog" title={title}>{body}</button>}
      </li>
    );
  };

  return (
    <div role="group" aria-labelledby={headingId} className={className}>
      <div id={headingId} className={cx("eyebrow mb-1", mini ? "sr-only" : "px-3")}>Starred</div>
      <ul className={cx("m-0 flex list-none flex-col p-0", mini ? "gap-1" : "gap-px")}>
        {shown.map(row)}
      </ul>
      {more > 0 && !mini && (
        <Link href="/#starred" className="mt-0.5 flex h-7 items-center rounded-md px-3 text-small font-medium text-mute-2 transition-colors duration-150 hover:bg-hover hover:text-ink">
          {more} more on the dashboard
        </Link>
      )}
    </div>
  );
}
