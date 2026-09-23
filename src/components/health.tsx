"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Brand } from "@/db/schema";
import { href } from "@/lib/routes";
import { live } from "@/lib/ws";
import { useApp } from "./app/provider";
import { Card, cx } from "./ui";

type Item = { id: string; name: string; kind: "offer" | "asset" | "service" };
type Check = { key: string; ok: string; bad: (n: number) => string; items: Item[] };

const DAY = 86_400_000;
const PLACEHOLDER = /^(not written|draft|tbc|todo|in progress)/i;

/** Plain-language checks for one brand, each pointing at the things to fix. */
function inspect(ws: ReturnType<typeof useApp>["ws"], b: Brand): Check[] {
  const offers = live(ws.offersOf(b.id)).filter((o) => o.status !== "Archived");
  const assets = live(ws.assetsOf(b.id)).filter((a) => ws.catOf(a) === "campaign");
  const now = ws.d.now;
  const start = new Date(new Date(now).toDateString()).getTime();
  const asO = (o: { id: string; name: string }): Item => ({ id: o.id, name: o.name, kind: "offer" });
  const asA = (a: { id: string; name: string }): Item => ({ id: a.id, name: a.name, kind: "asset" });

  const gaps: Item[] = [];
  for (const v of live(ws.servicesOf(b.id))) {
    const so = live(ws.offersOfService(v.id));
    if (!so.length || so.some((o) => o.segment === "All segments")) continue;
    const have = new Set(so.map((o) => o.segment));
    b.segments.filter((sg) => sg.name !== "All segments" && !have.has(sg.name)).forEach((sg) => gaps.push({ id: v.id, name: `${v.name} for ${sg.name}`, kind: "service" }));
  }

  return [
    { key: "proof", ok: "Every offer has a proof point", bad: (n) => `${n} offer${n === 1 ? " has" : "s have"} no real proof yet`, items: offers.filter((o) => !o.proof.trim() || PLACEHOLDER.test(o.proof.trim())).map(asO) },
    { key: "cta", ok: "Every offer says what to do next", bad: (n) => `${n} offer${n === 1 ? " has" : "s have"} no call to action`, items: offers.filter((o) => !o.primaryCtaId).map(asO) },
    { key: "goal", ok: "Every offer chases a goal", bad: (n) => `${n} offer${n === 1 ? " chases" : "s chase"} no goal`, items: offers.filter((o) => !o.goals.length).map(asO) },
    { key: "linked", ok: "Every campaign asset supports an offer", bad: (n) => `${n} asset${n === 1 ? " is" : "s are"} not linked to any offer`, items: assets.filter((a) => !ws.linkedOfferIds(a.id).length).map(asA) },
    { key: "coverage", ok: "Every service is written for every segment", bad: (n) => `${n} service and segment combination${n === 1 ? " is" : "s are"} unwritten`, items: gaps },
    { key: "overdue", ok: "Nothing is overdue", bad: (n) => `${n} item${n === 1 ? " is" : "s are"} overdue`, items: [
      ...offers.filter((o) => o.dueAt && o.status !== "Active" && +new Date(o.dueAt) < start).map(asO),
      ...assets.filter((a) => a.dueAt && a.status !== "Live" && +new Date(a.dueAt) < start).map(asA),
    ] },
    { key: "stuck", ok: "No review has waited more than five days", bad: (n) => `${n} review${n === 1 ? " has" : "s have"} waited more than five days`, items: [
      ...offers.filter((o) => o.review === "In review" && now - +new Date(o.updatedAt) > 5 * DAY).map(asO),
      ...assets.filter((a) => a.review === "In review" && now - +new Date(a.updatedAt) > 5 * DAY).map(asA),
    ] },
    { key: "cleared", ok: "Everything cleared to send is approved", bad: (n) => `${n} asset${n === 1 ? " is" : "s are"} cleared to send without approval`, items: live(ws.assetsOf(b.id)).filter((a) => a.clientVisible && a.review !== "Approved").map(asA) },
  ];
}

export function BrandHealth({ b }: { b: Brand }) {
  const { ws, openAsset } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const checks = inspect(ws, b);
  const failing = checks.filter((c) => c.items.length);
  const passing = checks.length - failing.length;
  const pct = Math.round((passing / checks.length) * 100);
  const tone = pct >= 85 ? "#277A53" : pct >= 60 ? "#8A6A12" : "#B42318";
  const go = (it: Item) => (it.kind === "asset" ? openAsset(it.id) : it.kind === "offer" ? router.push(href.offer(it.id)) : router.push(href.service(it.id)));

  return (
    <div className="mt-11">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h2 className="m-0 text-[17px] font-semibold">Building inspection</h2>
        <span className="text-[15px] font-semibold" style={{ color: tone }}>{passing} of {checks.length} checks pass</span>
      </div>
      <p className="mb-4 mt-0 text-[14.5px] text-mute-3">What would trip up a reader or a reviewer, found for you. Fix these and the brand is ready to ship.</p>
      <Card className="overflow-hidden">
        <div className="h-1.5 bg-avatar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Checks passing">
          <div className="h-full transition-[width] duration-500" style={{ width: `${pct}%`, background: tone }} />
        </div>
        {failing.map((c) => (
          <div key={c.key} className="border-t border-divider first:border-t-0">
            <button type="button" aria-expanded={open === c.key} onClick={() => setOpen(open === c.key ? null : c.key)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-wash">
              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[rgba(201,154,46,.16)] text-[12px] font-bold text-[#8A6A12]">!</span>
              <span className="flex-1 text-[15px] font-medium">{c.bad(c.items.length)}</span>
              <span className="text-[13px] text-mute-3">{open === c.key ? "Hide" : "Show"}</span>
            </button>
            {open === c.key && (
              <div className="flex flex-col gap-1 px-5 pb-4 pl-[52px]">
                {c.items.slice(0, 12).map((it) => (
                  <button key={it.kind + it.id + it.name} type="button" onClick={() => go(it)} className="text-left text-[14.5px] text-accent hover:underline">{it.name} →</button>
                ))}
                {c.items.length > 12 && <span className="text-[13.5px] text-mute-3">and {c.items.length - 12} more</span>}
              </div>
            )}
          </div>
        ))}
        <div className={cx("px-5 py-3.5", failing.length > 0 && "border-t border-divider")}>
          {checks.filter((c) => !c.items.length).map((c) => (
            <div key={c.key} className="flex items-center gap-3 py-1 text-[14.5px] text-mute-2">
              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[rgba(39,122,83,.12)] text-[12px] font-bold text-[#277A53]">✓</span>{c.ok}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
