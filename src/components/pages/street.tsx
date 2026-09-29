"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { ArrowRight, BookOpen, Building2, CheckCircle2, Circle, History, Inbox, Sparkles, X } from "lucide-react";
import { useDayPart, useStored } from "@/lib/stored";
import { hexA, onColor, readable } from "@/lib/color";
import { NEUTRAL } from "@/lib/constants";
import { href } from "@/lib/routes";
import { live, plural } from "@/lib/ws";
import { useApp } from "@/components/app/provider";
import { ActivityRow } from "@/components/activity-row";
import { Card, Eyebrow, IconTile, Page, cx } from "@/components/ui";
import { SpotArt } from "@/components/art";

const LIMIT = 6;
const DAY = 86_400_000;
/** Reviews older than this read as stuck, the same line the brand health check uses. */
const STUCK_DAYS = 5;

type Row = { key: string; label: string; sub: string; badge: string; tone: string; waited: string; stuck: boolean; go: () => void };

/*
 * The dashboard opens on the list itself, as the prototype did: what is
 * waiting on you, and where you left off. No stat tiles, and no due dates —
 * ClickUp and Asana own time. What BrandOS shows instead is what is stuck:
 * how long something has sat in review.
 */
export function Street() {
  const { ws, openAsset, open, setInbox } = useApp();
  const router = useRouter();
  const me = ws.me;
  const [hideSetup, setHideSetup] = useStored<"0" | "1">("bos:hide-setup", "0", ["0", "1"]);
  const greeting = `${useDayPart()}, ${me.name.split(" ")[0]}.`;
  const now = ws.d.now;

  const queue = useMemo(() => ws.queue(), [ws]);
  const mine = queue.filter((q) => q.who === me.id);
  const others = queue.length - mine.length;

  const clients = live(ws.d.clients);
  const brands = live(ws.d.brands);
  const ideation = live(ws.d.offers).filter((o) => o.status === "Ideation");

  const waited = (updated: Date | string | undefined, act: "review" | "change") => {
    const days = updated ? Math.max(0, Math.floor((now - +new Date(updated)) / DAY)) : 0;
    const text = act === "review"
      ? (days === 0 ? "In review since today" : `In review for ${plural(days, "day")}`)
      : (days === 0 ? "Sent back today" : `Sent back ${plural(days, "day")} ago`);
    return { text, stuck: days >= STUCK_DAYS };
  };

  const already = new Set(mine.map((q) => q.kind + q.id));
  const rows: Row[] = [
    ...mine.map((q) => {
      const item = q.kind === "asset" ? ws.asset(q.id) : ws.offer(q.id);
      const w = waited(item?.updatedAt, q.act);
      const tone = q.act === "review" ? "#B45309" : "#C2410C";
      return { key: q.kind + q.id, label: q.name, sub: q.sub, badge: q.verb, tone, waited: w.text, stuck: w.stuck, go: () => (q.kind === "asset" ? openAsset(q.id) : router.push(href.offer(q.id))) };
    }),
    // Ideas nobody has picked up yet, as in the prototype.
    ...ideation.filter((o) => !already.has("offer" + o.id) && o.ownerId === me.id).slice(0, 3).map((o) => ({
      key: "i" + o.id, label: o.name, sub: `${ws.brand(o.brandId)?.name} · ${plural(ws.linkedAssetIds(o.id).length, "asset")}`,
      badge: "Ideation", tone: "#6D5BD0", waited: `Idea since ${ws.ago(o.createdAt)}`, stuck: false, go: () => router.push(href.offer(o.id)),
    })),
  ];

  const continueItems = ws.d.recents.map((r) => {
    if (r.kind === "brand") { const b = ws.brand(r.itemId); return b && !b.archived && { key: "b" + b.id, title: b.name, sub: `Brand · ${ws.client(b.clientId)?.name}`, code: b.mark, color: b.primary, go: () => router.push(href.brand(b.id)) }; }
    if (r.kind === "offer") { const o = ws.offer(r.itemId); const b = ws.brand(o?.brandId); return o && !o.archived && { key: "o" + o.id, title: o.name, sub: `Offer · ${b?.name}`, code: "OF", color: b?.primary ?? NEUTRAL, go: () => router.push(href.offer(o.id)) }; }
    if (r.kind === "service") { const v = ws.service(r.itemId); const b = ws.brand(v?.brandId); return v && !v.archived && { key: "s" + v.id, title: v.name, sub: `Service · ${b?.name}`, code: "SVC", color: b?.primary ?? NEUTRAL, go: () => router.push(href.service(v.id)) }; }
    if (r.kind === "client") { const c = ws.client(r.itemId); return c && !c.archived && { key: "c" + c.id, title: c.name, sub: `Client · ${c.kind}`, code: "CL", color: NEUTRAL, go: () => router.push(href.client(c.id)) }; }
    const a = ws.asset(r.itemId); const b = ws.brand(a?.brandId);
    return a && !a.archived && { key: "a" + a.id, title: a.name, sub: `Asset · ${b?.name ?? "Global Library"}`, code: ws.codeOf(a), color: b?.primary ?? NEUTRAL, go: () => openAsset(a.id) };
  }).filter(Boolean).slice(0, 5) as { key: string; title: string; sub: string; code: string; color: string; go: () => void }[];

  // A short "getting started" list for admins, after the lists rather than before them.
  const steps = [
    { done: clients.length > 0, label: "Add your first client", hint: "The organisation you work for.", go: () => open({ kind: "client" }) },
    { done: brands.length > 0, label: "Add a brand", hint: "Each client has one or more brands.", go: () => (clients[0] ? open({ kind: "brand", draft: { clientId: clients[0].id } }) : open({ kind: "client" })) },
    { done: brands.some((b) => b.colours.length > 0 && b.fonts.length > 0), label: "Fill in a Brand Kit", hint: "Colours, fonts, logo and voice.", go: () => brands[0] && router.push(href.brand(brands[0].id, "kit")) },
    { done: ws.d.offers.length > 0, label: "Create an offer", hint: "A campaign or package to sell.", go: () => brands[0] && router.push(href.brand(brands[0].id, "offers")) },
    { done: ws.d.users.length > 1, label: "Invite a teammate", hint: "Choose what they can see and do.", go: () => router.push("/team") },
  ];
  const doneSteps = steps.filter((s) => s.done).length;
  const showSetup = ws.can("access") && hideSetup === "0" && doneSteps < steps.length;

  const activity = ws.d.activity.slice(0, 7);
  const openActivity = (a: (typeof activity)[number]) => {
    if (a.type === "asset") return () => openAsset(a.itemId);
    if (a.type === "offer") return () => router.push(href.offer(a.itemId));
    if (a.type === "brand") return () => router.push(href.brand(a.itemId));
    if (a.type === "service") return () => router.push(href.service(a.itemId));
    if (a.type === "client") return () => router.push(href.client(a.itemId));
    return undefined;
  };

  const inReview = queue.length;
  const summary = ws.isGuest
    ? "Here is everything your agency has shared with you."
    : `${plural(clients.length, "client")}, ${plural(brands.length, "brand")}. ` +
      (inReview + ideation.length === 0 ? "Nothing is moving through review." : `${plural(inReview, "thing")} in review, ${plural(ideation.length, "offer")} still just an idea.`);

  return (
    <Page>
      <div className="head-band -mt-8 mb-6 pb-6 pt-8 sm:-mt-10 sm:pt-10">
        <Eyebrow className="mb-2">Dashboard</Eyebrow>
        <h1 className="m-0 mb-1.5 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[28px]">{greeting}</h1>
        <p className="m-0 max-w-[62ch] text-[15.5px] text-mute-2 text-pretty">{summary}</p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card className="px-5 pb-3 pt-4">
          <div className="mb-0.5 flex items-baseline justify-between gap-3">
            <h2 className="m-0 flex items-center gap-2.5 text-[16px] font-semibold"><IconTile><Inbox /></IconTile>Waiting on you</h2>
            <span className="text-[14px] text-mute-3">{mine.length ? `${mine.length} on you` : "Clear"}</span>
          </div>
          <p className="m-0 mb-2 text-[14px] text-mute-3">{mine.length ? "Assigned to you by name" : "Nothing is assigned to you"}{others ? `. ${plural(others, "thing")} with other people.` : "."}</p>
          {rows.slice(0, LIMIT).map((r) => (
            <button key={r.key} type="button" onClick={r.go} className="-mx-2 flex w-[calc(100%+16px)] items-center gap-[11px] rounded-[8px] border-t border-divider px-2 py-2.5 text-left transition-colors hover:bg-wash">
              <span aria-hidden className="h-2 w-2 flex-none rounded-full" style={{ background: r.tone }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{r.label}</span>
                <span className="mt-px block truncate text-[13.5px] text-mute-2">{r.sub}</span>
                {/* How long it has been stuck, instead of a deadline. */}
                <span className={cx("mt-0.5 block text-[13px]", r.stuck ? "font-semibold text-[#8A5300]" : "text-mute-3")}>{r.waited}</span>
              </span>
              <span className="flex-none rounded-[5px] px-[7px] py-[3px] text-[12.5px] font-semibold" style={{ background: hexA(r.tone, 0.13), color: readable(r.tone, 0.13) }}>{r.badge}</span>
            </button>
          ))}
          {!rows.length && (
            <div className="flex flex-col items-center border-t border-divider py-6 text-center">
              <SpotArt kind="inbox" />
              <div className="mt-2 text-[15px] font-medium">You are all caught up</div>
              <div className="text-[14px] text-mute-3">Anything sent to you for review or changes shows up here.</div>
            </div>
          )}
          {rows.length > LIMIT && <MoreLink onClick={() => setInbox(true)}>See all {rows.length} in your inbox</MoreLink>}
        </Card>

        <Card className="px-5 pb-3 pt-4">
          <h2 className="m-0 mb-0.5 flex items-center gap-2.5 text-[16px] font-semibold"><IconTile><History /></IconTile>Continue where you left off</h2>
          <p className="m-0 mb-2 text-[14px] text-mute-3">The last places you were working.</p>
          {continueItems.map((r) => (
            <button key={r.key} type="button" onClick={r.go} className="-mx-2 flex w-[calc(100%+16px)] items-center gap-[11px] rounded-[8px] border-t border-divider px-2 py-2.5 text-left transition-colors hover:bg-wash">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md font-mono text-[11px] font-bold tracking-[0.04em]" style={{ background: hexA(r.color, 0.12), color: readable(r.color) }}>{r.code}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{r.title}</span>
                <span className="block truncate text-[13.5px] text-mute-2">{r.sub}</span>
              </span>
              <ArrowRight aria-hidden className="h-4 w-4 flex-none text-mute-4" />
            </button>
          ))}
          {!continueItems.length && <div className="border-t border-divider py-5 text-[14.5px] text-mute-3">Open a brand, an offer or an asset and it will show up here.</div>}
        </Card>
      </div>

      {showSetup && (
        <Card className="mt-5 overflow-hidden">
          <div className="flex items-start gap-4 border-b border-divider px-5 py-4">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-soft text-accent"><Sparkles className="h-[18px] w-[18px]" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-[16px] font-semibold">Get set up</h2>
              <p className="m-0 mt-0.5 text-[14px] text-mute-2">{doneSteps} of {steps.length} done.</p>
            </div>
            <button type="button" onClick={() => setHideSetup("1")} aria-label="Hide the setup guide" className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-mute-3 hover:bg-hover hover:text-ink"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((s) => (
              <button key={s.label} type="button" onClick={s.go} disabled={s.done} className="flex items-start gap-2.5 border-b border-divider px-5 py-3.5 text-left last:border-b-0 hover:bg-wash disabled:cursor-default disabled:hover:bg-transparent lg:border-b-0 lg:border-r lg:last:border-r-0">
                {s.done ? <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] flex-none text-ok" /> : <Circle className="mt-0.5 h-[18px] w-[18px] flex-none text-mute-4" />}
                <span className="min-w-0">
                  <span className={cx("block text-[14.5px] font-medium", s.done && "text-mute-3 line-through")}>{s.label}</span>
                  <span className="block text-[13px] text-mute-3">{s.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-10">
        <div className="mb-3.5 flex items-baseline justify-between gap-4">
          <h2 className="m-0 flex items-center gap-2.5 text-[17px] font-semibold"><IconTile><Building2 /></IconTile>Clients</h2>
          {ws.can("structure") && <button type="button" onClick={() => open({ kind: "client" })} className="text-[14.5px] font-medium text-accent hover:underline">+ Add client</button>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => {
            const bs = brands.filter((b) => b.clientId === c.id);
            const ids = new Set(bs.map((b) => b.id));
            const os = live(ws.d.offers).filter((o) => ids.has(o.brandId)).length;
            const as = live(ws.d.assets).filter((a) => a.brandId && ids.has(a.brandId)).length;
            return (
              <Link key={c.id} href={href.client(c.id)} className="lift flex flex-col gap-3.5 rounded-[14px] border border-line bg-white p-5 text-left">
                <span className="flex gap-[5px]">
                  {bs.map((b) => <span key={b.id} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[11.5px] font-bold" style={{ background: b.primary, color: onColor(b.primary) }}>{b.mark}</span>)}
                  {!bs.length && <span className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-dashed border-line-strong text-[13.5px] text-mute-4">+</span>}
                </span>
                <span className="block">
                  <span className="block text-[16px] font-semibold tracking-[-0.01em]">{c.name}</span>
                  <span className="mt-[3px] block text-[14.5px] text-mute-2">{c.kind}</span>
                </span>
                <span className="flex flex-wrap gap-x-4 gap-y-1 border-t border-divider pt-3 text-[14px] text-mute-1">
                  <span>{plural(bs.length, "brand")}</span><span>{plural(os, "offer")}</span><span>{plural(as, "asset")}</span>
                </span>
              </Link>
            );
          })}
        </div>
        {!clients.length && (
          <div className="flex flex-col items-center rounded-[14px] border border-dashed border-line-strong p-8 text-center">
            <SpotArt kind="folder" />
            <div className="mt-1 text-[15px] text-mute-2">{ws.can("structure") ? "No clients yet. Add the first one." : "You have not been given any clients yet. Ask an admin."}</div>
          </div>
        )}
      </div>

      {!ws.isGuest && (
        <div className="mt-10 grid items-start gap-5 md:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="m-0 mb-3.5 text-[17px] font-semibold">Recent activity</h2>
            <Card className="px-5 py-1.5">
              {activity.map((a) => <ActivityRow key={a.id} a={a} onOpen={openActivity(a)} />)}
              {!activity.length && <div className="py-6 text-center text-[15px] text-mute-3">Nothing has happened yet.</div>}
            </Card>
          </div>
          <div>
            <h2 className="m-0 mb-3.5 text-[17px] font-semibold">Shared across every client</h2>
            <Link href="/library" className="lift block rounded-[14px] border border-dashed border-line-strong bg-white p-5 text-left">
              <span className="mb-1 flex items-center gap-2 text-[15.5px] font-semibold"><BookOpen aria-hidden className="h-[18px] w-[18px] text-accent" />Global Library</span>
              <span className="block text-[14.5px] leading-[1.5] text-mute-2 text-pretty">Checklists, prompts, templates, SOPs and ad creatives. Nothing in here belongs to one brand.</span>
              <span className="mt-3 inline-flex items-center gap-1 text-[14.5px] font-semibold text-accent">Open the library<ArrowRight aria-hidden className="h-4 w-4" /></span>
            </Link>
          </div>
        </div>
      )}
    </Page>
  );
}

function MoreLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-1 flex w-full items-center justify-center gap-1.5 border-t border-divider pt-3 text-[14px] font-medium text-accent hover:underline">
      {children}<ArrowRight aria-hidden className="h-4 w-4" />
    </button>
  );
}
