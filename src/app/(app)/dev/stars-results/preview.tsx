// DEV PREVIEW — removed before release
"use client";

import Link from "next/link";
import { useApp } from "@/components/app/provider";
import { Card, Eyebrow, Page, SectionHead, cx } from "@/components/ui";
import { StarButton } from "@/components/features/stars/star-button";
import { StarredCard } from "@/components/features/stars/starred-card";
import { StarredNav } from "@/components/features/stars/starred-nav";
import { useStarShortcut } from "@/components/features/stars/use-star-shortcut";
import { OfferResults } from "@/components/features/results/offer-results";
import { ResultBadge } from "@/components/features/results/result-badge";
import { WhatWorked } from "@/components/features/results/what-worked";
import type { StarKind } from "@/lib/stars";

const SAMPLES: [StarKind, string][] = [
  ["client", "cl1"], ["brand", "br1"], ["service", "sv1"], ["offer", "of15"], ["offer", "of1"], ["offer", "of24"], ["asset", "as1"], ["asset", "as41"],
];
const OFFERS = ["of15", "of1", "of24", "of2"];

/** Every star and results component, mounted on real seed data, so they can be seen and tested alone. */
export function Preview({ offerId }: { offerId: string }) {
  const { ws } = useApp();
  const offer = ws.offer(offerId);
  const name = (kind: StarKind, id: string) =>
    (kind === "client" ? ws.client(id) : kind === "brand" ? ws.brand(id) : kind === "service" ? ws.service(id) : kind === "offer" ? ws.offer(id) : ws.asset(id))?.name;

  return (
    <Page>
      <SectionHead as="h1" eyebrow="Dev preview" title="Stars and results" sub="Each component alone, on the demo data. The lead mounts them in the redesigned pages." />

      <div className="grid items-start gap-5 lg:grid-cols-[264px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Eyebrow>Sidebar</Eyebrow>
          <div className="rounded-xl border border-line bg-surface px-2 py-3">
            <StarredNav />
          </div>
          <Eyebrow>Folded sidebar</Eyebrow>
          <div className="w-[72px] rounded-xl border border-line bg-surface px-3 py-3">
            <StarredNav mini />
          </div>
        </div>
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <StarredCard />
          <Card className="px-5 pb-3 pt-4">
            <h2 className="m-0 mb-2 text-lead font-semibold">Star buttons</h2>
            <ul className="m-0 list-none p-0">
              {SAMPLES.map(([kind, id]) => {
                const n = name(kind, id);
                if (!n) return null;
                return (
                  <li key={kind + id} className="flex items-center gap-3 border-t border-divider py-1.5">
                    <span className="min-w-0 flex-1 truncate text-body">{n}</span>
                    <span className="text-small text-mute-2">{kind}</span>
                    <StarButton kind={kind} id={id} name={n} />
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>

      <h2 className="mb-3 mt-10 text-title font-semibold">Results on an offer</h2>
      <nav aria-label="Preview offer" className="mb-5 flex flex-wrap gap-2">
        {OFFERS.map((id) => {
          const o = ws.offer(id);
          if (!o) return null;
          const on = id === offerId;
          return (
            <Link key={id} href={`/dev/stars-results?offer=${id}`} aria-current={on ? "page" : undefined} scroll={false}
              className={cx("inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-meta font-medium", on ? "border-accent bg-soft text-ink" : "border-line bg-surface text-mute-1 hover:text-ink")}>
              {o.name}<ResultBadge offerId={id} />
            </Link>
          );
        })}
      </nav>
      {offer ? <OfferPreview key={offer.id} offerId={offer.id} /> : <p className="text-body text-mute-2">That offer is not here.</p>}

      <h2 className="mb-3 mt-10 text-title font-semibold">What worked</h2>
      <div className="grid items-start gap-5 md:grid-cols-2">
        <div>
          <Eyebrow className="mb-2">Brand: Quokka For Good</Eyebrow>
          <WhatWorked brandId="br1" />
        </div>
        <div>
          <Eyebrow className="mb-2">Everything I can see</Eyebrow>
          <WhatWorked />
        </div>
      </div>
    </Page>
  );
}

function OfferPreview({ offerId }: { offerId: string }) {
  const { ws } = useApp();
  const offer = ws.offer(offerId)!;
  // "s" stars the offer on its page; wired here so the preview can try it.
  useStarShortcut("offer", offer.id, offer.name);
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-lead font-semibold">{offer.name}</span>
        <StarButton kind="offer" id={offer.id} name={offer.name} />
        <span className="text-small text-mute-2">Press S to star or unstar.</span>
      </div>
      <OfferResults offer={offer} />
    </div>
  );
}
