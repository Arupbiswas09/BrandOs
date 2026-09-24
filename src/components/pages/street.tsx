"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { AlarmClock, ArrowRight, Building2, CheckCircle2, Circle, ClipboardCheck, History, Inbox, Rocket, Sparkles, X } from "lucide-react";
import { useDayPart, useStored } from "@/lib/stored";
import { hexA, onColor, readable } from "@/lib/color";
import { NEUTRAL } from "@/lib/constants";
import { href } from "@/lib/routes";
import { live, plural } from "@/lib/ws";
import { useApp } from "@/components/app/provider";
import { Avatar, Card, DueBadge, Eyebrow, IconTile, Page, Tabs, cx } from "@/components/ui";
import { SpotArt, WaveArt } from "@/components/art";

type Row = { key: string; label: string; sub: string; dueAt: Date | null; dot: string; badge?: string; go: () => void };
const TABS = ["mine", "due", "activity"] as const;
type Tab = (typeof TABS)[number];
const LIMIT = 6;

export function Street() {
  const { ws, openAsset, open, setInbox } = useApp();
  const router = useRouter();
  const me = ws.me;
  const [tab, setTab] = useStored<Tab>("bos:home-tab", "mine", TABS);
  const [hideSetup, setHideSetup] = useStored<"0" | "1">("bos:hide-setup", "0", ["0", "1"]);
  const greeting = `${useDayPart()}, ${me.name.split(" ")[0]}`;

  const queue = useMemo(() => ws.queue(), [ws]);
  const dated = useMemo(() => ws.dated().filter((d) => !d.done), [ws]);
  const now = ws.d.now;
  const week = now + 7 * 86_400_000;
  const overdue = dated.filter((d) => +d.dueAt < now);
  const dueWeek = dated.filter((d) => +d.dueAt >= now && +d.dueAt <= week);
  const mine = queue.filter((q) => q.who === me.id);

  const clients = live(ws.d.clients);
  const brands = live(ws.d.brands);
  const assets = live(ws.d.assets);
  const liveAssets = assets.filter((a) => a.status === "Live").length;

  const goItem = (kind: "asset" | "offer", id: string) => (kind === "asset" ? openAsset(id) : router.push(href.offer(id)));

  const mineRows: Row[] = mine.map((q) => ({
    key: q.kind + q.id, label: q.name, sub: q.sub, dueAt: q.dueAt as Date | null,
    dot: q.act === "review" ? "#B45309" : "#C2410C", badge: q.verb, go: () => goItem(q.kind, q.id),
  }));
  const dueRows: Row[] = [...overdue, ...dueWeek].map((d) => ({
    key: "d" + d.kind + d.id, label: d.name, sub: d.sub, dueAt: d.dueAt, dot: d.color, go: () => goItem(d.kind, d.id),
  }));

  const continueItems = ws.d.recents.map((r) => {
    if (r.kind === "brand") { const b = ws.brand(r.itemId); return b && !b.archived && { key: "b" + b.id, title: b.name, sub: `Brand · ${ws.client(b.clientId)?.name}`, code: b.mark, color: b.primary, go: () => router.push(href.brand(b.id)) }; }
    if (r.kind === "offer") { const o = ws.offer(r.itemId); const b = ws.brand(o?.brandId); return o && !o.archived && { key: "o" + o.id, title: o.name, sub: `Offer · ${b?.name}`, code: "OF", color: b?.primary ?? NEUTRAL, go: () => router.push(href.offer(o.id)) }; }
    if (r.kind === "service") { const v = ws.service(r.itemId); const b = ws.brand(v?.brandId); return v && !v.archived && { key: "s" + v.id, title: v.name, sub: `Service · ${b?.name}`, code: "SVC", color: b?.primary ?? NEUTRAL, go: () => router.push(href.service(v.id)) }; }
    if (r.kind === "client") { const c = ws.client(r.itemId); return c && !c.archived && { key: "c" + c.id, title: c.name, sub: `Client · ${c.kind}`, code: "CL", color: NEUTRAL, go: () => router.push(href.client(c.id)) }; }
    const a = ws.asset(r.itemId); const b = ws.brand(a?.brandId);
    return a && !a.archived && { key: "a" + a.id, title: a.name, sub: `Asset · ${b?.name ?? "Global Library"}`, code: ws.codeOf(a), color: b?.primary ?? NEUTRAL, go: () => openAsset(a.id) };
  }).filter(Boolean).slice(0, 4) as { key: string; title: string; sub: string; code: string; color: string; go: () => void }[];

  // A short "getting started" list for people who set things up.
  const steps = [
    { done: clients.length > 0, label: "Add your first client", hint: "The organisation you work for.", go: () => open({ kind: "client" }) },
    { done: brands.length > 0, label: "Add a brand", hint: "Each client has one or more brands.", go: () => (clients[0] ? open({ kind: "brand", draft: { clientId: clients[0].id } }) : open({ kind: "client" })) },
    { done: brands.some((b) => b.colours.length > 0 && b.fonts.length > 0), label: "Fill in a Brand Kit", hint: "Colours, fonts, logo and voice.", go: () => brands[0] && router.push(href.brand(brands[0].id, "kit")) },
    { done: ws.d.offers.length > 0, label: "Create an offer", hint: "A campaign or package to sell.", go: () => brands[0] && router.push(href.brand(brands[0].id, "offers")) },
    { done: ws.d.users.length > 1, label: "Invite a teammate", hint: "Choose what they can see and do.", go: () => router.push("/team") },
  ];
  const doneSteps = steps.filter((s) => s.done).length;
  const showSetup = ws.can("structure") && hideSetup === "0" && doneSteps < steps.length;

  const activity = ws.d.activity.slice(0, LIMIT);
  const openActivity = (a: (typeof activity)[number]) => {
    if (a.type === "asset") openAsset(a.itemId);
    else if (a.type === "offer") router.push(href.offer(a.itemId));
    else if (a.type === "brand") router.push(href.brand(a.itemId));
    else if (a.type === "service") router.push(href.service(a.itemId));
    else if (a.type === "client") router.push(href.client(a.itemId));
    else if (a.type === "person") router.push("/team");
  };

  const list = tab === "mine" ? mineRows : tab === "due" ? dueRows : [];
  const tabItems = [
    { key: "mine", label: <>Waiting on you <Count n={mine.length} /></>, active: tab === "mine", onClick: () => setTab("mine") },
    { key: "due", label: <>Due soon <Count n={dueRows.length} tone={overdue.length ? "bad" : undefined} /></>, active: tab === "due", onClick: () => setTab("due") },
    ...(ws.isGuest ? [] : [{ key: "activity", label: "Recent activity", active: tab === "activity", onClick: () => setTab("activity") }]),
  ];

  return (
    <Page>
      <div className="head-band -mt-8 mb-6 pb-6 pt-8 sm:-mt-10 sm:pt-10">
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <Eyebrow className="mb-2">Dashboard</Eyebrow>
            <h1 className="m-0 mb-1.5 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[28px]">{greeting}</h1>
            <p className="m-0 max-w-[60ch] text-[15.5px] text-mute-2 text-pretty">
              {ws.isGuest
                ? "Here is everything your agency has shared with you. Open anything to review it, comment or approve."
                : mine.length
                  ? `${plural(mine.length, "thing")} ${mine.length === 1 ? "needs" : "need"} you today. Everything else is below.`
                  : "Nothing needs you right now. Here is what the team is working on."}
            </p>
          </div>
          <WaveArt className="hidden h-[96px] w-auto flex-none md:block" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Inbox className="h-[18px] w-[18px]" />} label="Waiting on you" value={mine.length} note={mine.length ? "Open your inbox" : "All clear"} onClick={() => setInbox(true)} />
        <Kpi icon={<ClipboardCheck className="h-[18px] w-[18px]" />} label="In review" value={queue.length} note="Across the team" onClick={() => setTab("mine")} />
        <Kpi icon={<AlarmClock className="h-[18px] w-[18px]" />} label="Due this week" value={dueWeek.length} note={overdue.length ? `${overdue.length} overdue` : "Nothing overdue"} bad={overdue.length > 0} href="/calendar" />
        <Kpi icon={<Rocket className="h-[18px] w-[18px]" />} label="Live assets" value={liveAssets} note={`of ${plural(assets.length, "asset")}`} href="/library" />
      </div>

      {showSetup && (
        <Card className="mt-5 overflow-hidden">
          <div className="flex items-start gap-4 border-b border-divider px-5 py-4">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-soft text-accent"><Sparkles className="h-[18px] w-[18px]" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-[16px] font-semibold">Get set up</h2>
              <p className="m-0 mt-0.5 text-[14px] text-mute-2">{doneSteps} of {steps.length} done. Each step takes a minute.</p>
              <div className="mt-2.5 h-1.5 max-w-[320px] overflow-hidden rounded-full bg-wash" role="progressbar" aria-label="Setup progress" aria-valuenow={doneSteps} aria-valuemin={0} aria-valuemax={steps.length}>
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(doneSteps / steps.length) * 100}%` }} />
              </div>
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

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1.55fr_1fr]">
        <Card className="px-5 pb-3">
          <Tabs className="mt-1 border-b border-divider" items={tabItems} />
          <div className="pt-1">
            {tab !== "activity" && list.slice(0, LIMIT).map((a) => (
              <button key={a.key} type="button" onClick={a.go} className="-mx-2 flex w-[calc(100%+16px)] items-center gap-[11px] rounded-[7px] border-t border-divider px-2 py-2.5 text-left transition-colors first:border-t-0 hover:bg-wash">
                <span className="h-2 w-2 flex-none rounded-full" style={{ background: a.dot }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{a.label}</span>
                  <span className="mt-px block truncate text-[14px] text-mute-2">{a.sub}</span>
                </span>
                <DueBadge at={a.dueAt} now={now} className="hidden sm:inline-flex" />
                {a.badge && <span className="flex-none rounded-[5px] px-[7px] py-[3px] text-[12.5px] font-semibold" style={{ background: hexA(a.dot, 0.13), color: readable(a.dot, 0.13) }}>{a.badge}</span>}
              </button>
            ))}
            {tab === "activity" && activity.map((a) => (
              <button key={a.id} type="button" onClick={() => openActivity(a)} className="flex w-full items-center gap-[11px] border-t border-divider py-[10px] text-left first:border-t-0">
                <Avatar initials={ws.user(a.userId).initials} size={24} />
                <span className="min-w-0 flex-1 truncate text-[15px] text-ink-3">{ws.first(a.userId)} {a.action} {a.label}{a.field ? ` — ${a.field}` : ""}</span>
                <span className="flex-none text-[13.5px] text-mute-3">{ws.ago(a.createdAt)}</span>
              </button>
            ))}
            {((tab !== "activity" && !list.length) || (tab === "activity" && !activity.length)) && (
              <div className="flex flex-col items-center py-6 text-center">
                <SpotArt kind={tab === "due" ? "calendar" : "inbox"} />
                <div className="mt-2 text-[15px] font-medium">{tab === "mine" ? "You are all caught up" : tab === "due" ? "Nothing due this week" : "Nothing has happened yet"}</div>
                <div className="text-[14px] text-mute-3">{tab === "mine" ? "Anything sent to you for review or changes shows up here." : tab === "due" ? "Add due dates to offers and assets to see them here." : "Changes the team makes will show up here."}</div>
              </div>
            )}
            {tab === "mine" && list.length > LIMIT && <MoreLink onClick={() => setInbox(true)}>View all {list.length} in your inbox</MoreLink>}
            {tab === "due" && list.length > 0 && <MoreLink href="/calendar">Open the calendar</MoreLink>}
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="px-5 pb-3 pt-4">
            <h2 className="m-0 mb-2 flex items-center gap-2.5 text-[16px] font-semibold"><IconTile><History /></IconTile>Jump back in</h2>
            {continueItems.map((r) => (
              <button key={r.key} type="button" onClick={r.go} className="-mx-2 flex w-[calc(100%+16px)] items-center gap-[11px] rounded-[7px] px-2 py-2 text-left transition-colors hover:bg-wash">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-[11px] font-bold tracking-[0.06em]" style={{ background: hexA(r.color, 0.12), color: readable(r.color) }}>{r.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{r.title}</span>
                  <span className="block truncate text-[13.5px] text-mute-2">{r.sub}</span>
                </span>
              </button>
            ))}
            {!continueItems.length && <div className="py-4 text-[14.5px] text-mute-3">Pages you open will show up here.</div>}
          </Card>

          <Card className="px-5 pb-3 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="m-0 flex items-center gap-2.5 text-[16px] font-semibold"><IconTile><Building2 /></IconTile>Clients <span className="text-[14px] font-normal text-mute-3">{clients.length}</span></h2>
              {ws.can("structure") && <button type="button" onClick={() => open({ kind: "client" })} className="text-[14px] font-medium text-accent hover:underline">+ Add client</button>}
            </div>
            {clients.slice(0, LIMIT).map((c) => {
              const bs = brands.filter((b) => b.clientId === c.id);
              return (
                <Link key={c.id} href={href.client(c.id)} className="group -mx-2 flex items-center gap-[11px] rounded-[7px] px-2 py-2 transition-colors hover:bg-wash">
                  <span className="flex flex-none -space-x-1.5">
                    {bs.slice(0, 3).map((b) => <span key={b.id} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[11px] font-bold ring-2 ring-white" style={{ background: b.primary, color: onColor(b.primary) }}>{b.mark}</span>)}
                    {!bs.length && <span className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-dashed border-line-strong text-[13px] text-mute-4">+</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{c.name}</span>
                    <span className="block truncate text-[13.5px] text-mute-2">{c.kind} · {plural(bs.length, "brand")}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 flex-none text-mute-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
            {!clients.length && (
              <div className="flex flex-col items-center py-4 text-center">
                <SpotArt kind="folder" />
                <div className="mt-1 text-[14.5px] text-mute-2">{ws.can("structure") ? "No clients yet. Add the first one." : "You have not been given any clients yet. Ask an admin."}</div>
              </div>
            )}
            {clients.length > LIMIT && <div className="pt-1 text-[13.5px] text-mute-3">All {clients.length} clients are in the sidebar.</div>}
          </Card>
        </div>
      </div>
    </Page>
  );
}

function Count({ n, tone }: { n: number; tone?: "bad" }) {
  return <span className={cx("ml-1 rounded-full px-1.5 py-px text-[12px] font-semibold", tone === "bad" ? "bg-[#FEE4E2] text-[#B42318]" : "bg-wash text-mute-2")}>{n}</span>;
}

function MoreLink({ children, href: to, onClick }: { children: ReactNode; href?: string; onClick?: () => void }) {
  const cls = "mt-1 flex items-center justify-center gap-1.5 border-t border-divider pt-3 text-[14px] font-medium text-accent hover:underline";
  return to ? <Link href={to} className={cls}>{children}<ArrowRight className="h-4 w-4" /></Link> : <button type="button" onClick={onClick} className={cx(cls, "w-full")}>{children}<ArrowRight className="h-4 w-4" /></button>;
}

function Kpi({ icon, label, value, note, bad, href: to, onClick }: { icon: ReactNode; label: string; value: number; note: string; bad?: boolean; href?: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="flex items-center justify-between">
        <span className="text-[14px] font-medium text-mute-2">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-soft text-accent">{icon}</span>
      </span>
      <span className="mt-1 block text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</span>
      <span className={cx("mt-2 block text-[13px]", bad ? "font-semibold text-[#B42318]" : "text-mute-3")}>{note}</span>
    </>
  );
  const cls = "lift block rounded-xl border border-line bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,.04)]";
  return to ? <Link href={to} className={cls}>{body}</Link> : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}
