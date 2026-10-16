"use client";

import Link from "next/link";
import { useState } from "react";
import { Star } from "lucide-react";
import { useApp } from "@/components/app/provider";
import { Card, IconTile, cx } from "@/components/ui";
import type { StarredItem } from "@/lib/stars";
import { StarButton } from "./star-button";
import { StarTile, useIsHere, useStarredItems } from "./starred-list";

/** Rows shown before "Show all". */
const FIRST = 8;

/**
 * The dashboard's "Starred" card: everything I starred, with what each thing
 * is and which brand it belongs to, and a star to take it off the list.
 * Empty, it says in one sentence what it is for.
 */
export function StarredCard({ className }: { className?: string }) {
  const { openAsset } = useApp();
  const items = useStarredItems();
  const isHere = useIsHere();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, FIRST);

  const row = (x: StarredItem) => {
    const cls = "flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 text-left";
    const body = (
      <>
        <StarTile item={x} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-medium text-ink">{x.name}</span>
          <span className="mt-px block truncate text-meta text-mute-2">{x.sub}</span>
        </span>
      </>
    );
    return (
      <li key={x.key} className="-mx-2 flex items-center gap-2 rounded-lg border-t border-divider px-2 py-1.5 transition-colors duration-150 hover:bg-wash">
        {x.href
          ? <Link href={x.href} className={cls} aria-current={isHere(x) ? "page" : undefined}>{body}</Link>
          : <button type="button" onClick={() => openAsset(x.id)} className={cls} aria-haspopup="dialog">{body}</button>}
        <StarButton kind={x.kind} id={x.id} name={x.name} size="sm" />
      </li>
    );
  };

  return (
    <Card className={cx("px-5 pb-3 pt-4", className)}>
      <div id="starred" className="scroll-mt-24">
        <h2 className="m-0 mb-0.5 flex items-center gap-2.5 text-lead font-semibold"><IconTile><Star /></IconTile>Starred</h2>
        <p className={cx("m-0 text-meta text-mute-3", items.length ? "mb-2" : "mb-1")}>
          {items.length ? "What you use most, one click away." : "Star the offers and assets you use most to keep them here."}
        </p>
        {items.length > 0 && <ul className="m-0 list-none p-0">{shown.map(row)}</ul>}
        {items.length > FIRST && (
          <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className="-mx-2 mt-1 flex h-8 w-[calc(100%+16px)] items-center rounded-lg border-t border-divider px-2 text-meta font-semibold text-accent hover:bg-wash">
            {all ? "Show fewer" : `Show all ${items.length}`}
          </button>
        )}
      </div>
    </Card>
  );
}
