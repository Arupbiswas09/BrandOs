"use client";

import Link from "next/link";
import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { useApp } from "@/components/app/provider";
import { Card, IconTile, cx } from "@/components/ui";
import { MIN_LEADS, whatWorked, type Insight } from "@/lib/results";
import { href } from "@/lib/routes";

/**
 * Up to three plain sentences about what converts best, from the results
 * recorded on these offers: one brand (with its sub-brands), one client, one
 * service, or everything I can see. Only offers with at least MIN_LEADS leads
 * count. Renders nothing until two of them can be compared.
 */
export function WhatWorked({ brandId, clientId, serviceId, as: H = "h2", className }: {
  brandId?: string;
  clientId?: string;
  serviceId?: string;
  /** The heading level where it is mounted. */
  as?: "h2" | "h3";
  className?: string;
}) {
  const { ws } = useApp();
  const insights = useMemo(() => {
    const offers = ws.d.offers.filter((o) => {
      if (serviceId) return o.serviceId === serviceId;
      const b = ws.brand(o.brandId);
      if (brandId) return o.brandId === brandId || b?.parentId === brandId;
      if (clientId) return b?.clientId === clientId;
      return true;
    });
    const ids = new Set(offers.map((o) => o.id));
    return whatWorked(offers, ws.d.offerResults.filter((r) => ids.has(r.offerId)), { serviceName: (id) => ws.service(id)?.name });
  }, [ws, brandId, clientId, serviceId]);

  if (!insights.length) return null;
  return (
    <Card className={cx("px-5 pb-3 pt-4", className)}>
      <H className="m-0 mb-0.5 flex items-center gap-2.5 text-lead font-semibold"><IconTile><TrendingUp /></IconTile>What worked</H>
      <p className="m-0 mb-2 text-meta text-mute-3">From recorded results with at least {MIN_LEADS} leads.</p>
      <ul className="m-0 list-none p-0">
        {insights.map((i) => <Line key={i.key} i={i} />)}
      </ul>
    </Card>
  );
}

function Line({ i }: { i: Insight }) {
  const to = i.link.kind === "offer" ? href.offer(i.link.id) : href.service(i.link.id);
  const link = "font-semibold text-accent hover:underline";
  // When the sentence starts with the thing it is about, that name is the link; otherwise the link follows.
  const named = i.text.startsWith(i.link.label);
  return (
    <li className="border-t border-divider py-2.5 text-body leading-[1.5] text-ink text-pretty">
      {named ? (
        <><Link href={to} className={link}>{i.link.label}</Link>{i.text.slice(i.link.label.length)}</>
      ) : (
        <>
          {i.text}
          <Link href={to} className={cx(link, "mt-0.5 block w-fit text-meta")}>Open {i.link.label}</Link>
        </>
      )}
    </li>
  );
}
