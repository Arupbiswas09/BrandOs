"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Brand } from "@/db/schema";
import { Archive, ArchiveRestore, FolderOpen, Layers, Megaphone, Pencil, Plus } from "lucide-react";
import { hexA, readable, onColor } from "@/lib/color";
import { ASSET_STATUS, ASSET_TYPES, OFFER_STATUS, offerTypesOf } from "@/lib/constants";
import { href, type BrandTab } from "@/lib/routes";
import { archivedOnly, live, plural, type ServiceStats } from "@/lib/ws";
import { setArchived } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { AssetCard, OfferCard } from "@/components/cards";
import { BulkBar, SelectToggle, canBulk, useSelection } from "@/components/bulk";
import { CtaButton } from "@/components/drawer/asset-drawer";
import { ArchExpander, ArchivedNote, Btn, Card, Empty, H2, Mark, Page, Pills, SectionHead, Warn, cx } from "@/components/ui";
import { FOCUS, IconTile, LIFT } from "@/components/polish";
import { NotHere, useVisit } from "./common";
import { BrandKit } from "./kit";
import { RemoveOfferType } from "@/components/modals/offer-types";

export function BrandPage({ id, tab, type }: { id: string; tab: BrandTab; type?: string }) {
  const { ws } = useApp();
  const b = ws.brand(id);
  useVisit("brand", id, !!b);
  if (!b) return <NotHere what="brand" />;
  const body = (() => {
    switch (tab) {
      case "services": return <Services b={b} />;
      case "offers": return <Offers b={b} />;
      case "assets": return <Assets key={type ?? "all"} b={b} initialType={type} />;
      // The CTA library sits at the foot of the Brand Kit.
      case "kit": case "ctas": return <><BrandKit b={b} /><div id="kit-ctas" className="mt-12 scroll-mt-24"><Ctas b={b} /></div></>;
      case "strategy": return <Strategy b={b} />;
      default: return <Home b={b} />;
    }
  })();
  // The brand's sections are listed under it in the sidebar, so there is no
  // second row of tabs here. Home carries the brand's own header; every other
  // section gets one line saying which brand you are in.
  return (
    <Page>
      {tab !== "home" && <BrandLine b={b} />}
      {body}
    </Page>
  );
}

/** One line at the top of a brand section: which brand, and whose. */
function BrandLine({ b }: { b: Brand }) {
  const { ws } = useApp();
  const client = ws.client(b.clientId);
  const parent = ws.brand(b.parentId);
  return (
    <div className="-mt-2 mb-6 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[14.5px] text-mute-2 sm:-mt-4">
      <Link href={href.brand(b.id)} className={cx("flex min-w-0 items-center gap-2 rounded-md font-semibold text-ink hover:underline", FOCUS)}>
        <Mark mark={b.mark} color={b.primary} size={26} radius={7} className="text-[11px]" />
        <span className="truncate">{b.name}</span>
      </Link>
      {parent && <><span aria-hidden className="text-mute-4">/</span><span>Sub-brand of <Link href={href.brand(parent.id)} className="font-medium hover:text-ink hover:underline">{parent.name}</Link></span></>}
      {client && client.name !== b.name && <><span aria-hidden className="text-mute-4">·</span><Link href={href.client(client.id)} className="truncate hover:text-ink hover:underline">{client.name}</Link></>}
      {b.archived && <span className="rounded-md bg-chip px-2 py-0.5 text-[12.5px] font-semibold text-mute-2">Archived</span>}
    </div>
  );
}

/* ================================================================ home */

/** The five things a service holds, in the order the cards and the legend show them. */
const COUNTS: { code: string; word: string; n: (s: ServiceStats) => number }[] = [
  { code: "OF", word: "offers", n: (s) => s.offers },
  { code: "MAG", word: "lead magnets", n: (s) => s.leadMagnets },
  { code: "LP", word: "landing pages", n: (s) => s.landingPages },
  { code: "FN", word: "funnels", n: (s) => s.funnels },
  { code: "AUTO", word: "automations", n: (s) => s.automations },
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
  const needing = tiles.filter((t) => t.stats.attention > 0).length;
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
    <div className="animate-fade">
      <div className="head-band -mt-8 mb-8 pb-7 pt-7 sm:-mt-10 sm:pt-8">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <div className="flex min-w-0 flex-1 basis-[300px] items-center gap-4">
            <Mark mark={b.mark} color={b.primary} size={52} radius={13} className="text-[17px]" />
            <div className="min-w-0">
              <div className="eyebrow mb-1">{eyebrow}</div>
              <h1 className="display m-0 text-[32px] text-ink sm:text-[38px]">{b.name}</h1>
              {b.tagline && <p className="m-0 mt-1 max-w-[60ch] text-[15px] text-mute-2 text-pretty">{b.tagline}</p>}
            </div>
          </div>
          {tools && (
            <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a service" aria-label="Find a service" className="field min-w-0 flex-1 py-[8px] text-[15px] sm:w-[230px] sm:flex-none" />
              {needing > 0 && (
                <div role="group" aria-label="Show services" className="flex flex-none rounded-[9px] border border-line bg-white p-[3px]">
                  {([["all", "All"], ["attention", `Needs attention · ${needing}`]] as const).map(([k, label]) => (
                    <button key={k} type="button" aria-pressed={showOnly === k} onClick={() => setOnly(k)}
                      className={cx("rounded-[6px] px-3 py-[5px] text-[14px] font-medium transition-colors", showOnly === k ? "bg-hl text-hl-ink" : "text-mute-2 hover:text-ink")}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {b.archived && <ArchivedNote className="mb-6">Archived. Everything inside is untouched and comes back exactly as it was.</ArchivedNote>}

      <section aria-labelledby="brand-services">
        <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="brand-services" className="m-0 text-[17px] font-semibold tracking-[-0.01em]">
            Services
            {shown.length < tiles.length && <span className="ml-2 text-[14.5px] font-normal text-mute-3">{shown.length} of {tiles.length} shown</span>}
          </h2>
          {canEdit && services.length > 0 && <button type="button" onClick={newService} className="text-[14.5px] text-mute-2 hover:text-ink">+ New service</button>}
        </div>
        {shown.length > 0 && (
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
            {shown.map((x) => <ServiceCard key={x.key} x={x} />)}
          </div>
        )}
        {tiles.length > 0 && !shown.length && (
          <p className="m-0 rounded-xl border border-dashed border-line-strong px-5 py-4 text-[15px] text-mute-3">No service matches that.</p>
        )}
        {shown.length > 0 && (
          <p className="m-0 mt-3.5 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-mute-3">
            {COUNTS.map((c) => <span key={c.code}><span className="font-mono text-[11.5px] font-medium tracking-[0.08em] text-mute-2">{c.code}</span> {c.word}</span>)}
          </p>
        )}
        {!services.length && (
          <div className={cx(tiles.length > 0 && "mt-6")}>
            <Empty compact={tiles.length > 0} title="No services yet" body="A service is something this brand sells. Each one holds an offer for every segment it speaks to.">
              {canEdit && <Btn variant="primary" size="lg" onClick={newService}>Create the first service</Btn>}
            </Empty>
          </div>
        )}
      </section>

      {subs.length > 0 && (
        <section aria-labelledby="brand-subs" className="mt-10">
          <h2 id="brand-subs" className="m-0 mb-3 text-[17px] font-semibold tracking-[-0.01em]">Sub-brands</h2>
          <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
            {subs.map((sb) => (
              <li key={sb.id}>
                <Link href={href.brand(sb.id)} className={cx("flex items-center gap-2.5 rounded-[11px] border border-line bg-white py-2 pl-2 pr-4", LIFT, FOCUS)}>
                  <Mark mark={sb.mark} color={sb.primary} size={28} radius={7} className="text-[11px]" />
                  <span className="text-[15px] font-semibold text-ink">{sb.name}</span>
                  <span className="text-[14px] text-mute-3">{plural(live(ws.offersOf(sb.id)).length, "offer")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(ws.can("structure") || ws.can("del")) && (
        <div className="mt-14 flex flex-wrap items-center gap-2.5 border-t border-line pt-5">
          {ws.can("structure") && <Btn onClick={() => open({ kind: "brand", draft: b })}><Pencil aria-hidden size={16} />Edit brand identity</Btn>}
          {ws.can("structure") && !b.parentId && <Btn onClick={() => open({ kind: "brand", draft: { clientId: b.clientId, parentId: b.id } })}><Plus aria-hidden size={16} />Add sub-brand</Btn>}
          {/* Brands are never deleted. Archiving a whole brand is for admins only. */}
          {ws.can("del") && <Btn onClick={() => run(setArchived, "brand", b.id, !b.archived)}>{b.archived ? <ArchiveRestore aria-hidden size={16} /> : <Archive aria-hidden size={16} />}{b.archived ? "Restore brand" : "Archive brand"}</Btn>}
          <span className="flex-1" />
          {ws.can("del") && <span className="text-[14px] text-mute-3 md:max-w-[52ch]">Archiving hides a brand and everything in it. Nothing inside changes, and restoring brings it all back as it was.</span>}
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
    <Link href={x.to} className={cx("flex flex-col rounded-[14px] border border-line bg-white p-[18px] shadow-[0_1px_2px_rgba(16,22,20,.04)]", LIFT, FOCUS)}>
      <span className="block text-[17px] font-semibold leading-[1.3] tracking-[-0.012em] text-ink">{x.title}</span>
      <span className="mt-4 grid grid-cols-5 gap-1">
        {COUNTS.map((c) => {
          const n = c.n(s);
          return (
            <span key={c.code} className="min-w-0 rounded-[8px] bg-wash-2 px-[7px] pb-1.5 pt-[7px]">
              <span aria-hidden className="block font-mono text-[10.5px] font-medium tracking-[0.03em] text-mute-3">{c.code}</span>
              <span className={cx("mt-0.5 block text-[17px] leading-[1.25] tabular-nums", n ? "font-semibold text-ink" : "font-normal text-mute-5")}>{n}<span className="sr-only"> {c.word},</span></span>
            </span>
          );
        })}
      </span>
      <span className={cx("mt-4 flex items-center gap-2 text-[14px]", s.attention ? "text-warn-text" : "text-mute-3")}>
        {s.attention > 0 && <span aria-hidden className="h-[7px] w-[7px] flex-none rounded-full bg-warn" />}
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
      <SectionHead eyebrow="What the brand sells" title="Services" actions={canEdit && <Btn variant="primary" size="lg" onClick={() => open({ kind: "service", draft: { brandId: b.id } })}>+ New service</Btn>}
        sub={<>A service is what you sell. An offer is that service argued at one segment.</>}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {svcs.map((v) => {
          const st = ws.serviceStats(b.id, v.id);
          const segs = new Set(ws.serviceOffers(b.id, v.id).map((o) => o.segment));
          return (
            <Link key={v.id} href={href.service(v.id)} className={cx("flex flex-col gap-[13px] rounded-[14px] border border-line bg-white p-[22px] text-left shadow-[0_1px_2px_rgba(16,22,20,.04)]", LIFT, FOCUS)}>
              <span className="flex items-start gap-3.5">
                <IconTile icon={Layers} color={b.primary} size={40} />
                <span className="min-w-0 flex-1"><span className="block text-[19px] font-semibold leading-[1.25] tracking-[-0.015em] text-ink">{v.name}</span>{v.short && <span className="mt-[3px] block text-[15px] text-mute-2">{v.short}</span>}</span>
              </span>
              {v.description && <span className="block text-[15px] leading-[1.55] text-ink-3 text-pretty">{v.description}</span>}
              {segs.size > 0 && <span className="flex flex-wrap gap-[5px]">{[...segs].map((n) => <span key={n} className="rounded-[5px] px-2 py-0.5 text-[13px] font-semibold" style={{ background: hexA(ws.segColor(n, b.id), 0.13), color: readable(ws.segColor(n, b.id)) }}>{n}</span>)}</span>}
              <span className="mt-auto flex gap-4 border-t border-divider pt-3 text-[14.5px] text-mute-2">
                <span className="inline-flex items-center gap-1.5"><Megaphone aria-hidden size={15} className="text-mute-4" />{plural(st.offers, "offer")}</span>
                <span className="inline-flex items-center gap-1.5"><FolderOpen aria-hidden size={15} className="text-mute-4" />{plural(st.assets, "asset")}</span>
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
        <div className="mt-[38px]">
          <h2 className="m-0 mb-1 text-[17px] font-semibold">Standalone offers</h2>
          <p className="mb-3.5 mt-0 text-[14.5px] text-mute-2">These sit above every service rather than inside one.</p>
          <div className="grid gap-3.5 md:grid-cols-2">{stand.map((o) => <OfferCard key={o.id} o={o} variant="standalone" />)}</div>
        </div>
      )}
    </>
  );
}

/* ================================================================ offers */

function Offers({ b }: { b: Brand }) {
  const { ws, open } = useApp();
  const router = useRouter();
  const [seg, setSeg] = useState("All");
  const [stat, setStat] = useState("All");
  const [q, setQ] = useState("");
  const all = ws.offersOf(b.id);
  const t = q.toLowerCase();
  const filtered = all.filter((o) => (seg === "All" || o.segment === seg) && (stat === "All" || o.status === stat) && (!t || `${o.name} ${o.short} ${o.positioning} ${o.tags.join(" ")}`.toLowerCase().includes(t)));
  const shown = live(filtered);
  const segsPresent = ["All", ...b.segments.map((s) => s.name).filter((n) => all.some((o) => o.segment === n))];
  const statusesPresent = Object.keys(OFFER_STATUS).filter((st) => all.some((o) => o.status === st));
  const liveAll = live(all);
  const newOffer = () => open({ kind: "offer", draft: { brandId: b.id, segment: seg !== "All" ? seg : "All segments", status: "Ideation" } });
  return (
    <>
      <SectionHead eyebrow="Campaigns and packages" title="Offers" actions={ws.can("edit") && <Btn variant="primary" size="lg" onClick={newOffer}>+ New offer</Btn>}
        sub={<>Each offer holds one piece of positioning and everything that supports it. Assets can sit in several at once.</>}
      />
      {/* Filters only earn their place when there is something to choose between. */}
      {liveAll.length > 1 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter offers" aria-label="Filter offers" className="field mb-3 max-w-[280px] text-[15px]" />}
      {segsPresent.length > 2 && <Pills className="mb-2.5" value={seg} onChange={setSeg} label="Segment" options={segsPresent.map((s) => ({ value: s, label: s, count: s === "All" ? liveAll.length : liveAll.filter((o) => o.segment === s).length }))} />}
      {statusesPresent.length > 1 && <Pills className="mb-[26px]" value={stat} onChange={setStat} label="Status" options={["All", ...statusesPresent].map((s) => ({ value: s, label: s }))} />}
      {!(segsPresent.length > 2 || statusesPresent.length > 1) && <div className="mb-4" />}
      <div className="grid gap-4 md:grid-cols-2">{shown.map((o) => <OfferCard key={o.id} o={o} />)}</div>
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

function Assets({ b, initialType }: { b: Brand; initialType?: string }) {
  const { ws, open, openAsset } = useApp();
  const [type, setType] = useState(initialType ?? "All");
  const [stat, setStat] = useState("All");
  const [q, setQ] = useState("");
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const camp = ws.assetsOf(b.id).filter((a) => ws.catOf(a) === "campaign");
  const liveCamp = live(camp);
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
  // In select mode archived ones join the grid, so they can be restored in bulk too.
  const grid = sel.on ? [...shown, ...archivedOnly(filtered)] : shown;

  return (
    <>
      <SectionHead eyebrow="Files and content" title="Assets"
        actions={(ws.can("edit") || canBulk(ws, false)) && (
          <>
            {canBulk(ws, false) && camp.length > 0 && <SelectToggle s={sel} />}
            {ws.can("edit") && <Btn variant="primary" size="lg" onClick={newAsset}>+ Add asset</Btn>}
          </>
        )}
        sub={<>{plural(liveCamp.length, "asset")} in this brand. Each one exists once, however many offers point at it.</>}
      />
      {unlinked.length > 0 && (
        <button type="button" onClick={() => { setUnlinkedOnly(!unlinkedOnly); setType("All"); setStat("All"); }} className="mb-[18px] block w-full text-left">
          <Warn>
            {unlinkedOnly ? <>Showing the {unlinked.length} not linked to any offer. <span className="font-semibold underline">Show everything</span></> : <>{unlinked.length} not linked to any offer — probably the fastest thing to fix in here. <span className="font-semibold underline">Show them</span></>}
          </Warn>
        </button>
      )}
      {liveCamp.length > 1 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name or tag" aria-label="Filter by name or tag" className="field mb-3 max-w-[280px] text-[15px]" />}
      {types.length > 2 && <Pills className="mb-2" value={type} onChange={setType} label="Type" options={types.map((s) => ({ value: s, label: s }))} />}
      {assetStatuses.length > 1 && <Pills className="mb-[26px]" value={stat} onChange={setStat} label="Status" options={["All", ...assetStatuses].map((s) => ({ value: s, label: s }))} />}
      {!(types.length > 2 || assetStatuses.length > 1) && <div className="mb-4" />}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4">
        {grid.map((a) => <AssetCard key={a.id} a={a} selecting={sel.on} selected={sel.sel.has(a.id)} onToggle={() => sel.toggle(a.id)} />)}
      </div>
      {!sel.on && <ArchExpander items={archivedOnly(filtered)} noun="asset" onOpen={(a) => openAsset(a.id)} />}
      {sel.on && <BulkBar s={sel} shown={grid} />}
      {!grid.length && (
        <Empty title={camp.length === 0 ? "No assets yet" : "Nothing to show"} body={camp.length === 0 ? "Start with the thing you actually need: a landing page, an email, an ad." : "Nothing matches that search."}>
          {ws.can("edit") && <Btn variant="primary" size="lg" onClick={newAsset}>Add an asset</Btn>}
        </Empty>
      )}
    </>
  );
}

/* ================================================================ brand kit */

function Strategy({ b }: { b: Brand }) {
  const { ws, open } = useApp();
  const offers = live(ws.offersOf(b.id));
  const canEdit = ws.can("kit") || ws.can("structure");

  return (
    <>
      <SectionHead eyebrow="Who it is for and why" title="Strategy"
        sub={<>Goals, segments and offer types. Every offer is tagged with them.</>}
      />

      <H2 className="mb-[5px]" right={canEdit && <button type="button" onClick={() => open({ kind: "goal", brandId: b.id })} className="text-[14.5px] text-mute-2 hover:text-ink">+ New goal</button>}>Goals</H2>
      <p className="mb-[13px] mt-0 max-w-[64ch] text-[15px] text-mute-2">Broad business outcomes this brand is chasing — not channels or tactics. {b.goals.length} goals · five is usually enough. If two of them keep catching the same offers, merge them.</p>
      <div className="mb-8 grid gap-3 md:grid-cols-2">
        {b.goals.map((g) => {
          const n = offers.filter((o) => o.goals.includes(g.name)).length;
          const c = ws.goalColor(b.id, g.name);
          return (
            <Card key={g.name} className="rounded-xl px-[18px] py-4">
              <div className="mb-[7px] flex items-center gap-[9px]"><span className="h-[9px] w-[9px] flex-none rounded-[3px]" style={{ background: c }} /><span className="flex-1 text-[15px] font-semibold">{g.name}</span></div>
              <div className="mb-[11px] min-h-8 text-[14.5px] leading-[1.5] text-mute-1 text-pretty">{g.description}</div>
              <div className="flex items-center gap-2 border-t border-divider pt-2.5">
                <button type="button" onClick={() => open({ kind: "goalOffers", brandId: b.id, name: g.name })} className="flex-1 text-left text-[14px] font-medium hover:underline" style={{ color: n ? "#46534D" : "#8A6A12" }}>{n ? plural(n, "offer") : "None yet"}</button>
                {canEdit && <button type="button" onClick={() => open({ kind: "goal", brandId: b.id, name: g.name, description: g.description, original: g.name })} className="text-[14px] text-mute-2 hover:text-ink">Edit</button>}
                {canEdit && b.goals.length > 1 && <button type="button" onClick={() => open({ kind: "mergeGoal", brandId: b.id, from: g.name })} className="text-[14px] text-mute-2 hover:text-ink">Merge</button>}
              </div>
            </Card>
          );
        })}
      </div>

      <H2 className="mb-[5px]" right={canEdit && <button type="button" onClick={() => open({ kind: "offerTypes", brandId: b.id, add: true })} className="text-[14.5px] text-mute-2 hover:text-ink">+ New type</button>}>Offer types</H2>
      <p className="mb-[13px] mt-0 max-w-[62ch] text-[15px] text-mute-2">What the offer physically is. An audit and a paid engagement can both chase the same goal. Renaming a type moves its offers with it.</p>
      <div className="mb-[38px] flex flex-wrap gap-2.5">
        {offerTypesOf(b).map((t) => {
          const n = offers.filter((o) => o.offerType === t).length;
          return (
            <div key={t} className="flex items-center gap-2.5 rounded-[11px] border border-line bg-white px-[15px] py-[11px]">
              <span className="text-[15px] font-semibold">{t}</span>
              <span className="text-[14px] font-medium" style={{ color: n ? "#46534D" : "#8A6A12" }}>{n ? plural(n, "offer") : "None yet"}</span>
              {canEdit && (
                <span className="ml-0.5 flex items-center gap-2.5 border-l border-line pl-2.5">
                  <button type="button" onClick={() => open({ kind: "offerTypes", brandId: b.id, edit: t })} className="text-[14px] text-mute-2 hover:text-ink">Edit<span className="sr-only"> {t}</span></button>
                  <RemoveOfferType brandId={b.id} type={t} />
                </span>
              )}
            </div>
          );
        })}
      </div>

      <H2 right={canEdit && <button type="button" onClick={() => open({ kind: "kit", brandId: b.id })} className="text-[14.5px] text-mute-2 hover:text-ink">Edit segments</button>}>Segments</H2>
      <div className="mb-[38px] flex flex-wrap gap-2.5">
        {b.segments.map((sg) => (
          <Link key={sg.name} href={`${href.brand(b.id, "offers")}`} className="flex items-center gap-[11px] rounded-[11px] border border-line bg-white px-4 py-3 hover:border-mute-2">
            <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: sg.color }} />
            <span className="text-[15px] font-semibold">{sg.name}</span>
            <span className="text-[15px] text-mute-2">{plural(offers.filter((o) => o.segment === sg.name).length, "offer")}</span>
          </Link>
        ))}
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
      <div className="grid gap-3.5 md:grid-cols-2">
        {ctas.map((c) => {
          const used = [
            ...ws.d.offers.filter((o) => o.primaryCtaId === c.id || o.secondaryCtaId === c.id).map((o) => o.name),
            ...ws.d.assets.filter((a) => a.ctaId === c.id).map((a) => a.name),
          ];
          return (
            <Card key={c.id} className="flex flex-col gap-3.5 rounded-[13px] px-[22px] py-5">
              <div className="flex items-center justify-center rounded-[9px] bg-wash-2 p-[18px]"><CtaButton id={c.id} size="lg" /></div>
              <div>
                <div className="mb-[3px] break-all text-[15px] text-mute-2">{c.url || "No destination set"}</div>
                <div className="text-[14px] font-medium" style={{ color: used.length ? "#46534D" : "#8A6A12" }}>{used.length ? `Used in ${plural(used.length, "place")}` : "Not used yet"}</div>
                {used.length > 0 && <div className="mt-0.5 text-[14px] text-[#5A6862]">{used.slice(0, 3).join(" · ")}{used.length > 3 ? ` · +${used.length - 3} more` : ""}</div>}
              </div>
              <div className="flex gap-[7px] border-t border-divider pt-3">
                {ws.canChange({ ownerId: null }) && <Btn size="sm" onClick={() => open({ kind: "cta", draft: c })}>Edit</Btn>}
                {ws.can("del") && <Btn size="sm" variant="danger" onClick={() => open({ kind: "confirm", item: "cta", id: c.id, label: c.text })}>Delete</Btn>}
                <span className="flex-1" />
                <span className="self-center text-[13.5px] text-[#5A6862]">{c.style}</span>
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
