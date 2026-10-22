"use client";

import { useState } from "react";
import { checkBrandLinks } from "@/app/link-actions";
import { useApp } from "@/components/app/provider";
import { Btn, Card, cx } from "@/components/ui";
import { isLinkBroken, linkCheckOf, linkProblem } from "@/lib/link-health";
import { plural } from "@/lib/ws";
import { CheckedAt, useCheckAgain, useEditLink } from "./link-status";
import { useRun } from "./use-run";

/*
 * The links that stopped opening, for the dashboard (everything I can see)
 * or one brand's home (that brand and its sub-brands). Renders nothing at all
 * while every link opens.
 */

const SHOWN = 5;

/** The address without the scheme or a trailing slash: "quokkaforgood.org/audit". */
const shortUrl = (u: string) => u.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");

export function BrokenLinksCard({ brandId, className }: { brandId?: string; className?: string }) {
  const { ws, openAsset } = useApp();
  const { again, busyId } = useCheckAgain();
  const editLink = useEditLink();
  const [all, setAll] = useState(false);
  const inBrand = (id: string | null) => !brandId || id === brandId || (!!id && ws.brand(id)?.parentId === brandId);
  const items = ws.d.assets
    .filter((a) => inBrand(a.brandId) && isLinkBroken(a))
    .sort((x, y) => +new Date(linkCheckOf(y)!.checkedAt) - +new Date(linkCheckOf(x)!.checkedAt));
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, SHOWN);
  const canCheck = ws.can("edit");

  return (
    <Card className={cx("p-5", className)}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="m-0 flex items-center gap-2 text-lead font-semibold">
          <span aria-hidden className="size-2 flex-none rounded-full bg-warn" />
          Links not responding
          <span className="font-mono text-small font-medium text-mute-2">{items.length}</span>
        </h2>
        {brandId && <CheckBrandLinksButton brandId={brandId} />}
      </div>
      <p className="m-0 mb-3 text-meta text-mute-2 text-pretty">
        Checked once a day, last at <CheckedAt at={linkCheckOf(items[0])!.checkedAt} now={ws.d.now} />. Press Edit link to fix an address, or Check again once the page is back.
      </p>
      <ul className="m-0 list-none p-0">
        {shown.map((a) => {
          const c = linkCheckOf(a)!;
          const brand = brandId ? null : ws.brand(a.brandId);
          return (
            <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-divider py-2">
              <button type="button" onClick={() => openAsset(a.id)} className="focus-inset -mx-1.5 min-w-0 rounded-lg px-1.5 py-1 text-left hover:bg-wash">
                <span className="block truncate text-body font-medium text-ink">{a.name}</span>
                <span className="block truncate text-small text-mute-2" title={a.url}>
                  <span className="font-medium text-warn-text">{linkProblem(c)}{c.status ? ` (${c.status})` : ""}</span>
                  {brand && <> · {brand.name}</>}
                  {" · "}<span className="font-mono">{shortUrl(a.url)}</span>
                </span>
              </button>
              <span className="flex flex-none flex-wrap justify-end gap-1.5">
                {ws.canChange(a) && <Btn size="sm" onClick={() => editLink(a)} aria-label={`Edit link: ${a.name}`}>Edit link</Btn>}
                {canCheck && (
                  <Btn size="sm" disabled={busyId !== null} onClick={() => again(a.id)} aria-label={`${busyId === a.id ? "Checking" : "Check again"}: ${a.name}`}>
                    {busyId === a.id ? "Checking…" : "Check again"}
                  </Btn>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {items.length > SHOWN && (
        <button type="button" onClick={() => setAll(!all)} className="mt-1 min-h-8 rounded-sm text-meta font-semibold text-accent hover:underline">
          {all ? "Show fewer" : `Show all ${plural(items.length, "link")}`}
        </button>
      )}
    </Card>
  );
}

/** Opens every link in a brand now. Admins and managers only; nothing for anyone else. */
export function CheckBrandLinksButton({ brandId, className }: { brandId: string; className?: string }) {
  const { ws, toast } = useApp();
  const [run, pending] = useRun();
  if (!ws.can("structure")) return null;
  const go = async () => {
    const r = await run(() => checkBrandLinks(brandId));
    if (!r) return;
    if (!r.checked) toast("This brand has no links to check");
    else if (!r.broken) toast(`All ${plural(r.checked, "link")} open`);
    else toast(`${plural(r.broken, "link")} of ${r.checked} not responding${r.remaining ? `. ${r.remaining} more next time` : ""}`, "info");
  };
  return (
    <Btn size="sm" variant="secondary" className={className} disabled={pending} onClick={go}>
      {pending ? "Checking links…" : "Check all links"}
    </Btn>
  );
}
