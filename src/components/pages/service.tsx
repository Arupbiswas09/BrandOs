"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Asset, Offer, Service } from "@/db/schema";
import { Archive, ArchiveRestore, ChevronDown, Ellipsis, Plus } from "lucide-react";
import { assetStand, offerStand, roleOf, type Stand } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";
import { href } from "@/lib/routes";
import { plural, type FunnelGroup, type ServiceStats, type WS } from "@/lib/ws";
import { setArchived } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { AssetRow, AssetRows, Dot, GroupedRows, ListGroup, OfferRow, SegmentTag, StateWord } from "@/components/cards";
import { CardMenu } from "@/components/card-menu";
import { ArchivedNote, Btn, CodeTile, Empty, Page, cx } from "@/components/ui";
import { EntityHeader, FOCUS } from "@/components/polish";
import { NotHere, useVisit } from "./common";

/* ---------------------------------------------------------------- the five counts, as tabs */

/**
 * The client asked for the five things a service holds to be counted and
 * clickable. Each count is a tab that shows its list below; "All assets" is
 * a quieter sixth so nothing linked is out of reach. The choice stays in the
 * address as `?tab=`.
 */
type TabKey = "offers" | "lead-magnets" | "landing-pages" | "funnels" | "automations" | "assets";

const TABS: { key: TabKey; label: string; word: [string, string]; n: (s: ServiceStats) => number }[] = [
  { key: "offers", label: "Offers", word: ["offer", "offers"], n: (s) => s.offers },
  { key: "lead-magnets", label: "Lead magnets", word: ["lead magnet", "lead magnets"], n: (s) => s.leadMagnets },
  { key: "landing-pages", label: "Landing pages", word: ["landing page", "landing pages"], n: (s) => s.landingPages },
  { key: "funnels", label: "Funnels", word: ["funnel mapped", "funnels mapped"], n: (s) => s.funnels },
  { key: "automations", label: "Automations", word: ["automation", "automations"], n: (s) => s.automations },
  { key: "assets", label: "All assets", word: ["asset in all", "assets in all"], n: (s) => s.assets },
];
const isTab = (x: string | null): x is TabKey => TABS.some((t) => t.key === x);

/** Which assets each asset tab lists: the same rules the counts use. */
const ASSET_TAB: Partial<Record<TabKey, { pick: (a: Asset) => boolean; none: string }>> = {
  "lead-magnets": { pick: (a) => a.type === "Lead magnet", none: "No lead magnets" },
  "landing-pages": { pick: (a) => a.type === "Landing page", none: "No landing pages" },
  automations: { pick: (a) => roleOf(a.type) === "automation", none: "No automations" },
  assets: { pick: () => true, none: "No assets" },
};

/* ---------------------------------------------------------------- page */

export function ServicePage({ id }: { id: string }) {
  const { ws, open } = useApp();
  const [run] = useAction();
  const params = useSearchParams();
  const [tab, setTabState] = useState<TabKey>(() => {
    const asked = params.get("tab");
    return isTab(asked) ? asked : "offers";
  });
  const [details, setDetails] = useState(false);
  const v = ws.service(id);
  useVisit("service", id, !!v);

  // The tab lives in the address. Opening an asset borrows `tab` for the drawer's own tabs
  // and drops it, so once the drawer closes the page puts its own choice back.
  useEffect(() => {
    if (params.get("asset")) return;
    const want = tab === "offers" ? null : tab;
    if (params.get("tab") === want) return;
    const next = new URLSearchParams(params.toString());
    if (want) next.set("tab", want); else next.delete("tab");
    const q = next.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  }, [params, tab]);

  if (!v) return <NotHere what="service" />;
  const b = ws.brand(v.brandId);
  const offers = ws.serviceOffers(v.brandId, v.id);
  const archivedOffers = ws.offersOfService(v.id).filter((o) => o.archived);
  const assets = ws.assetsOfOffers(offers);
  const stats = ws.serviceStats(v.brandId, v.id);
  const canEdit = ws.canChange(v);
  const newOffer = (segment = "All segments") => open({ kind: "offer", draft: { brandId: v.brandId, serviceId: v.id, segment, status: "Ideation" } });
  const needs = needsOf(ws, offers, assets);
  const archive = () => void run(setArchived, "service", v.id, !v.archived);

  return (
    <Page>
      <EntityHeader
        eyebrow={<>Service{b ? <> · <Link href={href.brand(b.id, "services")} className="hover:text-ink hover:underline">{b.name}</Link></> : null}</>}
        title={v.name}
        sub={v.short}
        meta={stats.updatedAt && (
          <span className="text-meta text-mute-2">
            Updated <time dateTime={stats.updatedAt.toISOString()} title={fmtDateTime(stats.updatedAt)} suppressHydrationWarning>{ws.ago(stats.updatedAt)}</time>
            {stats.updatedBy && <> by {ws.first(stats.updatedBy)}</>}
          </span>
        )}
        actions={(canEdit || ws.can("archive")) && (
          <>
            {canEdit && <Btn onClick={() => open({ kind: "service", draft: v })}>Edit</Btn>}
            {canEdit && <Btn variant="primary" onClick={() => newOffer()}><Plus aria-hidden size={16} />New offer</Btn>}
            {/* Services are never deleted; archiving puts one out of sight and keeps its offers. */}
            {ws.can("archive") && (
              <CardMenu
                label="More service actions"
                icon={<Ellipsis aria-hidden size={18} />}
                triggerClassName={cx("inline-flex size-9 flex-none items-center justify-center rounded-lg border border-line bg-surface text-mute-2 transition-colors hover:border-line-strong hover:bg-wash hover:text-ink", FOCUS)}
                items={[{ kind: "item", label: v.archived ? "Restore service" : "Archive service", icon: v.archived ? <ArchiveRestore aria-hidden size={16} className="text-mute-4" /> : <Archive aria-hidden size={16} className="text-mute-4" />, onSelect: archive }]}
              />
            )}
          </>
        )}
      />
      {v.archived && <ArchivedNote className="mb-6">Archived. Its offers still exist and are reachable from the brand&apos;s Offers.</ArchivedNote>}

      {offers.length === 0 ? (
        <>
          {v.description && <p className="m-0 mb-6 max-w-[64ch] text-body leading-[1.6] text-ink-3 text-pretty">{v.description}</p>}
          <Empty title="No offers for this service yet" body="An offer is this service argued at one segment.">
            {canEdit && <Btn variant="primary" size="lg" onClick={() => newOffer()}>Write the first offer</Btn>}
          </Empty>
          {archivedOffers.length > 0 && <ArchivedOffersNote n={archivedOffers.length} brandId={v.brandId} />}
        </>
      ) : (
        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start xl:gap-8">
          <Aside v={v} offers={offers} needs={needs} open={details} onOpen={setDetails} />
          <div className="min-w-0 xl:col-start-1 xl:row-start-1">
            <CountTabs stats={stats} value={tab} onChange={setTabState} />
            <div role="tabpanel" id="service-panel" aria-labelledby={`service-tab-${tab}`} className="mt-5">
              {tab === "offers" && (
                <>
                  <OffersBySegment offers={offers} brandId={v.brandId} canEdit={canEdit} newOffer={newOffer} />
                  {archivedOffers.length > 0 && <ArchivedOffersNote n={archivedOffers.length} brandId={v.brandId} />}
                </>
              )}
              {tab === "funnels" && <Funnels groups={ws.funnelGroups(offers)} mapped={stats.funnels} total={offers.length} />}
              {ASSET_TAB[tab] && <AssetPanel assets={assets.filter(ASSET_TAB[tab]!.pick)} offers={offers} none={ASSET_TAB[tab]!.none} label={TABS.find((t) => t.key === tab)!.label} />}
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

function ArchivedOffersNote({ n, brandId }: { n: number; brandId: string }) {
  return (
    <p className="mb-0 mt-4 text-meta text-mute-2">
      {plural(n, "archived offer")} hidden. Find {n === 1 ? "it" : "them"} under <Link className="underline hover:text-ink" href={href.brand(brandId, "offers")}>Offers</Link>.
    </p>
  );
}

/** Five counts and "All assets", as one segmented row of tabs. Arrow keys move between them. */
function CountTabs({ stats, value, onChange }: { stats: ServiceStats; value: TabKey; onChange: (t: TabKey) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const keys = (e: KeyboardEvent, i: number) => {
    const last = TABS.length - 1;
    const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(TABS[to].key);
    refs.current[to]?.focus();
  };
  return (
    <div role="tablist" aria-label="What this service holds" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1 sm:flex">
      {TABS.map((t, i) => {
        const n = t.n(stats);
        const on = t.key === value;
        const all = t.key === "assets";
        return (
          <Fragment key={t.key}>
            {all && <span aria-hidden className="my-2 hidden w-px flex-none bg-line sm:block" />}
            <button
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="tab"
              id={`service-tab-${t.key}`}
              aria-selected={on}
              aria-controls="service-panel"
              tabIndex={on ? 0 : -1}
              title={`${n} ${n === 1 ? t.word[0] : t.word[1]}`}
              onClick={() => onChange(t.key)}
              onKeyDown={(e) => keys(e, i)}
              className={cx(
                "focus-inset flex min-w-0 flex-col items-start rounded-lg px-3 py-1.5 text-left transition-colors duration-150 sm:min-w-fit sm:flex-1",
                on ? "bg-soft text-accent" : "text-mute-2 hover:bg-hover hover:text-ink",
              )}
            >
              <span className={cx("text-lead leading-6 tabular-nums", on ? "font-semibold text-accent" : n ? "font-semibold text-ink" : "font-normal text-mute-2")}>{n}</span>
              <span className={cx("max-w-full truncate text-small leading-5", on && "font-medium")}>{t.label}</span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- about and what needs someone */

type Need = { key: string; name: string; why: string; s?: Stand; to: { offer: string } | { asset: string } };

/** What someone has to act on, by the same rules as the brand home's count: sent back first, then waiting, then gaps. */
function needsOf(ws: WS, offers: Offer[], assets: Asset[]): Need[] {
  const pending = (r: string) => r === "In review" || r === "Changes requested";
  const reviews: Need[] = [
    ...offers.filter((o) => pending(o.review)).map((o) => ({ key: o.id, name: o.name, why: "Offer", s: offerStand(o), to: { offer: o.id } })),
    ...assets.filter((a) => pending(a.review)).map((a) => ({ key: a.id, name: a.name, why: a.type, s: assetStand(a), to: { asset: a.id } })),
  ].sort((x, y) => (x.s!.tone === y.s!.tone ? 0 : x.s!.tone === "change" ? -1 : 1));
  const gaps: Need[] = offers
    .filter((o) => !ws.linkedAssets(o.id).some((a) => !a.archived && roleOf(a.type) === "entry"))
    .map((o) => ({ key: `gap-${o.id}`, name: o.name, why: "No entry point", to: { offer: o.id } }));
  return [...reviews, ...gaps];
}

/**
 * About this service and what needs someone. A column on the right on wide
 * screens; a "Details" disclosure above the tabs on smaller ones.
 */
function Aside({ v, offers, needs, open, onOpen }: { v: Service; offers: Offer[]; needs: Need[]; open: boolean; onOpen: (v: boolean) => void }) {
  const { ws, openAsset } = useApp();
  const segs = [...new Set(offers.map((o) => o.segment))];
  return (
    <aside aria-label="About this service" className="mb-5 xl:sticky xl:top-20 xl:col-start-2 xl:row-start-1 xl:mb-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="service-details"
        onClick={() => onOpen(!open)}
        className={cx("flex h-11 w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 text-left xl:hidden", FOCUS)}
      >
        <span className="text-body font-semibold text-ink">Details</span>
        <span className="min-w-0 flex-1 truncate text-meta text-mute-2">{needs.length ? `About, and ${plural(needs.length, "thing")} needing attention` : "About this service"}</span>
        <ChevronDown aria-hidden size={18} className={cx("flex-none text-mute-2 transition-transform duration-200 ease-snap", open && "rotate-180")} />
      </button>
      <div id="service-details" className={cx("rounded-xl border border-line bg-surface", open ? "mt-2 block" : "hidden", "xl:mt-0 xl:block")}>
        <section aria-labelledby="service-about" className="px-4 py-4">
          <h2 id="service-about" className="m-0 text-body font-semibold text-ink">About</h2>
          {v.description
            ? <p className="m-0 mt-1.5 text-meta leading-[1.6] text-ink-3 text-pretty">{v.description}</p>
            : <p className="m-0 mt-1.5 text-meta text-mute-2">No description yet.</p>}
          {segs.length > 0 && (
            <div className="mt-3">
              <h3 className="m-0 text-small font-medium text-mute-2">Segments it is written for</h3>
              <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-1.5 p-0 text-small">
                {segs.map((s) => <li key={s} className="min-w-0"><SegmentTag name={s} color={ws.segColor(s, v.brandId)} /></li>)}
              </ul>
            </div>
          )}
        </section>
        <section aria-labelledby="service-needs" className="border-t border-divider px-4 py-4">
          <h2 id="service-needs" className="m-0 text-body font-semibold text-ink">
            Needs attention{needs.length > 0 && <span className="font-normal text-mute-2"> · {needs.length}</span>}
          </h2>
          {needs.length ? (
            <ul className="m-0 mt-2 flex list-none flex-col gap-2.5 p-0">
              {needs.map((n) => (
                <li key={n.key} className="min-w-0">
                  {"offer" in n.to
                    ? <Link href={href.offer(n.to.offer)} className="block truncate rounded-sm text-meta font-medium text-ink hover:underline" title={n.name}>{n.name}</Link>
                    : <button type="button" onClick={() => openAsset((n.to as { asset: string }).asset)} className="block max-w-full truncate rounded-sm text-left text-meta font-medium text-ink hover:underline" title={n.name}>{n.name}</button>}
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-small text-mute-2">
                    {n.s ? <StateWord s={n.s} className="flex-none" /> : <span className="font-medium text-warn-text">{n.why}</span>}
                    {n.s && <><span aria-hidden>·</span><span className="truncate">{n.why}</span></>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 mt-1.5 text-meta text-mute-2">Nothing waiting. Every offer has somewhere for people to arrive.</p>
          )}
        </section>
      </div>
    </aside>
  );
}

/* ---------------------------------------------------------------- assets */

function AssetPanel({ assets, offers, none, label }: { assets: Asset[]; offers: Offer[]; none: string; label: string }) {
  const { ws } = useApp();
  const mine = new Set(offers.map((o) => o.id));
  if (!assets.length) {
    return <p className="m-0 rounded-xl border border-dashed border-line-strong px-5 py-4 text-body text-mute-2">{none} linked to this service&apos;s offers yet. Link one from an offer and it shows up here.</p>;
  }
  return (
    <AssetRows label={label}>
      {assets.map((a) => <AssetRow key={a.id} a={a} serves={ws.linkedOffers(a.id).filter((o) => mine.has(o.id))} />)}
    </AssetRows>
  );
}

/* ---------------------------------------------------------------- funnels */

function Funnels({ groups, mapped, total }: { groups: FunnelGroup[]; mapped: number; total: number }) {
  return (
    <>
      <p className="m-0 mb-3 text-meta text-mute-2">
        Grouped by the landing page or lead magnet people arrive on. {mapped === 0 ? "No offer has its funnel mapped yet." : `${mapped} of ${plural(total, "offer")} ${mapped === 1 ? "has its" : "have their"} funnel mapped.`}
      </p>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {groups.map((g) => <FunnelRow key={g.entry?.id ?? "none"} g={g} />)}
      </ul>
    </>
  );
}

/** Words only for what is not fine: "Draft", "In review", "Changes requested". Live and approved things need no label. */
function Unless({ s }: { s: Stand }) {
  if (s.tone === "ok") return null;
  return <span className="inline-flex flex-none items-center gap-1.5 text-small text-mute-2"><Dot color={s.color} />{s.word}</span>;
}

function Col({ label, children, empty }: { label: string; children?: ReactNode; empty: boolean }) {
  return (
    <div className="min-w-0">
      <h4 className="m-0 mb-1.5 text-small font-medium text-mute-2">{label}</h4>
      {empty ? <span className="text-meta text-mute-2">None linked</span> : children}
    </div>
  );
}

function FunnelRow({ g }: { g: FunnelGroup }) {
  const { ws, openAsset } = useApp();
  const e = g.entry;
  const line = (a: Asset) => (
    <li key={a.id} className="flex min-w-0 items-center gap-2">
      <span aria-hidden className="w-10 flex-none font-mono text-micro font-semibold tracking-[0.05em] text-mute-2">{ws.codeOf(a)}</span>
      <button type="button" onClick={() => openAsset(a.id)} title={a.name} className="min-w-0 truncate rounded-sm text-left text-meta text-ink hover:underline">{a.name}</button>
      <Unless s={assetStand(a)} />
    </li>
  );
  return (
    <li className="@container rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-divider px-4 py-3">
        {e ? (
          <>
            <CodeTile code={ws.codeOf(e)} color={ws.colorOf(e)} size={28} />
            <h3 className="m-0 min-w-0 text-body font-semibold">
              <button type="button" onClick={() => openAsset(e.id)} className="max-w-full truncate rounded-sm text-left text-ink hover:underline">{e.name}</button>
            </h3>
            <span className="text-meta"><StateWord s={assetStand(e)} muted={assetStand(e).tone === "ok"} /></span>
          </>
        ) : (
          <>
            <h3 className="m-0 text-body font-semibold text-warn-text">No entry point</h3>
            <span className="text-meta text-mute-2">These offers have no landing page or lead magnet linked.</span>
          </>
        )}
      </div>
      <div className="grid gap-x-6 gap-y-4 px-4 py-3 @2xl:grid-cols-3">
        <Col label="Offers" empty={!g.offers.length}>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {g.offers.map((o) => {
              const mapped = (o.funnel?.boxes?.length ?? 0) > 0;
              return (
                <li key={o.id} className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <Link href={href.offer(o.id)} title={o.name} className="min-w-0 truncate rounded-sm text-meta font-medium text-ink hover:underline">{o.name}</Link>
                    <Unless s={offerStand(o)} />
                  </span>
                  <span className="block text-small text-mute-2">{mapped ? "Funnel mapped" : "No funnel"}</span>
                </li>
              );
            })}
          </ul>
        </Col>
        <Col label="Automation" empty={!g.automations.length}>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{g.automations.map(line)}</ul>
        </Col>
        <Col label="Traffic and resources" empty={!g.resources.length}>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{g.resources.map(line)}</ul>
        </Col>
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------- offers */

function OffersBySegment({ offers, brandId, canEdit, newOffer }: { offers: Offer[]; brandId: string; canEdit: boolean; newOffer: (segment?: string) => void }) {
  const { ws } = useApp();
  const segs = ws.brand(brandId)?.segments ?? [];
  const names = [...segs.map((s) => s.name), ...(segs.some((s) => s.name === "All segments") ? [] : ["All segments"])];
  const groups = names.map((name) => ({ name, list: offers.filter((o) => o.segment === name) })).filter((g) => g.list.length);
  const orphans = offers.filter((o) => !names.includes(o.segment));
  // An offer written for all segments covers them; otherwise name the segments nobody has written for.
  const missing = offers.some((o) => o.segment === "All segments") ? [] : segs.filter((s) => s.name !== "All segments" && !offers.some((o) => o.segment === s.name));

  return (
    <>
      <p className="m-0 mb-3 text-meta text-mute-2">By segment: the same service, argued for each audience.</p>
      <GroupedRows>
        {groups.map((g, i) => (
          <ListGroup key={g.name} as="h3" id={`segment-${i}`} title={<><Dot color={ws.segColor(g.name, brandId)} small />{g.name}</>} count={g.list.length} noun={["offer", "offers"]}>
            {g.list.map((o) => <OfferRow key={o.id} o={o} segment={false} />)}
          </ListGroup>
        ))}
        {orphans.length > 0 && (
          <ListGroup as="h3" id="segment-gone" title="Segment no longer in the Brand Kit" count={orphans.length} noun={["offer", "offers"]}>
            {orphans.map((o) => <OfferRow key={o.id} o={o} />)}
          </ListGroup>
        )}
      </GroupedRows>
      {missing.length > 0 && (
        <p className="m-0 mt-4 text-meta text-mute-2">
          Nothing written yet for{" "}
          {missing.map((s, i) => (
            <span key={s.name}>
              {i > 0 && (i === missing.length - 1 ? " or " : ", ")}
              {canEdit
                ? <button type="button" onClick={() => newOffer(s.name)} aria-label={`Write an offer for ${s.name}`} className="rounded-sm font-medium text-ink-3 underline decoration-line-strong underline-offset-2 hover:text-ink hover:decoration-current">{s.name}</button>
                : <span className="font-medium text-ink-3">{s.name}</span>}
            </span>
          ))}
          .
        </p>
      )}
    </>
  );
}
