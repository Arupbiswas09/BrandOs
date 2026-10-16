"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Asset, Brand, Offer } from "@/db/schema";
import { Archive, ArchiveRestore, ChevronRight, FolderOpen, Layers, Megaphone, Pencil, Plus, Upload } from "lucide-react";
import { onColor } from "@/lib/color";
import { ASSET_STATUS, ASSET_TYPES, OFFER_STATUS, TONE, offerTypesOf } from "@/lib/constants";
import { href, type BrandTab } from "@/lib/routes";
import { archivedOnly, live, plural, type ServiceStats } from "@/lib/ws";
import { setArchived } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { AssetCard, AssetRow, AssetRows, Dot, GroupedRows, ListGroup, OfferCard, OfferRow, OfferRows, SegmentTag } from "@/components/cards";
import { BulkBar, SelectToggle, canBulk, useSelection } from "@/components/bulk";
import { CtaButton } from "@/components/drawer/asset-drawer";
import { ArchExpander, ArchivedNote, Btn, Card, Empty, FilterBar, H2, Mark, Page, SectionHead, cx } from "@/components/ui";
import { FOCUS, IconTile, LIFT } from "@/components/polish";
import { ViewToggle, useView } from "@/components/view-toggle";
import { NotHere, useVisit } from "./common";
import { BrandKit } from "./kit";
import { RemoveOfferType } from "@/components/modals/offer-types";
import { DropHint, useFileDrop } from "@/components/app/file-drop";
import { StarButton } from "@/components/features/stars/star-button";
import { useStarShortcut } from "@/components/features/stars/use-star-shortcut";
import { BrokenLinksCard } from "@/components/features/links/broken-links-card";
import { ImportLink } from "@/components/features/onboarding/entry-points";
import { BulkUpload } from "@/components/features/files/bulk-upload";
import { WhatWorked } from "@/components/features/results/what-worked";

export function BrandPage({ id, tab, type }: { id: string; tab: BrandTab; type?: string }) {
  const { ws } = useApp();
  const b = ws.brand(id);
  useVisit("brand", id, !!b);
  // "S" stars the brand from any of its sections.
  useStarShortcut("brand", id, b?.name ?? "", { enabled: !!b });
  if (!b) return <NotHere what="brand" />;
  const body = (() => {
    switch (tab) {
      case "services": return <Services b={b} />;
      case "offers": return <Offers b={b} />;
      case "assets": return <Assets key={type ?? "all"} b={b} initialType={type} />;
      // The CTA library sits at the foot of the Brand Kit.
      // The CTA library is the Brand Kit's last section (#kit-ctas opens it).
      case "kit": case "ctas": return <BrandKit b={b} ctas={<Ctas b={b} />} />;
      case "strategy": return <Strategy b={b} />;
      default: return <Home b={b} />;
    }
  })();
  // The brand's sections are listed under it in the sidebar, and the
  // breadcrumb and the header's brand mark already say which brand this is,
  // so a section starts straight with its own title.
  return (
    <Page>
      {b.archived && tab !== "home" && <ArchivedNote className="mb-5">This brand is archived. Restore it from its Home.</ArchivedNote>}
      {body}
    </Page>
  );
}

/* ================================================================ home */

/** The five things a service holds, in the order the cards and the legend show them. */
const COUNTS: { code: string; one: string; many: string; n: (s: ServiceStats) => number }[] = [
  { code: "OF", one: "offer", many: "offers", n: (s) => s.offers },
  { code: "MAG", one: "lead magnet", many: "lead magnets", n: (s) => s.leadMagnets },
  { code: "LP", one: "landing page", many: "landing pages", n: (s) => s.landingPages },
  { code: "FN", one: "funnel mapped", many: "funnels mapped", n: (s) => s.funnels },
  { code: "AUTO", one: "automation", many: "automations", n: (s) => s.automations },
];

type ServiceTile = { key: string; title: string; find: string; to: string; stats: ServiceStats };

/**
 * A brand's front door: who it is, then its services, each with what it holds
 * and what needs someone. Everything else lives in the sections.
 */
function Home({ b }: { b: Brand }) {
  const { ws, open } = useApp();
  const [run] = useAction();
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "attention">("all");
  const client = ws.client(b.clientId);
  const parent = ws.brand(b.parentId);
  const subs = live(ws.subBrands(b.id));
  const canEdit = ws.can("edit");
  const services = live(ws.servicesOf(b.id));
  const standalone = ws.serviceOffers(b.id, null);
  const tiles: ServiceTile[] = [
    ...services.map((v) => ({ key: v.id, title: v.name, find: `${v.name} ${v.short} ${v.description}`, to: href.service(v.id), stats: ws.serviceStats(b.id, v.id) })),
    ...(standalone.length ? [{ key: "standalone", title: "Standalone offers", find: "standalone offers", to: href.brand(b.id, "offers"), stats: ws.serviceStats(b.id, null) }] : []),
  ];
  // The same things the cards count, added up, so the switch and the cards agree.
  const needing = tiles.reduce((n, x) => n + x.stats.attention, 0);
  // Search and the attention switch only earn their place with something to choose between.
  const tools = tiles.length > 1;
  const showOnly = tools && needing > 0 ? only : "all";
  const t = q.trim().toLowerCase();
  const shown = tiles.filter((x) => (showOnly === "all" || x.stats.attention > 0) && (!t || x.find.toLowerCase().includes(t)));
  const newService = () => open({ kind: "service", draft: { brandId: b.id } });
  // Whose brand this is, unless the client shares its name (then it would only repeat the title).
  const eyebrow = parent
    ? <>Sub-brand · <Link href={href.brand(parent.id)} className="hover:text-ink hover:underline">{parent.name}</Link></>
    : client && client.name !== b.name
      ? <>Brand · <Link href={href.client(client.id)} className="hover:text-ink hover:underline">{client.name}</Link></>
      : "Brand";

  return (
    <div>
      <div className="head-band -mt-8 mb-8 pb-7 pt-7 sm:-mt-10 sm:pt-8">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <div className="flex min-w-0 flex-1 basis-[300px] items-center gap-4">
            <Mark mark={b.mark} color={b.primary} size={52} radius={12} className="text-lead" />
            <div className="min-w-0">
              <div className="eyebrow mb-1">{eyebrow}</div>
              <h1 className="display m-0 text-display text-ink">{b.name}</h1>
              {b.tagline && <p className="m-0 mt-1 max-w-[60ch] text-body text-mute-2 text-pretty">{b.tagline}</p>}
            </div>
            {/* On a phone the star sits beside the name, leaving the search its full width below. */}
            <StarButton kind="brand" id={b.id} name={b.name} className="ml-auto self-start sm:hidden" />
          </div>
          <div className={cx("flex flex-wrap items-center gap-2", tools ? "w-full sm:w-auto" : "max-sm:hidden")}>
            <StarButton kind="brand" id={b.id} name={b.name} className="max-sm:hidden" />
            {tools && <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a service" aria-label="Find a service" className="field min-w-0 flex-1 py-2 text-body sm:w-56 sm:flex-none" />}
            {tools && needing > 0 && (
              <div role="group" aria-label="Show services" className="flex h-10 flex-none items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5">
                {([["all", "All"], ["attention", `Needs attention · ${needing}`]] as const).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={showOnly === k} onClick={() => setOnly(k)}
                    className={cx("h-full rounded-lg px-3 text-meta font-medium transition-colors duration-150", showOnly === k ? "bg-soft text-accent" : "text-mute-2 hover:bg-hover hover:text-ink")}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {b.archived && <ArchivedNote className="mb-6">Archived. Everything inside is untouched and comes back exactly as it was.</ArchivedNote>}

      <section aria-labelledby="brand-services">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="brand-services" className="m-0 text-lead font-semibold tracking-[-0.01em]">
            Services
            {shown.length < tiles.length && <span className="ml-2 text-body font-normal text-mute-2">{shown.length} of {tiles.length} shown</span>}
          </h2>
          {canEdit && services.length > 0 && <button type="button" onClick={newService} className="rounded-sm text-body text-mute-2 hover:text-ink">+ New service</button>}
        </div>
        {/* What the codes on the cards mean, read before the cards rather than after them. */}
        {tiles.length > 0 && (
          <p className="m-0 mb-3 flex flex-wrap gap-x-4 gap-y-1 text-meta text-mute-2">
            <span className="sr-only">Each card counts: </span>
            {COUNTS.map((c) => <span key={c.code}><span className="font-mono text-micro font-medium tracking-[0.08em] text-ink-3">{c.code}</span> {c.many}</span>)}
          </p>
        )}
        {shown.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
            {shown.map((x) => <ServiceCard key={x.key} x={x} />)}
          </div>
        )}
        {tiles.length > 0 && !shown.length && (
          <p className="m-0 rounded-xl border border-dashed border-line-strong px-5 py-4 text-body text-mute-2">No service matches that.</p>
        )}
        {!services.length && (
          <div className={cx(tiles.length > 0 && "mt-6")}>
            <Empty compact={tiles.length > 0} title="No services yet" body="A service is something this brand sells. Each one holds an offer for every segment it speaks to.">
              {canEdit && <Btn variant="primary" size="lg" onClick={newService}>Create the first service</Btn>}
            </Empty>
          </div>
        )}
      </section>

      {/* What is stuck: links in this brand (and its sub-brands) that stopped opening. Nothing while they all open. */}
      <BrokenLinksCard brandId={b.id} className="mt-10" />

      {subs.length > 0 && (
        <section aria-labelledby="brand-subs" className="mt-10">
          <h2 id="brand-subs" className="m-0 mb-3 text-lead font-semibold tracking-[-0.01em]">Sub-brands</h2>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {subs.map((sb) => (
              <li key={sb.id}>
                <Link href={href.brand(sb.id)} className={cx("flex items-center gap-2.5 rounded-xl border border-line bg-surface py-2 pl-2 pr-4", LIFT, FOCUS)}>
                  <Mark mark={sb.mark} color={sb.primary} size={28} radius={8} className="text-micro" />
                  <span className="text-body font-semibold text-ink">{sb.name}</span>
                  <span className="text-meta text-mute-2">{plural(live(ws.offersOf(sb.id)).length, "offer")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(ws.can("structure") || ws.can("del")) && (
        <div className="mt-14 flex flex-wrap items-center gap-2 border-t border-line pt-5">
          {ws.can("structure") && <Btn onClick={() => open({ kind: "brand", draft: b })}><Pencil aria-hidden size={16} />Edit brand identity</Btn>}
          {ws.can("structure") && !b.parentId && <Btn onClick={() => open({ kind: "brand", draft: { clientId: b.clientId, parentId: b.id } })}><Plus aria-hidden size={16} />Add sub-brand</Btn>}
          {/* Brands are never deleted. Archiving a whole brand is for admins only. */}
          {ws.can("del") && <Btn onClick={() => run(setArchived, "brand", b.id, !b.archived)}>{b.archived ? <ArchiveRestore aria-hidden size={16} /> : <Archive aria-hidden size={16} />}{b.archived ? "Restore brand" : "Archive brand"}</Btn>}
          <span className="flex-1" />
          {ws.can("del") && <span className="text-meta text-mute-2 md:max-w-[52ch]">Archiving hides a brand and everything in it. Nothing inside changes, and restoring brings it all back as it was.</span>}
        </div>
      )}
    </div>
  );
}

/** One service on the brand home: its name, what it holds, and what needs someone. */
function ServiceCard({ x }: { x: ServiceTile }) {
  const s = x.stats;
  const parts = [s.attention > 0 && `${plural(s.attention, "thing")} need${s.attention === 1 ? "s" : ""} attention`, s.drafts > 0 && plural(s.drafts, "draft")].filter(Boolean);
  return (
    <Link href={x.to} className={cx("flex flex-col rounded-xl border border-line bg-surface p-4 shadow-card", LIFT, FOCUS)}>
      <span className="block text-lead font-semibold leading-[1.3] tracking-[-0.012em] text-ink">{x.title}</span>
      <span className="mt-3 grid grid-cols-5 gap-1">
        {COUNTS.map((c) => {
          const n = c.n(s);
          const words = `${n} ${n === 1 ? c.one : c.many}`;
          return (
            <span key={c.code} title={words} className="min-w-0 rounded-lg bg-wash-2 px-2 pb-1.5 pt-2">
              <span aria-hidden className="block font-mono text-micro font-medium tracking-[0.03em] text-mute-2">{c.code}</span>
              <span aria-hidden className={cx("mt-0.5 block text-lead leading-[1.25] tabular-nums", n ? "font-semibold text-ink" : "font-normal text-mute-2")}>{n}</span>
              <span className="sr-only">{words},</span>
            </span>
          );
        })}
      </span>
      <span className={cx("mt-3 flex items-center gap-2 text-meta", s.attention ? "text-warn-text" : "text-mute-2")}>
        {s.attention > 0 && <Dot color={TONE.review} />}
        {parts.length ? parts.join(" · ") : "All clear"}
      </span>
    </Link>
  );
}

/* ================================================================ services */

function Services({ b }: { b: Brand }) {
  const { ws, open } = useApp();
  const router = useRouter();
  const all = ws.servicesOf(b.id);
  const svcs = live(all);
  const stand = live(ws.standaloneOffers(b.id));
  const canEdit = ws.can("edit");

  return (
    <>
      <SectionHead as="h1" eyebrow="What the brand sells" title="Services" actions={canEdit && <Btn variant="primary" size="lg" onClick={() => open({ kind: "service", draft: { brandId: b.id } })}>+ New service</Btn>}
        sub={<>A service is what you sell. An offer is that service argued at one segment.</>}
      />

      <div className="grid gap-3 md:grid-cols-2">
        {svcs.map((v) => {
          const st = ws.serviceStats(b.id, v.id);
          const segs = new Set(ws.serviceOffers(b.id, v.id).map((o) => o.segment));
          return (
            <Link key={v.id} href={href.service(v.id)} className={cx("flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 text-left shadow-card", LIFT, FOCUS)}>
              <span className="flex items-start gap-3">
                <IconTile icon={Layers} color={b.primary} size={40} />
                <span className="min-w-0 flex-1"><span className="block text-title font-semibold leading-[1.25] tracking-[-0.015em] text-ink">{v.name}</span>{v.short && <span className="mt-1 block text-body text-mute-2">{v.short}</span>}</span>
              </span>
              {v.description && <span className="line-clamp-3 text-body leading-[1.55] text-ink-3 text-pretty">{v.description}</span>}
              {segs.size > 0 && <span className="flex flex-wrap gap-1.5 text-small">{[...segs].map((n) => <SegmentTag key={n} name={n} color={ws.segColor(n, b.id)} />)}</span>}
              <span className="mt-auto flex gap-4 border-t border-divider pt-3 text-body text-mute-2">
                <span className="inline-flex items-center gap-1.5"><Megaphone aria-hidden size={15} />{plural(st.offers, "offer")}</span>
                <span className="inline-flex items-center gap-1.5"><FolderOpen aria-hidden size={15} />{plural(st.assets, "asset")}</span>
              </span>
            </Link>
          );
        })}
      </div>
      <ArchExpander items={archivedOnly(all)} noun="service" onOpen={(v) => router.push(href.service(v.id))} />
      {!all.length && (
        <Empty title="No services yet" body="A service is a capability you sell, with one offer for each segment.">
          {canEdit && <Btn variant="primary" size="lg" onClick={() => open({ kind: "service", draft: { brandId: b.id } })}>Create the first service</Btn>}
        </Empty>
      )}
      {stand.length > 0 && (
        <section aria-labelledby="standalone-offers" className="mt-9">
          <h2 id="standalone-offers" className="m-0 text-lead font-semibold">Standalone offers</h2>
          <p className="mb-3 mt-0.5 text-body text-mute-2">These sit above every service rather than inside one.</p>
          <OfferRows>{stand.map((o) => <OfferRow key={o.id} o={o} />)}</OfferRows>
        </section>
      )}
    </>
  );
}

/* ================================================================ offers */

/** A group of offer cards under a heading that folds it away (the Cards view). Open unless someone folds it. */
function CardGroup({ id, title, count, noun, link, folded, onFold, children }: {
  id: string; title: ReactNode; count: number; noun: [string, string]; link?: ReactNode; folded: boolean; onFold: () => void; children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-h`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id={`${id}-h`} className="m-0 flex min-w-0 flex-1 text-meta font-semibold text-ink">
          <button type="button" aria-expanded={!folded} aria-controls={id} onClick={onFold} className="-ml-1 inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg py-1 pl-1 pr-2 text-left transition-colors hover:text-accent">
            <ChevronRight aria-hidden size={16} className={cx("flex-none text-mute-2 transition-transform duration-200 ease-snap", !folded && "rotate-90")} />
            <span className="truncate">{title}</span>{" "}
            <span className="flex-none font-normal text-mute-2">{count}<span className="sr-only"> {count === 1 ? noun[0] : noun[1]}</span></span>
          </button>
        </h2>
        {link}
      </div>
      <div id={id} hidden={folded}>{children}</div>
    </section>
  );
}

function Offers({ b }: { b: Brand }) {
  const { ws, open } = useApp();
  const router = useRouter();
  const [seg, setSeg] = useState("All");
  const [stat, setStat] = useState("All");
  const [q, setQ] = useState("");
  const [stored, setView] = useView("offers");
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const all = ws.offersOf(b.id);
  const t = q.toLowerCase();
  const filtered = all.filter((o) => (seg === "All" || o.segment === seg) && (stat === "All" || o.status === stat) && (!t || `${o.name} ${o.short} ${o.positioning} ${o.tags.join(" ")}`.toLowerCase().includes(t)));
  const shown = live(filtered);
  const segsPresent = ["All", ...b.segments.map((s) => s.name).filter((n) => all.some((o) => o.segment === n))];
  const statusesPresent = Object.keys(OFFER_STATUS).filter((st) => all.some((o) => o.status === st));
  const liveAll = live(all);
  // The switch only shows with two or more to arrange; with one, it is a row.
  const view = liveAll.length > 1 ? stored : "list";
  const newOffer = () => open({ kind: "offer", draft: { brandId: b.id, segment: seg !== "All" ? seg : "All segments", status: "Ideation" } });
  const fold = (k: string) => setFolded((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // By service, in the brand's order; offers of an archived service keep their group; standalone offers come last.
  const services = ws.servicesOf(b.id);
  const serviceLink = (l: { to: string; name: string }) => <Link href={l.to} className="flex-none rounded-sm px-1 text-small text-mute-2 hover:text-ink hover:underline">Service page<span className="sr-only"> for {l.name}</span></Link>;
  const groups: { key: string; title: ReactNode; list: Offer[]; link?: { to: string; name: string } }[] = [
    ...services.map((v) => ({
      key: v.id,
      title: <>{v.name}{v.archived && <span className="font-normal text-mute-2"> (archived service)</span>}</>,
      list: shown.filter((o) => o.serviceId === v.id),
      link: { to: href.service(v.id), name: v.name },
    })),
    { key: "standalone", title: "Standalone", list: shown.filter((o) => !o.serviceId || !services.some((v) => v.id === o.serviceId)) },
  ].filter((g) => g.list.length);

  return (
    <>
      <SectionHead as="h1" eyebrow="Campaigns and packages" title="Offers" actions={ws.can("edit") && <><ImportLink brandId={b.id} kind="offers" className="self-center" /><Btn variant="primary" size="lg" onClick={newOffer}>+ New offer</Btn></>}
        sub={<>Each offer holds one piece of positioning and everything that supports it.</>}
      />
      <div className="mb-5 flex flex-wrap items-center gap-2 [&>[role=search]]:mb-0">
        {/* Filters only earn their place when there is something to choose between, and fit on one row. */}
        <FilterBar
          q={q} onQ={liveAll.length > 1 ? setQ : undefined} placeholder="Filter offers"
          onClear={() => { setQ(""); setSeg("All"); setStat("All"); }}
          selects={[
            { label: "Segment", value: seg, onChange: setSeg, options: segsPresent.map((s) => ({ value: s, label: s === "All" ? `Every segment (${liveAll.length})` : `${s} (${liveAll.filter((o) => o.segment === s).length})` })) },
            { label: "Status", value: stat, onChange: setStat, options: ["All", ...statusesPresent].map((s) => ({ value: s, label: s === "All" ? "Any status" : s })) },
          ]}
        />
        <span className="flex-1" />
        {liveAll.length > 1 && <ViewToggle value={view} onChange={setView} gridLabel="Cards" />}
      </div>
      {groups.length > 0 && (view === "list" ? (
        <GroupedRows>
          {groups.map((g) => (
            <ListGroup key={g.key} id={`offers-${g.key}`} title={g.title} count={g.list.length} noun={["offer", "offers"]} aside={g.link && serviceLink(g.link)} folded={folded.has(g.key)} onFold={() => fold(g.key)}>
              {g.list.map((o) => <OfferRow key={o.id} o={o} />)}
            </ListGroup>
          ))}
        </GroupedRows>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <CardGroup key={g.key} id={`offers-${g.key}`} title={g.title} count={g.list.length} noun={["offer", "offers"]} link={g.link && serviceLink(g.link)} folded={folded.has(g.key)} onFold={() => fold(g.key)}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{g.list.map((o) => <OfferCard key={o.id} o={o} />)}</div>
            </CardGroup>
          ))}
        </div>
      ))}
      <ArchExpander items={archivedOnly(filtered)} noun="offer" onOpen={(o) => router.push(href.offer(o.id))} />
      {!shown.length && (
        <Empty title={all.length === 0 ? "No offers yet" : "No offers here"} body={all.length === 0 ? "An offer is a campaign or package that holds the positioning and every asset that supports it." : "Nothing matches those filters."}>
          {ws.can("edit") && <Btn variant="primary" size="lg" onClick={newOffer}>{all.length ? "Create an offer" : "Create the first offer"}</Btn>}
        </Empty>
      )}
    </>
  );
}

/* ================================================================ assets */

/** Assets with a real picture first, so a grid's rows keep one height; otherwise in the order given. */
const picturesFirst = (list: Asset[], has: (a: Asset) => boolean) => [...list.filter(has), ...list.filter((a) => !has(a))];

function Assets({ b, initialType }: { b: Brand; initialType?: string }) {
  const { ws, open, openAsset } = useApp();
  const [type, setType] = useState(initialType ?? "All");
  const [stat, setStat] = useState("All");
  const [q, setQ] = useState("");
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [stored, setView] = useView("assets");
  const camp = ws.assetsOf(b.id).filter((a) => ws.catOf(a) === "campaign");
  const liveCamp = live(camp);
  const view = camp.length > 1 ? stored : "list";
  const unlinked = liveCamp.filter((a) => ws.linkedOfferIds(a.id).length === 0);
  const t = q.toLowerCase();
  const filtered = camp.filter((a) =>
    (type === "All" || a.type === type) && (stat === "All" || a.status === stat) &&
    (!unlinkedOnly || ws.linkedOfferIds(a.id).length === 0) &&
    (!t || `${a.name} ${a.short} ${a.tags.join(" ")}`.toLowerCase().includes(t)));
  const shown = live(filtered);
  const types = ["All", ...Object.keys(ASSET_TYPES).filter((k) => camp.some((a) => a.type === k))];
  const assetStatuses = Object.keys(ASSET_STATUS).filter((st) => camp.some((a) => a.status === st));
  const newAsset = () => open({ kind: "asset", draft: { brandId: b.id, status: "Draft", offerIds: [] }, step: 0 });
  const sel = useSelection();
  // In select mode archived ones join the list, so they can be restored in bulk too.
  const list = sel.on ? [...shown, ...archivedOnly(filtered)] : shown;
  const items = view === "grid" ? picturesFirst(list, (a) => !!ws.previewOf(a)) : list;
  // Many files at once, each its own draft asset in this brand.
  const canUpload = ws.can("edit") && ws.can("upload");
  const [adding, setAdding] = useState(false);
  const [dropped, setDropped] = useState<{ n: number; files: File[] }>({ n: 0, files: [] });
  const drop = useFileDrop(canUpload && !adding, (files) => { setDropped((d) => ({ n: d.n + 1, files })); setAdding(true); });

  return (
    <div {...drop.bind} className={cx("rounded-xl", drop.over && "outline-2 outline-offset-8 outline-accent outline-dashed")}>
      <DropHint show={drop.over} where={b.name} />
      <SectionHead as="h1" eyebrow="Files and content" title="Assets"
        actions={(ws.can("edit") || canBulk(ws, false)) && (
          <>
            {canBulk(ws, false) && camp.length > 0 && <SelectToggle s={sel} />}
            <ImportLink brandId={b.id} kind="assets" className="self-center" />
            {canUpload && <Btn size="lg" aria-expanded={adding} onClick={() => { if (!adding) setDropped((d) => ({ n: d.n + 1, files: [] })); setAdding(!adding); }}><Upload aria-hidden size={16} />Upload files</Btn>}
            {ws.can("edit") && <Btn variant="primary" size="lg" onClick={newAsset}>+ Add asset</Btn>}
          </>
        )}
        sub={<>{plural(liveCamp.length, "asset")} in this brand. Each one exists once, however many offers point at it.</>}
      />
      {adding && <BulkUpload key={dropped.n} brandId={b.id} initialFiles={dropped.files} onClose={() => setAdding(false)} className="mb-6" />}
      <div className="mb-5 flex flex-wrap items-center gap-2 [&>[role=search]]:mb-0">
        <FilterBar
          q={q} onQ={liveCamp.length > 1 ? setQ : undefined} placeholder="Filter by name or tag"
          onClear={() => { setQ(""); setType("All"); setStat("All"); setUnlinkedOnly(false); }}
          selects={[
            { label: "Type", value: type, onChange: setType, options: types.map((s) => ({ value: s, label: s === "All" ? `Every type (${liveCamp.length})` : `${s} (${liveCamp.filter((a) => a.type === s).length})` })) },
            { label: "Status", value: stat, onChange: setStat, options: ["All", ...assetStatuses].map((s) => ({ value: s, label: s === "All" ? "Any stage" : s })) },
          ]}
        />
        {/* The quickest thing to fix in here, as a filter rather than a banner. */}
        {(unlinked.length > 0 || unlinkedOnly) && (
          <button type="button" aria-pressed={unlinkedOnly} onClick={() => setUnlinkedOnly(!unlinkedOnly)}
            className={cx("inline-flex h-10 flex-none items-center gap-2 rounded-lg border px-3 text-body transition-colors duration-150",
              unlinkedOnly ? "border-accent bg-soft font-semibold text-accent" : "border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink")}>
            Not linked ({unlinked.length})
          </button>
        )}
        <span className="flex-1" />
        {camp.length > 1 && <ViewToggle value={view} onChange={setView} />}
      </div>
      {items.length > 0 && (view === "list" ? (
        <AssetRows label="Assets">
          {items.map((a) => <AssetRow key={a.id} a={a} tools selecting={sel.on} selected={sel.sel.has(a.id)} onToggle={() => sel.toggle(a.id)} />)}
        </AssetRows>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {items.map((a) => <AssetCard key={a.id} a={a} selecting={sel.on} selected={sel.sel.has(a.id)} onToggle={() => sel.toggle(a.id)} />)}
        </div>
      ))}
      {!sel.on && <ArchExpander items={archivedOnly(filtered)} noun="asset" onOpen={(a) => openAsset(a.id)} />}
      {sel.on && <BulkBar s={sel} shown={list} />}
      {!list.length && (
        <Empty title={camp.length === 0 ? "No assets yet" : "Nothing to show"} body={camp.length === 0 ? "Start with the thing you actually need: a landing page, an email, an ad." : "Nothing matches that search."}>
          {ws.can("edit") && <Btn variant="primary" size="lg" onClick={newAsset}>Add an asset</Btn>}
        </Empty>
      )}
    </div>
  );
}

/* ================================================================ strategy */

function Strategy({ b }: { b: Brand }) {
  const { ws, open } = useApp();
  const offers = live(ws.offersOf(b.id));
  const canEdit = ws.can("kit") || ws.can("structure");
  const count = (n: number) => <span className={n ? "text-ink-3" : "text-warn-text"}>{n ? plural(n, "offer") : "None yet"}</span>;

  return (
    <>
      <SectionHead as="h1" eyebrow="Who it is for and why" title="Strategy"
        sub={<>Goals, segments and offer types. Every offer is tagged with them.</>}
      />
      <div className="xl:flex xl:items-start">
        <div className="@container min-w-0 xl:flex-1">
          <H2 className="mb-1" right={canEdit && <button type="button" onClick={() => open({ kind: "goal", brandId: b.id })} className="rounded-sm text-body text-mute-2 hover:text-ink">+ New goal</button>}>Goals</H2>
          <p className="mb-3 mt-0 max-w-[64ch] text-body text-mute-2">Broad business outcomes this brand is chasing, not channels or tactics. Five is usually enough; if two of them keep catching the same offers, merge them.</p>
          <div className="mb-8 grid gap-3 @lg:grid-cols-2 @2xl:grid-cols-3">
            {b.goals.map((g) => {
              const n = offers.filter((o) => o.goals.includes(g.name)).length;
              return (
                <Card key={g.name} className="px-4 py-3.5">
                  <div className="mb-1 text-body font-semibold">{g.name}</div>
                  <div className="mb-2.5 text-body leading-[1.5] text-mute-2 text-pretty">{g.description}</div>
                  <div className="flex items-center gap-3 border-t border-divider pt-2.5 text-meta">
                    <button type="button" onClick={() => open({ kind: "goalOffers", brandId: b.id, name: g.name })} className="flex-1 rounded-sm text-left font-medium hover:underline">{count(n)}</button>
                    {canEdit && <button type="button" onClick={() => open({ kind: "goal", brandId: b.id, name: g.name, description: g.description, original: g.name })} className="rounded-sm text-mute-2 hover:text-ink">Edit<span className="sr-only"> {g.name}</span></button>}
                    {canEdit && b.goals.length > 1 && <button type="button" onClick={() => open({ kind: "mergeGoal", brandId: b.id, from: g.name })} className="rounded-sm text-mute-2 hover:text-ink">Merge<span className="sr-only"> {g.name}</span></button>}
                  </div>
                </Card>
              );
            })}
          </div>

          <H2 className="mb-1" right={canEdit && <button type="button" onClick={() => open({ kind: "offerTypes", brandId: b.id, add: true })} className="rounded-sm text-body text-mute-2 hover:text-ink">+ New type</button>}>Offer types</H2>
          <p className="mb-3 mt-0 max-w-[62ch] text-body text-mute-2">What the offer physically is. An audit and a paid engagement can both chase the same goal. Renaming a type moves its offers with it.</p>
          <div className="mb-8 flex flex-wrap gap-2">
            {offerTypesOf(b).map((t) => {
              const n = offers.filter((o) => o.offerType === t).length;
              return (
                <div key={t} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-2.5">
                  <span className="text-body font-semibold">{t}</span>
                  <span className="text-meta font-medium">{count(n)}</span>
                  {canEdit && (
                    <span className="ml-0.5 flex items-center gap-2.5 border-l border-line pl-2.5">
                      <button type="button" onClick={() => open({ kind: "offerTypes", brandId: b.id, edit: t })} className="rounded-sm text-meta text-mute-2 hover:text-ink">Edit<span className="sr-only"> {t}</span></button>
                      <RemoveOfferType brandId={b.id} type={t} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <H2 right={canEdit && <button type="button" onClick={() => open({ kind: "kit", brandId: b.id })} className="rounded-sm text-body text-mute-2 hover:text-ink">Edit segments</button>}>Segments</H2>
          <div className="mb-4 flex flex-wrap gap-2">
            {b.segments.map((sg) => (
              <Link key={sg.name} href={href.brand(b.id, "offers")} className={cx("flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-2.5 hover:border-line-strong", FOCUS)}>
                <Dot color={sg.color} small />
                <span className="text-body font-semibold">{sg.name}</span>
                <span className="text-meta">{count(offers.filter((o) => o.segment === sg.name).length)}</span>
              </Link>
            ))}
          </div>
        </div>
        {/* What converts best here, from recorded results. Renders nothing (and the column folds away) until two offers can be compared. */}
        <div className="mt-8 empty:hidden xl:sticky xl:top-20 xl:ml-8 xl:mt-0 xl:w-80 xl:flex-none">
          <WhatWorked brandId={b.id} />
        </div>
      </div>
    </>
  );
}

/* ================================================================ CTAs */

function Ctas({ b }: { b: Brand }) {
  const { ws, open } = useApp();
  const ctas = ws.ctasOf(b.id);
  const newCta = () => open({ kind: "cta", draft: { brandId: b.id, bg: b.primary, fg: onColor(b.primary), style: "solid" } });
  return (
    <>
      <SectionHead eyebrow="Buttons and calls to action" title="CTAs" actions={ws.can("edit") && <Btn onClick={newCta}>+ New CTA</Btn>}
        sub={<>Written once, used everywhere, in their real colours. You can also create one straight from an offer&apos;s CTA list.</>}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {ctas.map((c) => {
          const used = [
            ...ws.d.offers.filter((o) => o.primaryCtaId === c.id || o.secondaryCtaId === c.id).map((o) => o.name),
            ...ws.d.assets.filter((a) => a.ctaId === c.id).map((a) => a.name),
          ];
          return (
            <Card key={c.id} className="flex flex-col gap-3 px-5 py-5">
              <div className="flex items-center justify-center rounded-lg bg-wash-2 p-4"><CtaButton id={c.id} size="lg" /></div>
              <div>
                <div className="mb-1 break-all text-body text-mute-2">{c.url || "No destination set"}</div>
                <div className={cx("text-meta font-medium", used.length ? "text-ink-3" : "text-warn-text")}>{used.length ? `Used in ${plural(used.length, "place")}` : "Not used yet"}</div>
                {used.length > 0 && <div className="mt-0.5 text-meta text-mute-2">{used.slice(0, 3).join(" · ")}{used.length > 3 ? ` · +${used.length - 3} more` : ""}</div>}
              </div>
              <div className="flex gap-2 border-t border-divider pt-3">
                {ws.canChange({ ownerId: null }) && <Btn size="sm" onClick={() => open({ kind: "cta", draft: c })}>Edit</Btn>}
                {ws.can("del") && <Btn size="sm" variant="danger" onClick={() => open({ kind: "confirm", item: "cta", id: c.id, label: c.text })}>Delete</Btn>}
                <span className="flex-1" />
                <span className="self-center text-meta text-mute-2">{c.style}</span>
              </div>
            </Card>
          );
        })}
      </div>
      {!ctas.length && (
        <Empty title="No CTAs yet" body="Write the button once and reuse it across every offer and asset.">
          {ws.can("edit") && <Btn variant="primary" size="lg" onClick={newCta}>Create a CTA</Btn>}
        </Empty>
      )}
    </>
  );
}
