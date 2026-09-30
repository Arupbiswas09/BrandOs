"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Brand } from "@/db/schema";
import { href } from "@/lib/routes";
import { live } from "@/lib/ws";
import { useApp } from "./app/provider";
import { ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleDashed, ShieldCheck } from "lucide-react";
import { hexA, readable } from "@/lib/color";
import { Card, cx } from "./ui";
import { IconTile } from "./polish";

type Item = { id: string; name: string; kind: "offer" | "asset" | "service" };
/**
 * `seen` is how many things the check looked at. A check that looked at
 * nothing has not passed; it has nothing to inspect yet, and says so.
 */
type Check = { key: string; ok: string; idle: string; bad: (n: number) => string; items: Item[]; seen: number };

const DAY = 86_400_000;
const PLACEHOLDER = /^(not written|draft|tbc|todo|in progress)/i;

/** Plain-language checks for one brand, each pointing at the things to fix. */
function inspect(ws: ReturnType<typeof useApp>["ws"], b: Brand): Check[] {
  const offers = live(ws.offersOf(b.id)).filter((o) => o.status !== "Archived");
  const assets = live(ws.assetsOf(b.id)).filter((a) => ws.catOf(a) === "campaign");
  const now = ws.d.now;
  const asO = (o: { id: string; name: string }): Item => ({ id: o.id, name: o.name, kind: "offer" });
  const asA = (a: { id: string; name: string }): Item => ({ id: a.id, name: a.name, kind: "asset" });

  const gaps: Item[] = [];
  const segs = b.segments.filter((sg) => sg.name !== "All segments");
  let written = 0;
  for (const v of live(ws.servicesOf(b.id))) {
    const so = live(ws.offersOfService(v.id));
    if (!so.length) continue;
    written += 1;
    if (so.some((o) => o.segment === "All segments")) continue;
    const have = new Set(so.map((o) => o.segment));
    segs.filter((sg) => !have.has(sg.name)).forEach((sg) => gaps.push({ id: v.id, name: `${v.name} for ${sg.name}`, kind: "service" }));
  }
  const inReview = [...offers, ...assets].filter((x) => x.review === "In review").length;
  const cleared = live(ws.assetsOf(b.id)).filter((a) => a.clientVisible);

  return [
    { key: "proof", ok: "Every offer has a proof point", idle: "Proof points: no offers yet", bad: (n) => `${n} offer${n === 1 ? " has" : "s have"} no real proof yet`, items: offers.filter((o) => !o.proof.trim() || PLACEHOLDER.test(o.proof.trim())).map(asO), seen: offers.length },
    { key: "cta", ok: "Every offer says what to do next", idle: "Calls to action: no offers yet", bad: (n) => `${n} offer${n === 1 ? " has" : "s have"} no call to action`, items: offers.filter((o) => !o.primaryCtaId).map(asO), seen: offers.length },
    { key: "goal", ok: "Every offer chases a goal", idle: "Goals: no offers yet", bad: (n) => `${n} offer${n === 1 ? " chases" : "s chase"} no goal`, items: offers.filter((o) => !o.goals.length).map(asO), seen: offers.length },
    { key: "linked", ok: "Every campaign asset supports an offer", idle: "Offer links: no campaign assets yet", bad: (n) => `${n} asset${n === 1 ? " is" : "s are"} not linked to any offer`, items: assets.filter((a) => !ws.linkedOfferIds(a.id).length).map(asA), seen: assets.length },
    { key: "coverage", ok: "Every service is written for every segment", idle: segs.length ? "Segment coverage: no services with offers yet" : "Segment coverage: no segments yet", bad: (n) => `${n} service and segment combination${n === 1 ? " is" : "s are"} unwritten`, items: gaps, seen: segs.length ? written : 0 },
    { key: "stuck", ok: "No review has waited more than five days", idle: "Reviews: nothing is in review", bad: (n) => `${n} review${n === 1 ? " has" : "s have"} waited more than five days`, items: [
      ...offers.filter((o) => o.review === "In review" && now - +new Date(o.updatedAt) > 5 * DAY).map(asO),
      ...assets.filter((a) => a.review === "In review" && now - +new Date(a.updatedAt) > 5 * DAY).map(asA),
    ], seen: inReview },
    { key: "cleared", ok: "Everything cleared to send is approved", idle: "Cleared to send: no assets cleared yet", bad: (n) => `${n} asset${n === 1 ? " is" : "s are"} cleared to send without approval`, items: cleared.filter((a) => a.review !== "Approved").map(asA), seen: cleared.length },
  ];
}

export function BrandHealth({ b }: { b: Brand }) {
  const { ws, openAsset } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const all = inspect(ws, b);
  // Only checks that had something to look at can pass or fail.
  const checks = all.filter((c) => c.seen > 0);
  const idle = all.filter((c) => c.seen === 0);
  const failing = checks.filter((c) => c.items.length);
  const passing = checks.length - failing.length;
  const pct = checks.length ? Math.round((passing / checks.length) * 100) : 0;
  const tone = pct >= 85 ? "#277A53" : pct >= 60 ? "#8A6A12" : "#B42318";
  const go = (it: Item) => (it.kind === "asset" ? openAsset(it.id) : it.kind === "offer" ? router.push(href.offer(it.id)) : router.push(href.service(it.id)));

  return (
    <div className="mt-10">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <IconTile icon={ShieldCheck} size={36} />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em]">Building inspection</h2>
          <p className="m-0 mt-0.5 text-[14.5px] text-mute-3">What would trip up a reader or a reviewer, found for you. Fix these and the brand is ready to ship.</p>
        </div>
        {checks.length > 0
          ? <span className="flex-none rounded-full px-3 py-1 text-[14px] font-semibold tabular-nums" style={{ background: hexA(tone, 0.1), color: readable(tone, 0.1) }}>{passing} of {checks.length} checks pass</span>
          : <span className="flex-none rounded-full bg-chip px-3 py-1 text-[14px] font-semibold text-mute-2">Nothing to inspect yet</span>}
      </div>
      {checks.length === 0 ? (
        <p className="m-0 rounded-xl border border-dashed border-line-strong bg-white/60 px-5 py-4 text-[14.5px] text-mute-2">Add an offer or a campaign asset and the checks run on it.</p>
      ) : (
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-avatar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Checks passing">
            <div className="h-full transition-[width] duration-500" style={{ width: `${pct}%`, background: tone }} />
          </div>
          {failing.map((c) => (
            <div key={c.key} className="border-t border-divider first:border-t-0">
              <button type="button" aria-expanded={open === c.key} onClick={() => setOpen(open === c.key ? null : c.key)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-wash focus-visible:outline-offset-[-2px]">
                <CircleAlert aria-hidden size={20} className="flex-none text-[#8A6A12]" />
                <span className="flex-1 text-[15px] font-medium">{c.bad(c.items.length)}</span>
                <span className="inline-flex items-center gap-1 text-[13px] font-medium text-mute-3">{open === c.key ? "Hide" : "Show"}{open === c.key ? <ChevronDown aria-hidden size={15} /> : <ChevronRight aria-hidden size={15} />}</span>
              </button>
              {open === c.key && (
                <div className="flex flex-col items-start gap-1.5 px-5 pb-4 pl-[52px]">
                  {c.items.slice(0, 12).map((it) => (
                    <button key={it.kind + it.id + it.name} type="button" onClick={() => go(it)} className="text-left text-[14.5px] text-accent hover:underline">{it.name} →</button>
                  ))}
                  {c.items.length > 12 && <span className="text-[13.5px] text-mute-3">and {c.items.length - 12} more</span>}
                </div>
              )}
            </div>
          ))}
          {passing > 0 && (
            <div className={cx("grid gap-x-6 px-5 py-3.5 sm:grid-cols-2", failing.length > 0 && "border-t border-divider bg-wash-2")}>
              {checks.filter((c) => !c.items.length).map((c) => (
                <div key={c.key} className="flex items-center gap-3 py-1 text-[14.5px] text-mute-2">
                  <CircleCheck aria-hidden size={20} className="flex-none text-[#277A53]" />{c.ok}
                </div>
              ))}
            </div>
          )}
          {/* Checks with nothing to look at yet: neither a pass nor a fail. */}
          {idle.length > 0 && (
            <div className="grid gap-x-6 border-t border-divider px-5 py-3 sm:grid-cols-2">
              {idle.map((c) => (
                <div key={c.key} className="flex items-center gap-3 py-1 text-[14px] text-mute-3">
                  <CircleDashed aria-hidden size={18} className="flex-none text-mute-4" />{c.idle}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
