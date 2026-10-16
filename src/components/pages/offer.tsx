"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, ChevronDown, Clock, Copy, Download, ExternalLink, Layers, Megaphone, Pencil, Split, Undo2 } from "lucide-react";
import type { Asset, Cta, Offer } from "@/db/schema";
import { OFFER_STATUS } from "@/lib/constants";
import { href } from "@/lib/routes";
import { plural } from "@/lib/ws";
import { setArchived, setDue, setStatus } from "@/app/actions";
import { toDateInput } from "@/lib/time";
import { fmtDate } from "@/lib/format";
import { isGoogleDrive } from "@/lib/link-health";
import { parseWebUrl } from "@/lib/utm";
import { useAction, useApp } from "@/components/app/provider";
import { assetDownload, assetLink } from "@/components/cards";
import { OfferAssets } from "@/components/folders/offer-assets";
import { CommentText, Thread } from "@/components/discussion";
import { ArchivedNote, Avatar, Btn, ChangeNote, Page, cx } from "@/components/ui";
import { EntityHeader, FOCUS, IconTile, PanelTabs, tabPanel } from "@/components/polish";
import { CardMenu, type CardMenuItem } from "@/components/card-menu";
import { FunnelBoard } from "@/components/funnel/funnel-board";
import { CodeBadge } from "@/components/funnel/linked";
import { CtaTag } from "@/components/cta-tag";
import { ReviewLine, StatusSelect } from "@/components/workflow";
import { displayUrl, linkBtn, useCopyLink } from "@/components/link-button";
import { StarButton } from "@/components/features/stars/star-button";
import { OfferResults } from "@/components/features/results/offer-results";
import { LinkStatus } from "@/components/features/links/link-status";
import { TrackedLinksButton } from "@/components/features/links/utm-builder";
import { NotHere, useVisit } from "./common";

/*
 * An offer: what it is in the header, its assets, funnel, discussion and
 * results in tabs, and on wide screens a summary column with the links people
 * ask for on calls (Key links), the positioning and where it stands.
 */

type OfferTab = "assets" | "funnel" | "discussion" | "results";
const TABS: OfferTab[] = ["assets", "funnel", "discussion", "results"];
const isTab = (v: string | null): v is OfferTab => !!v && (TABS as string[]).includes(v);

/** Small section labels in the summary column. */
const HEAD = "m-0 text-small font-medium text-mute-2";

export function OfferPage({ id }: { id: string }) {
  const { ws } = useApp();
  const o = ws.offer(id);
  useVisit("offer", id, !!o);
  if (!o) return <NotHere what="offer" />;
  return <OfferView key={o.id} o={o} />;
}

/**
 * The open tab, kept in the URL (`?tab=funnel`) so links and reloads keep it.
 * An open asset keeps its own section in `?assetTab=`, so opening and closing
 * one never changes this.
 */
function useOfferTab(): [OfferTab, (t: OfferTab) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const asked = params.get("tab");
  const fromUrl: OfferTab = isTab(asked) ? asked : "assets";
  // Shown at once on a click; the address follows a moment later, and back/forward or a link moves it again.
  const [tab, setTabState] = useState<OfferTab>(fromUrl);
  const [seen, setSeen] = useState(asked);
  if (seen !== asked) {
    setSeen(asked);
    setTabState(fromUrl);
  }
  const urlFor = useCallback((t: OfferTab) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", t);
    return `${pathname}?${next}`;
  }, [params, pathname]);
  // Search, the inbox and mentions link to "#discussion": open that tab.
  useEffect(() => {
    const check = () => { if (window.location.hash === "#discussion") router.replace(urlFor("discussion"), { scroll: false }); };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [router, urlFor]);
  const setTab = (t: OfferTab) => {
    setTabState(t);
    router.replace(urlFor(t), { scroll: false });
  };
  return [tab, setTab];
}

function OfferView({ o }: { o: Offer }) {
  const { ws, open, nudge, setNudge, toast } = useApp();
  const [run] = useAction();
  const [tab, setTab] = useOfferTab();
  useEffect(() => () => setNudge(null), [setNudge]);

  const b = ws.brand(o.brandId);
  const sv = ws.service(o.serviceId);
  const canEdit = ws.canChange(o);
  const assets = ws.linkedAssets(o.id);
  const periods = ws.d.offerResults.filter((r) => r.offerId === o.id).length;
  const wide = tab === "funnel" || tab === "results";
  const nudgeAsset = nudge?.offerId === o.id ? ws.asset(nudge.assetId) : null;

  const adapt = () => {
    const taken = new Set(ws.offersOf(o.brandId).filter((x) => x.serviceId === o.serviceId && !x.archived).map((x) => x.segment));
    const next = b?.segments.find((sg) => sg.name !== "All segments" && !taken.has(sg.name))?.name ?? o.segment;
    open({ kind: "offer", draft: { ...o, id: undefined, name: `${o.name} (${next})`, segment: next, status: "Ideation", review: "None" } });
  };
  // Offers are never deleted. One that was cancelled, or added by mistake, goes back to draft.
  const more: CardMenuItem[] = [
    ...(canEdit ? [{ kind: "item" as const, label: "Adapt for another segment", icon: <Split aria-hidden size={16} className="text-mute-2" />, onSelect: adapt }] : []),
    ...(canEdit && o.status !== "Ideation" ? [{
      kind: "item" as const, label: "Move back to draft", icon: <Undo2 aria-hidden size={16} className="text-mute-2" />,
      onSelect: async () => { if ((await run(setStatus, "offer", o.id, "Ideation")).ok) toast("Moved back to draft"); },
    }] : []),
    ...(ws.can("archive") ? [{
      kind: "item" as const, label: o.archived ? "Restore" : "Archive",
      icon: o.archived ? <ArchiveRestore aria-hidden size={16} className="text-mute-2" /> : <Archive aria-hidden size={16} className="text-mute-2" />,
      onSelect: () => void run(setArchived, "offer", o.id, !o.archived),
    }] : []),
  ];

  const quiet = "mr-2 inline-flex items-center gap-1.5 text-meta text-mute-2";
  const dot = (c: string) => <span aria-hidden className="size-2 flex-none rounded-full" style={{ background: c }} />;

  return (
    <Page>
      <EntityHeader
        eyebrow={<>Offer{b ? <> · <Link href={href.brand(b.id, "offers")} className="hover:text-ink hover:underline">{b.name}</Link></> : null}</>}
        lead={<IconTile icon={Megaphone} color={b?.primary} size={48} className="rounded-xl" />}
        title={o.name}
        sub={o.short}
        meta={
          <>
            <span className={quiet}>{dot(OFFER_STATUS[o.status])}{o.status}</span>
            <span className={quiet}>{dot(ws.segColor(o.segment, o.brandId))}{o.segment}</span>
            {sv ? (
              <Link href={href.service(sv.id)} className={cx(quiet, "rounded-sm hover:text-ink hover:underline")}><Layers aria-hidden size={14} />{sv.name}</Link>
            ) : (
              <span className={quiet}><Layers aria-hidden size={14} />Standalone</span>
            )}
            <span className={quiet}><Clock aria-hidden size={14} />Updated {ws.ago(o.updatedAt)}</span>
          </>
        }
        actions={
          <>
            {/* Anyone who can see the offer can star it, Viewers too. */}
            <StarButton kind="offer" id={o.id} name={o.name} />
            {canEdit && <Btn variant="primary" onClick={() => open({ kind: "offer", draft: o })}><Pencil aria-hidden size={16} />Edit</Btn>}
            {more.length > 0 && <CardMenu label="More offer actions" items={more} triggerClassName={MORE_BTN} />}
          </>
        }
      />

      {o.archived && <ArchivedNote className="-mt-2 mb-6">Archived. Its assets are still in the library; only this offer is closed.</ArchivedNote>}

      <div className={cx("grid gap-6 xl:gap-8", !wide && "xl:grid-cols-[minmax(0,1fr)_360px]")}>
        {/* First in the reading order, so on narrower screens the links sit above the tabs. The funnel board and the results table take the whole width. */}
        <Summary o={o} assets={assets} className={cx("xl:col-start-2 xl:row-start-1", wide && "xl:hidden")} />

        <div className="min-w-0 xl:col-start-1 xl:row-start-1">
          <div className="mb-5 border-b border-line">
            <PanelTabs
              id="offer"
              label="Offer sections"
              value={tab}
              onChange={setTab}
              items={[
                { key: "assets", label: "Assets", count: assets.length },
                { key: "funnel", label: "Funnel" },
                { key: "discussion", label: "Discussion", count: ws.openCount("offer", o.id) || undefined },
                { key: "results", label: "Results", count: periods || undefined },
              ]}
            />
          </div>

          <div {...tabPanel("offer", tab)}>
            {tab === "assets" && (
              <>
                {nudgeAsset && (
                  <div role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-soft px-4 py-3">
                    <span className="min-w-[240px] flex-1 text-body text-ink-2">
                      {nudgeAsset.name} is now linked to this offer. The same asset, not a copy. <span className="text-mute-2">Need a version written for this offer?</span>
                    </span>
                    <Btn size="sm" onClick={() => open({ kind: "clone", srcId: nudgeAsset.id, brandId: nudgeAsset.brandId ?? o.brandId, name: `${nudgeAsset.name} (${o.name})`, offerIds: [o.id] })}>Clone and adapt</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setNudge(null)}>No thanks</Btn>
                  </div>
                )}
                <OfferAssets o={o} />
              </>
            )}
            {tab === "funnel" && <FunnelBoard offer={o} />}
            {tab === "discussion" && <OfferDiscussion o={o} />}
            {tab === "results" && <OfferResults offer={o} />}
          </div>
        </div>
      </div>
    </Page>
  );
}

const MORE_BTN = cx("flex size-9 flex-none items-center justify-center rounded-lg border border-line bg-surface text-mute-2 transition-[background-color,border-color,color,transform] duration-150 ease-snap hover:border-line-strong hover:text-ink active:scale-[0.97]", FOCUS);

/* ---------------------------------------------------------------- summary column */

/** Pages people open from an offer, in the order they ask for them. */
const KEY_TYPES = ["Landing page", "Lead magnet", "Thank you page", "Drive link"];

/** The linked assets that are links: anything with a URL, and the page types even before they have one. */
function keyLinksOf(assets: Asset[]) {
  const rank = (a: Asset) => {
    const i = KEY_TYPES.indexOf(a.type);
    return i < 0 ? KEY_TYPES.length : i;
  };
  return assets.filter((a) => !a.archived && (!!assetLink(a) || KEY_TYPES.includes(a.type))).sort((x, y) => rank(x) - rank(y));
}

/** Waiting on someone: the review line then stays in view even when the details are folded away. */
const waiting = (o: Offer) => o.review === "In review" || o.review === "Changes requested";

function Summary({ o, assets, className }: { o: Offer; assets: Asset[]; className?: string }) {
  const [more, setMore] = useState(false);
  return (
    <aside
      aria-label="Offer summary"
      data-scroll
      className={cx(
        "min-w-0 self-start rounded-xl border border-line bg-surface shadow-card",
        "xl:sticky xl:top-19 xl:max-h-[calc(100dvh-92px)] xl:overflow-y-auto",
        className,
      )}
    >
      <KeyLinks o={o} assets={assets} />
      {waiting(o) && (
        <section aria-labelledby="review-h" className="border-t border-divider px-4 py-3">
          <h2 id="review-h" className={HEAD}>Review</h2>
          <ReviewLine kind="offer" item={o} className="mt-1.5" />
          {o.changeNote && o.review === "Changes requested" && <ChangeNote className="mt-3">{o.changeNote}</ChangeNote>}
        </section>
      )}
      {/* Below 1280px only the links (and a review waiting on someone) show until someone asks for the rest. */}
      <div id="offer-details" className={cx(more ? "md:grid md:grid-cols-2" : "hidden", "xl:block")}>
        <Workflow o={o} />
        <Positioning o={o} />
      </div>
      <button
        type="button"
        aria-expanded={more}
        aria-controls="offer-details"
        onClick={() => setMore((v) => !v)}
        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-b-xl border-t border-divider text-meta font-medium text-mute-2 transition-colors hover:bg-wash hover:text-ink xl:hidden"
      >
        {more ? "Hide details" : "Show details"}
        <ChevronDown aria-hidden size={15} className={cx("transition-transform duration-200 ease-snap", more && "rotate-180")} />
      </button>
    </aside>
  );
}

function KeyLinks({ o, assets }: { o: Offer; assets: Asset[] }) {
  const list = keyLinksOf(assets);
  return (
    <section aria-labelledby="key-links-h" className="px-4 pb-1.5 pt-3">
      <h2 id="key-links-h" className={HEAD}>Key links</h2>
      {list.length ? (
        <ul className="m-0 mt-1 grid list-none gap-x-6 p-0 sm:grid-cols-2 xl:grid-cols-1">
          {list.map((a) => <KeyLink key={a.id} o={o} a={a} />)}
        </ul>
      ) : (
        <p className="m-0 mb-1.5 mt-1.5 text-meta text-mute-2">No landing page or link yet. Linked pages and links show here.</p>
      )}
    </section>
  );
}

/** Whether a link is worth tagging for analytics: a web page, not a Drive or Docs file. */
const trackable = (href: string) => {
  const u = parseWebUrl(href);
  return !!u && !isGoogleDrive(u.hostname);
};

/**
 * One key link in two lines: the asset (opens it here) with where it points
 * beside it, then Open, Copy link and Tracked links, or Download, and a
 * warning when the link stopped opening.
 */
function KeyLink({ o, a }: { o: Offer; a: Asset }) {
  const { ws, openAsset } = useApp();
  const copy = useCopyLink();
  const link = assetLink(a);
  const file = link ? null : assetDownload(a);
  const stored = (a.files ?? []).filter((f) => f.key).length;
  const where = link ? displayUrl(link.href) : file ? plural(stored, "file") : a.type === "Drive link" ? "No Drive link added yet" : "No link added yet";
  return (
    <li className="flex min-w-0 items-center gap-3 border-t border-divider py-1.5 first:border-t-0 sm:[&:nth-child(2)]:border-t-0 xl:[&:nth-child(2)]:border-t">
      <CodeBadge code={ws.codeOf(a)} color={ws.colorOf(a)} size={32} />
      <div className="min-w-0 flex-1">
        {/* The name keeps its room; the address takes what is left (all of it is in the tooltip and behind Open). */}
        <div className="flex min-w-0 items-baseline gap-2">
          <button type="button" onClick={() => openAsset(a.id)} title={a.name} className="min-w-0 truncate rounded-sm py-0.5 text-left text-meta font-semibold text-ink hover:underline">{a.name}</button>
          <span title={link?.href} className="min-w-0 flex-1 truncate text-small text-mute-2">{where}</span>
        </div>
        {(link || file) && (
          <div className="-ml-1.5 flex flex-wrap items-center gap-0.5">
            {link && (
              <>
                <a href={link.href} target="_blank" rel="noreferrer" aria-label={`Open ${a.name}`} title={link.href} className={linkBtn("quiet")}><ExternalLink aria-hidden size={13} />Open</a>
                <button type="button" onClick={() => void copy(link.href)} aria-label={`Copy link to ${a.name}`} className={linkBtn("quiet")}><Copy aria-hidden size={13} />Copy link</button>
                {a.type !== "Drive link" && trackable(link.href) && <TrackedLinksButton look="quiet" url={link.href} offer={o} asset={a} />}
              </>
            )}
            {file && <a href={file.href} download aria-label={`Download ${a.name}`} title={file.title} className={linkBtn("quiet")}><Download aria-hidden size={13} />Download</a>}
            <LinkStatus asset={a} variant="badge" className="ml-1.5" />
          </div>
        )}
      </div>
    </li>
  );
}

function Positioning({ o }: { o: Offer }) {
  const { ws } = useApp();
  const ctas = [o.primaryCtaId, o.secondaryCtaId].map((id) => (id ? ws.cta(id) : null)).filter((c): c is Cta => !!c);
  const missing = (s: string) => <span className="text-warn-text">{s}</span>;
  const row = (label: string, value: ReactNode) => (
    <>
      <dt className="text-mute-2">{label}</dt>
      <dd className="m-0 min-w-0 text-ink-3 text-pretty">{value}</dd>
    </>
  );
  return (
    <section aria-labelledby="positioning-h" className="border-t border-divider px-4 py-3.5 md:border-l xl:border-l-0">
      <h2 id="positioning-h" className={HEAD}>Positioning</h2>
      <p className="m-0 mt-1.5 text-body font-medium text-ink text-pretty">
        {o.positioning || <span className="font-normal text-warn-text">No positioning written yet.</span>}
      </p>
      <dl className="m-0 mt-3 grid grid-cols-[80px_minmax(0,1fr)] gap-x-3 gap-y-2 text-meta">
        {row("Goals", o.goals.length ? o.goals.join(", ") : missing("No goal set"))}
        {row("Promise", o.promise || missing("Not written yet"))}
        {row("Proof", o.proof || missing("Not written yet"))}
        {row("Offer type", o.offerType || <span className="text-mute-2">Not set</span>)}
        {row("CTAs", ctas.length ? (
          <span className="flex flex-col items-start gap-1.5">
            {ctas.map((c) => (
              <span key={c.id} className="flex max-w-full items-center gap-1">
                <CtaTag c={c} className="min-w-0" />
                {trackable(c.url) && <TrackedLinksButton look="icon" url={c.url} offer={o} cta={c} />}
              </span>
            ))}
          </span>
        ) : missing("None set"))}
      </dl>
    </section>
  );
}

function Workflow({ o }: { o: Offer }) {
  const { ws } = useApp();
  const [run] = useAction();
  const canEdit = ws.canChange(o);
  const owner = ws.user(o.ownerId);
  return (
    <section aria-labelledby="workflow-h" className="border-t border-divider px-4 py-3.5">
      <h2 id="workflow-h" className={HEAD}>Workflow</h2>
      <dl className="m-0 mt-2 grid grid-cols-[80px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 text-meta">
        <dt className="text-mute-2">Status</dt>
        <dd className="m-0 min-w-0">
          <StatusSelect value={o.status} colors={OFFER_STATUS} readOnly={!canEdit} onChange={(s) => void run(setStatus, "offer", o.id, s)} />
        </dd>
        <dt className="text-mute-2">Launch</dt>
        <dd className="m-0 min-w-0 text-ink-3">
          {canEdit ? (
            <input type="date" aria-label="Launch date" defaultValue={toDateInput(o.dueAt)} key={String(o.dueAt)}
              onChange={(e) => void run(setDue, "offer", o.id, e.target.value || null)} className="field h-8 w-auto max-w-full px-2.5 py-0 text-meta" />
          ) : o.dueAt ? fmtDate(o.dueAt) : <span className="text-mute-2">Not scheduled</span>}
        </dd>
        {!waiting(o) && (
          <>
            <dt className="text-mute-2">Review</dt>
            <dd className="m-0 min-w-0"><ReviewLine kind="offer" item={o} /></dd>
          </>
        )}
        <dt className="text-mute-2">Owner</dt>
        <dd className="m-0 flex min-w-0 items-center gap-1.5 text-ink-3">
          <Avatar initials={owner.initials} size={20} />
          <span className="min-w-0 truncate">{owner.name}</span>
        </dd>
      </dl>
    </section>
  );
}

/* ---------------------------------------------------------------- discussion */

function OfferDiscussion({ o }: { o: Offer }) {
  const { ws, openAsset } = useApp();
  const mentions = ws.mentionsOf("offer", o.id);
  return (
    <div className="max-w-[720px]">
      {mentions.length > 0 && (
        <section aria-labelledby="mentions-h" className="mb-4 rounded-xl border border-line bg-surface px-4 py-3">
          <h2 id="mentions-h" className={cx(HEAD, "mb-1.5")}>{plural(mentions.length, "mention")} elsewhere</h2>
          <div className="flex flex-col gap-1">
            {mentions.map((m) => {
              const where = m.kind === "asset" ? ws.asset(m.itemId)?.name : ws.offer(m.itemId)?.name;
              const body = (
                <>
                  <Avatar initials={ws.user(m.userId).initials} size={22} mono className="mt-px" />
                  <span className="min-w-0 flex-1">
                    <CommentText c={m} />
                    <span className="mt-0.5 block text-small text-mute-2">{ws.first(m.userId)} · on {where ?? "somewhere else"} · {ws.ago(m.createdAt)}</span>
                  </span>
                </>
              );
              const cls = "-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-hover";
              return m.kind === "asset" ? (
                <button key={m.id} type="button" onClick={() => openAsset(m.itemId, "discussion")} className={cls}>{body}</button>
              ) : (
                <Link key={m.id} href={href.offer(m.itemId) + "?tab=discussion"} className={cls}>{body}</Link>
              );
            })}
          </div>
        </section>
      )}
      <Thread kind="offer" id={o.id} />
    </div>
  );
}
