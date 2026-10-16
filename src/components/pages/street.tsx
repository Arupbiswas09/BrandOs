"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { ArrowRight, BookOpen, CheckCircle2, ChevronRight, Circle, Plus, X } from "lucide-react";
import { useDayPart, useStored } from "@/lib/stored";
import { hexA, onColor, readable } from "@/lib/color";
import { NEUTRAL } from "@/lib/constants";
import { href } from "@/lib/routes";
import { live, plural } from "@/lib/ws";
import { markMentionsRead } from "@/app/actions";
import { useApp } from "@/components/app/provider";
import { noteWhere, useOnYou } from "@/components/app/inbox";
import { ActivityRow } from "@/components/activity-row";
import { StarredCard } from "@/components/features/stars/starred-card";
import { useStarredItems } from "@/components/features/stars/starred-list";
import { NAV_STARS } from "@/lib/stars";
import { BrokenLinksCard } from "@/components/features/links/broken-links-card";
import { StartFromExisting } from "@/components/features/onboarding/entry-points";
import { Avatar, Btn, Card, Eyebrow, IconBtn, Page, cx } from "@/components/ui";

const LIMIT = 6;
const DAY = 86_400_000;
/** Reviews older than this read as stuck, the same line the brand health check uses. */
const STUCK_DAYS = 5;

type Tone = "review" | "change" | "mention";
/** One accent per kind of thing waiting. Never red: nothing here is broken. */
const TONE: Record<Tone, string> = {
  review: "bg-warn/12 text-warn-ink",
  change: "bg-change/10 text-change-ink",
  mention: "bg-accent/10 text-accent",
};

type Row = { key: string; label: string; sub: string; badge: string; tone: Tone; waited: string; stuck: boolean; lead: ReactNode; go: () => void };

/*
 * The dashboard opens on the list itself: what is waiting on you, then where
 * you left off. No stat tiles and no due dates (ClickUp and Asana own time);
 * what BrandOS shows instead is what is stuck: how long something has sat
 * in review. Each number appears once: the queue count lives in the sidebar.
 */
export function Street() {
  const { ws, openAsset, open, setInbox } = useApp();
  const router = useRouter();
  const me = ws.me;
  const [hideSetup, setHideSetup] = useStored<"0" | "1">("bos:hide-setup", "0", ["0", "1"]);
  const greeting = `${useDayPart()}, ${me.name.split(" ")[0]}.`;
  const now = ws.d.now;

  const queue = useMemo(() => ws.queue(), [ws]);
  // Exactly the inbox's "On you", in the same order: the sidebar's count and this list never disagree.
  const onYou = useOnYou();
  const others = queue.filter((q) => q.who !== me.id).length;

  const clients = live(ws.d.clients);
  const brands = live(ws.d.brands);
  const starred = useStarredItems().length;

  const waited = (since: number, act: "review" | "change") => {
    const days = Math.max(0, Math.floor((now - since) / DAY));
    const text = act === "review"
      ? (days === 0 ? "In review since today" : `In review for ${plural(days, "day")}`)
      : (days === 0 ? "Sent back today" : `Sent back ${plural(days, "day")} ago`);
    return { text, stuck: days >= STUCK_DAYS };
  };

  const rows: Row[] = onYou.map((x) => {
    if (x.type === "work") {
      const q = x.q;
      const w = waited(x.since, q.act);
      const item = q.kind === "asset" ? ws.asset(q.id) : null;
      const brand = ws.brand(q.kind === "asset" ? item?.brandId : ws.offer(q.id)?.brandId);
      const code = item ? ws.codeOf(item) : "OF";
      return {
        key: x.key, label: q.name, sub: q.sub, badge: q.verb, tone: q.act, waited: w.text, stuck: w.stuck,
        lead: <CodeTile code={code} color={brand?.primary ?? NEUTRAL} />,
        go: () => (q.kind === "asset" ? openAsset(q.id) : router.push(href.offer(q.id))),
      };
    }
    // A note that @mentions you and that you have not read: opening it here counts as reading it.
    const c = x.c;
    return {
      key: x.key, label: noteWhere(ws, c), sub: c.text, badge: "Mention", tone: "mention", waited: `${ws.first(c.userId)}, ${ws.ago(c.createdAt)}`, stuck: false,
      lead: <span aria-hidden className="flex-none"><Avatar initials={ws.user(c.userId).initials} size={28} /></span>,
      go: () => { void markMentionsRead([c.id]); if (c.kind === "asset") openAsset(c.itemId, "discussion"); else router.push(href.offer(c.itemId) + "#discussion"); },
    };
  });

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

  const activity = ws.d.activity.slice(0, 4);
  const openActivity = (a: (typeof activity)[number]) => {
    if (a.type === "asset") return () => openAsset(a.itemId);
    if (a.type === "offer") return () => router.push(href.offer(a.itemId));
    if (a.type === "brand") return () => router.push(href.brand(a.itemId));
    if (a.type === "service") return () => router.push(href.service(a.itemId));
    if (a.type === "client") return () => router.push(href.client(a.itemId));
    return undefined;
  };

  return (
    <Page>
      <div className="head-band -mt-8 mb-6 pb-5 pt-8 sm:-mt-10 sm:pt-10">
        <Eyebrow className="mb-2">Dashboard</Eyebrow>
        <h1 className="display m-0 text-display">{greeting}</h1>
      </div>

      {/* Phones and laptops: one column, in reading order. From 1280px: the lists on the left, where you were on the right. */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6">
        <Panel title="Waiting on you" className="xl:col-start-1 xl:row-start-1">
          {rows.slice(0, LIMIT).map((r) => (
            <RowButton key={r.key} onClick={r.go}>
              {r.lead}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-medium text-ink">{r.label}</span>
                <span className="block truncate text-small text-mute-2">
                  {/* How long it has been stuck, instead of a deadline. */}
                  <span className={cx(r.stuck && "font-semibold text-warn-text")}>{r.waited}</span> · {r.sub}
                </span>
              </span>
              <span className={cx("flex-none rounded-sm px-2 py-0.5 text-small font-semibold", TONE[r.tone])}>{r.badge}</span>
            </RowButton>
          ))}
          {!rows.length && (
            <div className="px-4 py-6 text-center">
              <div className="text-body font-medium text-ink">You are all caught up</div>
              <div className="mx-auto mt-0.5 max-w-[46ch] text-meta text-mute-2 text-pretty">Work sent to you for review or changes, and notes that @mention you, show up here.</div>
            </div>
          )}
          {(rows.length > LIMIT || others > 0) && (
            <button type="button" onClick={() => setInbox(true)} aria-haspopup="dialog"
              className="flex h-10 w-full items-center gap-1.5 border-t border-divider px-4 text-left text-meta transition-colors duration-150 hover:bg-wash">
              <span className="min-w-0 flex-1 truncate text-mute-2">{others > 0 && `${others} with other people`}</span>
              <span className="flex flex-none items-center gap-1 font-medium text-accent">{rows.length > LIMIT ? `See all ${rows.length}` : "Open your queue"}<ArrowRight aria-hidden className="size-4" /></span>
            </button>
          )}
        </Panel>

        <Panel title="Continue where you left off" className="xl:col-start-2 xl:row-start-1">
          {continueItems.map((r) => (
            <RowButton key={r.key} onClick={r.go}>
              <CodeTile code={r.code} color={r.color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-medium text-ink">{r.title}</span>
                <span className="block truncate text-small text-mute-2">{r.sub}</span>
              </span>
            </RowButton>
          ))}
          {!continueItems.length && <div className="px-4 py-5 text-meta text-mute-2">Open a brand, an offer or an asset and it shows up here.</div>}
        </Panel>

        <div className="flex min-w-0 flex-col gap-5 xl:col-start-1 xl:row-start-2 xl:gap-6">
          {/*
            What is stuck, beside what is waiting: links that stopped opening. In the wide column each
            row has room for its brand and address. Nothing at all while every link opens.
          */}
          <BrokenLinksCard />

          <Panel title="Clients" action={ws.can("structure") && <Btn size="sm" variant="ghost" className="-mr-2" onClick={() => open({ kind: "client" })}><Plus aria-hidden className="size-4" />Add client</Btn>}>
            {clients.map((c) => {
              const bs = brands.filter((b) => b.clientId === c.id);
              const ids = new Set(bs.map((b) => b.id));
              const os = live(ws.d.offers).filter((o) => ids.has(o.brandId)).length;
              const as = live(ws.d.assets).filter((a) => a.brandId && ids.has(a.brandId)).length;
              const counts = `${plural(bs.length, "brand")} · ${plural(os, "offer")} · ${plural(as, "asset")}`;
              return (
                <Link key={c.id} href={href.client(c.id)} className="group flex min-h-14 items-center gap-3 border-t border-divider px-4 py-2 transition-colors duration-150 first:border-t-0 hover:bg-wash">
                  <span className="flex w-[52px] flex-none gap-1">
                    {bs.slice(0, 2).map((b) => <span key={b.id} aria-hidden className="flex size-6 items-center justify-center rounded-md text-micro font-bold" style={{ background: b.primary, color: onColor(b.primary) }}>{b.mark}</span>)}
                    {!bs.length && <span aria-hidden className="flex size-6 items-center justify-center rounded-md bg-chip text-micro text-mute-3">0</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-ink">{c.name}</span>
                    <span className="block truncate text-small text-mute-2">{c.kind}</span>
                  </span>
                  <span className="hidden flex-none text-small tabular-nums text-mute-2 sm:block">{counts}</span>
                  <ChevronRight aria-hidden className="size-4 flex-none text-mute-3" />
                </Link>
              );
            })}
            {!clients.length && (
              <div className="px-4 py-5">
                <p className="m-0 text-meta text-mute-2">{ws.can("structure") ? "No clients yet. Add the first one, or start from what you already have." : "You have not been given any clients yet. Ask an admin."}</p>
                {/* An empty workspace: start a brand from its website (or import, once a brand exists). Nothing for people who can do neither. */}
                <div className="mt-3 empty:hidden"><StartFromExisting /></div>
              </div>
            )}
          </Panel>

          {showSetup && (
            <Panel title="Get set up" action={<span className="flex items-center gap-2"><span className="text-small text-mute-2">{doneSteps} of {steps.length} done</span><IconBtn label="Hide the setup guide" size="sm" className="-mr-1.5" onClick={() => setHideSetup("1")}><X aria-hidden /></IconBtn></span>}>
              {steps.map((s) => (
                <RowButton key={s.label} onClick={s.go} disabled={s.done}>
                  {s.done ? <CheckCircle2 aria-hidden className="size-4 flex-none text-ok" /> : <Circle aria-hidden className="size-4 flex-none text-mute-3" />}
                  <span className="min-w-0 flex-1">
                    <span className={cx("block text-body font-medium", s.done ? "text-mute-2 line-through" : "text-ink")}>{s.label}</span>
                    <span className="block text-small text-mute-2">{s.hint}</span>
                  </span>
                </RowButton>
              ))}
            </Panel>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5 xl:col-start-2 xl:row-start-2 xl:gap-6">
          {/*
            From 1024px the sidebar lists the first ten stars, so the card shows there only when it adds
            something: nothing starred yet (it says what stars are for), or more than the sidebar holds.
          */}
          <StarredCard className={cx(starred > 0 && starred <= NAV_STARS && "lg:hidden")} />

          {/* From 1024px the sidebar carries the Global Library, so it is not offered twice. */}
          <Link href="/library" className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-card transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-raise lg:hidden">
            <span aria-hidden className="flex size-8 flex-none items-center justify-center rounded-lg bg-soft text-accent theme-fade"><BookOpen className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold text-ink">Global Library</span>
              <span className="block text-small text-mute-2 text-pretty">Checklists, prompts, templates, SOPs and ad creatives, shared across every client.</span>
            </span>
            <ChevronRight aria-hidden className="size-4 flex-none text-mute-3" />
          </Link>

          <Panel title="Recent activity">
            <div className="px-4 py-1">
              {activity.map((a) => <ActivityRow key={a.id} a={a} onOpen={openActivity(a)} />)}
              {!activity.length && <div className="py-5 text-meta text-mute-2">Nothing has happened yet.</div>}
            </div>
          </Panel>
        </div>
      </div>
    </Page>
  );
}

/** A titled list in a card: the dashboard's one building block. */
function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cx("min-w-0 overflow-hidden", className)}>
      <div className="flex h-11 items-center gap-3 border-b border-divider px-4">
        <h2 className="m-0 min-w-0 flex-1 truncate text-body font-semibold text-ink">{title}</h2>
        {action}
      </div>
      <div>{children}</div>
    </Card>
  );
}

/** One row of a panel: at most 56px, the whole row is the target. */
function RowButton({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="flex min-h-14 w-full items-center gap-3 border-t border-divider px-4 py-2 text-left transition-colors duration-150 first:border-t-0 hover:bg-wash disabled:cursor-default disabled:hover:bg-transparent">
      {children}
    </button>
  );
}

/** The 28px code square in a brand's colour ("OF", "LP", a brand's mark). */
function CodeTile({ code, color }: { code: string; color: string }) {
  return (
    <span aria-hidden className="flex h-7 min-w-8 flex-none items-center justify-center rounded-md px-1 font-mono text-micro font-bold tracking-[0.02em]" style={{ background: hexA(color, 0.12), color: readable(color) }}>
      {code}
    </span>
  );
}
