"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStored } from "@/lib/stored";
import type { Brand } from "@/db/schema";
import { hexA, readable, onColor } from "@/lib/color";
import { ASSET_STATUS, ASSET_TYPES, OFFER_STATUS, OFFER_TYPES } from "@/lib/constants";
import { href, type BrandTab } from "@/lib/routes";
import { archivedOnly, live, plural } from "@/lib/ws";
import { setArchived } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { AssetCard, OfferCard, blocksFor } from "@/components/cards";
import { CtaButton } from "@/components/drawer/asset-drawer";
import { ArchExpander, ArchivedNote, Blocks, Btn, Card, Empty, H2, Mark, Page, PageHead, Pills, Warn, cx } from "@/components/ui";
import { NotHere, useVisit } from "./common";

export function BrandPage({ id, tab, type }: { id: string; tab: BrandTab; type?: string }) {
  const { ws } = useApp();
  const b = ws.brand(id);
  useVisit("brand", id, !!b);
  if (!b) return <NotHere what="brand" />;
  switch (tab) {
    case "services": return <Services b={b} />;
    case "offers": return <Offers b={b} />;
    case "assets": return <Assets key={type ?? "all"} b={b} initialType={type} />;
    case "kit": return <Kit b={b} />;
    case "ctas": return <Ctas b={b} />;
    default: return <Home b={b} />;
  }
}

/* ================================================================ home */

function Home({ b }: { b: Brand }) {
  const { ws, open } = useApp();
  const router = useRouter();
  const [run] = useAction();
  const offers = live(ws.offersOf(b.id));
  const all = ws.assetsOf(b.id);
  const camp = live(all.filter((a) => ws.catOf(a) === "campaign"));
  const templates = live(all.filter((a) => a.isTemplate));
  const services = live(ws.servicesOf(b.id));
  const ctas = ws.ctasOf(b.id);
  const parent = ws.brand(b.parentId);
  const subs = live(ws.subBrands(b.id));
  const canEdit = ws.can("edit");

  const stats = [
    { label: "Offers", value: offers.length, tab: "offers" as BrandTab },
    { label: "Services", value: services.length, tab: "services" as BrandTab },
    { label: "Assets", value: camp.length, tab: "assets" as BrandTab },
    { label: "CTAs", value: ctas.length, tab: "ctas" as BrandTab },
    { label: "Templates", value: templates.length, tab: "kit" as BrandTab },
  ];

  const typeMap = new Map<string, typeof camp>();
  camp.forEach((a) => typeMap.set(a.type, [...(typeMap.get(a.type) ?? []), a]));
  const byType = [...typeMap.entries()].sort((x, y) => y[1].length - x[1].length);
  const rc = { Approved: 0, "In review": 0, "Changes requested": 0, None: 0 };
  camp.forEach((a) => { rc[a.review] += 1; });
  const recent = [...camp].sort((x, y) => +new Date(y.updatedAt) - +new Date(x.updatedAt)).slice(0, 4);

  const actions = [
    canEdit && { label: "Create an offer", sub: "Positioning first, assets after", go: () => open({ kind: "offer", draft: { brandId: b.id, segment: "All segments", status: "Ideation" } }) },
    canEdit && { label: "Add an asset", sub: "Landing page, email, ad, document", go: () => open({ kind: "asset", draft: { brandId: b.id, status: "Draft", offerIds: [] }, step: 0 }) },
    { label: "View the Brand Kit", sub: "Logos, colours, fonts, guidelines", go: () => router.push(href.brand(b.id, "kit")) },
    { label: "Browse the library", sub: "Everything reusable in this brand", go: () => router.push(href.brand(b.id, "assets")) },
  ].filter(Boolean) as { label: string; sub: string; go: () => void }[];

  return (
    <div className="animate-fade">
      <div className="px-4 pb-12 pt-12 sm:px-8 sm:pt-16" style={{ background: "linear-gradient(180deg,var(--bos-soft) 0%,rgba(255,255,255,0) 100%)" }}>
        <div className="mx-auto max-w-[760px] animate-rise text-center">
          <Mark mark={b.mark} color="var(--bos-accent)" fg="var(--bos-on)" size={72} radius={18} className="mx-auto mb-[22px] text-[22px]" />
          {parent && <div className="mb-2.5 text-[13.5px] font-semibold uppercase tracking-[0.08em] text-mute-2">Wing of <Link href={href.brand(parent.id)} className="hover:text-ink">{parent.name}</Link></div>}
          <h1 className="m-0 mb-2.5 font-serif text-[36px] font-normal leading-[1.05] tracking-[-0.025em] sm:text-[44px]">Welcome to {b.name}</h1>
          <p className="mx-auto my-0 max-w-[44ch] text-[17px] leading-[1.5] text-mute-1 text-pretty">{b.tagline}</p>
          <div className="mt-[34px] inline-flex max-w-full flex-wrap justify-center overflow-hidden rounded-[14px] border border-line bg-white theme-fade">
            {stats.map((s, i) => (
              <Link key={s.label} href={href.brand(b.id, s.tab)} className={cx("px-5 py-4 text-center hover:bg-wash sm:px-[30px]", i < stats.length - 1 && "border-r border-line")}>
                <span className="block font-mono text-[23px] font-medium tabular-nums tracking-[-0.01em]">{s.value}</span>
                <span className="mt-0.5 block text-[14.5px] text-mute-2">{s.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1060px] px-4 pb-[88px] pt-4 sm:px-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {actions.map((q) => (
            <button key={q.label} type="button" onClick={q.go} className="flex flex-col rounded-xl border border-line bg-white p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(16,22,20,.07)]">
              <span className="mb-1 block text-[16px] font-semibold text-accent">{q.label}</span>
              <span className="block text-[15px] leading-[1.45] text-mute-2">{q.sub}</span>
            </button>
          ))}
        </div>
        {b.archived && <ArchivedNote className="mt-[22px]">Archived. Everything inside is untouched and comes back exactly as it was.</ArchivedNote>}
        {b.description && <p className="m-0 mt-[34px] max-w-[64ch] text-[15px] leading-[1.6] text-ink-3 text-pretty">{b.description}</p>}

        {(subs.length > 0 || (canEdit && !b.parentId)) && (
          <div className="mt-10">
            <H2 right={canEdit && !b.parentId && <button type="button" onClick={() => open({ kind: "brand", draft: { clientId: b.clientId, parentId: b.id } })} className="text-[14.5px] text-mute-2 hover:text-ink">+ Add sub-brand</button>}>Wings of this building</H2>
            {subs.length > 0 ? (
              <div className="grid gap-3.5 md:grid-cols-2">
                {subs.map((sb) => (
                  <Link key={sb.id} href={href.brand(sb.id)} className="flex items-center gap-3.5 rounded-[13px] border border-line p-[18px] text-left hover:brightness-[.985]" style={{ background: hexA(sb.primary, 0.1) }}>
                    <Mark mark={sb.mark} color={sb.primary} size={38} radius={9} />
                    <span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold">{sb.name}</span><span className="mt-0.5 block text-[14px] text-mute-1">{sb.tagline}</span></span>
                    <span className="flex-none text-[14.5px] text-mute-2">{plural(live(ws.assetsOf(sb.id)).length, "asset")}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-[15px] text-mute-3">No sub-brands. Add one when part of this brand needs its own identity.</div>
            )}
          </div>
        )}

        {camp.length > 0 && (
          <div className="mt-11">
            <div className="mb-1 flex items-baseline justify-between gap-4">
              <h2 className="m-0 text-[17px] font-semibold">Everything in this building</h2>
              <span className="text-[15px] text-mute-3">{plural(camp.length, "asset")} in this building</span>
            </div>
            <p className="mb-4 mt-0 text-[15px] text-mute-3">One square per asset, coloured by where it stands. Hover any square to name it.</p>
            <Card className="overflow-hidden">
              {byType.map(([type, list]) => (
                <Link key={type} href={`${href.brand(b.id, "assets")}?type=${encodeURIComponent(type)}`} className="flex w-full items-start gap-4 border-t border-divider px-5 py-[13px] text-left first:border-t-0 hover:bg-wash">
                  <span className="w-[110px] flex-none pt-px text-[15px] font-semibold sm:w-[136px]">{type}</span>
                  <span className="w-[26px] flex-none pt-0.5 font-mono text-[14.5px] text-mute-3">{list.length}</span>
                  <span className="flex-1"><Blocks blocks={blocksFor(list, 60)} size={15} gap={4} /></span>
                </Link>
              ))}
            </Card>
            <div className="mt-3 flex flex-wrap gap-4">
              {[["Approved", rc.Approved, "#2F8F62"], ["In review", rc["In review"], "#8A6A12"], ["Changes requested", rc["Changes requested"], "#C2410C"], ["Not reviewed", rc.None, "#CBD6D1"]].map(([l, n, c]) => (
                <span key={l as string} className="flex items-center gap-[7px] text-[14.5px] text-mute-2">
                  <span className="h-[11px] w-[11px] rounded-[3px]" style={{ background: c as string }} />{l}
                  <span className="font-mono font-medium text-ink">{n}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10">
          <H2>Recently updated</H2>
          {recent.length > 0 ? (
            <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
              {recent.map((a) => <AssetCard key={a.id} a={a} variant="recent" />)}
            </div>
          ) : (
            <Empty title="This building is empty" body="Start with the thing you actually need, not with a database record.">
              {canEdit && <Btn variant="primary" size="lg" onClick={() => open({ kind: "asset", draft: { brandId: b.id, status: "Draft", offerIds: [] }, step: 0 })}>Add the first asset</Btn>}
            </Empty>
          )}
        </div>

        <div className="mt-11 flex flex-wrap items-center gap-2.5 border-t border-line pt-5">
          {canEdit && <Btn onClick={() => open({ kind: "brand", draft: b })}>Edit brand identity</Btn>}
          {canEdit && <Btn onClick={() => open({ kind: "share", brandId: b.id })}>Share with the client{ws.d.shareLinks.some((l) => l.brandId === b.id) ? ` · ${ws.d.shareLinks.filter((l) => l.brandId === b.id).length} live` : ""}</Btn>}
          {ws.can("archive") && <Btn onClick={() => run(setArchived, "brand", b.id, !b.archived)}>{b.archived ? "Restore brand" : "Archive brand"}</Btn>}
          {ws.can("del") && <Btn variant="danger" onClick={() => open({ kind: "confirm", item: "brand", id: b.id, label: b.name, back: href.client(b.clientId) })}>Delete brand</Btn>}
          <span className="flex-1" />
          <span className="text-[14.5px] text-mute-3 md:max-w-[52ch]">Archiving hides a brand and everything in it. Nothing inside changes, and restoring brings it all back as it was.</span>
        </div>
      </div>
    </div>
  );
}

/* ================================================================ services + coverage */

type GridBy = "goal" | "type" | "segment";

function useGridBy(bid: string): [GridBy, (g: GridBy) => void] {
  return useStored<GridBy>("bos.grid." + bid, "goal", ["goal", "type", "segment"]);
}

function Services({ b }: { b: Brand }) {
  const { ws, open } = useApp();
  const router = useRouter();
  const [gridBy, setGridBy] = useGridBy(b.id);
  const all = ws.servicesOf(b.id);
  const svcs = live(all);
  const stand = live(ws.standaloneOffers(b.id));
  const canEdit = ws.can("edit");
  const cols = gridBy === "goal" ? b.goals.map((g) => g.name) : gridBy === "type" ? OFFER_TYPES : b.segments.map((s) => s.name);
  const matches = (o: { goals: string[]; offerType: string; segment: string }, col: string) =>
    gridBy === "goal" ? o.goals.includes(col) : gridBy === "type" ? o.offerType === col : o.segment === col;
  const prefill = (col: string) => (gridBy === "goal" ? { goals: [col] } : gridBy === "type" ? { offerType: col } : { segment: col });
  const rows = [
    ...svcs.map((v) => ({ id: v.id, label: v.name, list: live(ws.offersOfService(v.id)), sid: v.id as string | null })),
    ...(stand.length ? [{ id: "none", label: "Standalone", list: stand, sid: null }] : []),
  ];
  const gaps = rows.reduce((n, r) => n + cols.filter((c) => !r.list.some((o) => matches(o, c))).length, 0);

  return (
    <Page>
      <PageHead eyebrow="Floors" title="Services" actions={canEdit && <Btn variant="primary" size="lg" onClick={() => open({ kind: "service", draft: { brandId: b.id } })}>+ New service</Btn>} />
      <p className="mb-[30px] max-w-[60ch] text-[15px] text-[#566560] text-pretty">A service is what you sell. An offer is that service argued at one segment. Keeping them apart is what makes a missing version visible.</p>

      {cols.length > 0 && svcs.length > 0 && (
        <div className="mb-9">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 flex-none text-[17px] font-semibold">Coverage</h2>
            <Pills className="flex-1" tone="dark" value={gridBy} onChange={setGridBy} label="Compare services by" options={[{ value: "goal", label: "Goal" }, { value: "type", label: "Offer type" }, { value: "segment", label: "Segment" }]} />
            <span className="flex-none text-[14.5px] font-semibold text-[#8A6A12]">{plural(gaps, "combination")} not written yet</span>
          </div>
          <Card className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="flex items-stretch border-b border-line bg-wash-2">
                <div className="eyebrow w-[200px] flex-none px-4 py-3 text-[12px] tracking-[0.11em]">Service · {gridBy === "goal" ? "Goal" : gridBy === "type" ? "Offer type" : "Segment"}</div>
                {cols.map((c) => <div key={c} className="flex-1 border-l border-line px-2 py-3 text-center text-[14px] font-semibold leading-[1.3] text-mute-1">{c}</div>)}
              </div>
              {rows.map((r) => (
                <div key={r.id} className="flex items-stretch border-b border-divider last:border-b-0">
                  <button type="button" onClick={() => router.push(r.sid ? href.service(r.sid) : href.brand(b.id, "offers"))} className="w-[200px] flex-none px-4 py-[13px] text-left text-[15px] font-medium hover:text-accent">{r.label}</button>
                  {cols.map((col) => {
                    const hits = r.list.filter((o) => matches(o, col));
                    const n = hits.length;
                    return (
                      <button
                        key={col}
                        type="button"
                        title={n ? hits.map((o) => o.name).join(" · ") : "No offer here yet"}
                        disabled={!n && !canEdit}
                        onClick={() => (n ? (n === 1 ? router.push(href.offer(hits[0].id)) : router.push(r.sid ? href.service(r.sid) : href.brand(b.id, "offers"))) : open({ kind: "offer", draft: { brandId: b.id, serviceId: r.sid, segment: "All segments", status: "Ideation", ...prefill(col) } }))}
                        className="min-h-[46px] flex-1 border-l border-line text-[15px] font-semibold transition hover:brightness-95 disabled:cursor-default"
                        style={{ background: n ? hexA(b.primary, 0.1 + Math.min(n, 4) * 0.05) : "#FFFFFF", color: n ? readable(b.primary) : "#64716B" }}
                      >
                        {n ? n : canEdit ? "+" : "·"}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </Card>
          <p className="mb-0 mt-2.5 text-[14.5px] text-mute-3">
            {canEdit ? "A number is how many offers argue that way. A plus is a gap — click it to write one. Whichever view you pick becomes this brand’s default for you." : "A number is how many offers argue that way. A dot is a gap nobody has written yet."}
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {svcs.map((v) => {
          const so = live(ws.offersOfService(v.id));
          const segs = new Set(so.map((o) => o.segment));
          const missing = b.segments.filter((x) => x.name !== "All segments" && !segs.has(x.name)).map((x) => x.name);
          const hasGap = !segs.has("All segments") && missing.length > 0 && so.length > 0;
          const assets = live(ws.assetsOfService(v.id));
          return (
            <Link key={v.id} href={href.service(v.id)} className="flex flex-col gap-[13px] rounded-[14px] border border-line bg-white p-[22px] text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(16,22,20,.07)]">
              <span className="block"><span className="block text-[19px] font-semibold tracking-[-0.015em]">{v.name}</span><span className="mt-[3px] block text-[15px] text-mute-2">{v.short}</span></span>
              <span className="block text-[15px] leading-[1.55] text-ink-3 text-pretty">{v.description}</span>
              <span className="flex flex-wrap gap-[5px]">{[...segs].map((n) => <span key={n} className="rounded-[5px] px-2 py-0.5 text-[13px] font-semibold" style={{ background: hexA(ws.segColor(n, b.id), 0.13), color: readable(ws.segColor(n, b.id)) }}>{n}</span>)}</span>
              {hasGap && <span className="block text-[14px] text-warn-text">Nothing written for {missing.join(", ")}</span>}
              <Blocks blocks={blocksFor(assets)} />
              <span className="flex gap-3.5 border-t border-divider pt-3 text-[15px] text-[#566560]"><span>{plural(so.length, "offer")}</span><span>{plural(assets.length, "asset")}</span></span>
            </Link>
          );
        })}
      </div>
      <ArchExpander items={archivedOnly(all)} noun="service" onOpen={(v) => router.push(href.service(v.id))} />
      {!all.length && (
        <Empty title="No services yet" body="A service is a capability you sell. Offers hang off it, one per segment.">
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
    </Page>
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
  const newOffer = () => open({ kind: "offer", draft: { brandId: b.id, segment: seg !== "All" ? seg : "All segments", status: "Ideation" } });
  return (
    <Page>
      <PageHead eyebrow="Rooms" title="Offers" actions={ws.can("edit") && <Btn variant="primary" size="lg" onClick={newOffer}>+ New offer</Btn>} />
      <p className="mb-6 max-w-[56ch] text-[15px] text-[#566560] text-pretty">Each offer holds one piece of positioning and everything that supports it. Assets can sit in several at once.</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter offers" aria-label="Filter offers" className="field mb-3 max-w-[280px] text-[15px]" />
      <Pills className="mb-2.5" value={seg} onChange={setSeg} label="Segment" options={segsPresent.map((s) => ({ value: s, label: s, count: s === "All" ? live(all).length : live(all).filter((o) => o.segment === s).length }))} />
      <Pills className="mb-[26px]" value={stat} onChange={setStat} label="Status" options={["All", ...Object.keys(OFFER_STATUS)].map((s) => ({ value: s, label: s }))} />
      <div className="grid gap-4 md:grid-cols-2">{shown.map((o) => <OfferCard key={o.id} o={o} />)}</div>
      <ArchExpander items={archivedOnly(filtered)} noun="offer" onOpen={(o) => router.push(href.offer(o.id))} />
      {!shown.length && (
        <Empty title="No offers here" body={all.length === 0 ? "No offers in this building yet. An offer is a room — it holds the positioning and everything that supports it." : "Nothing matches those filters."}>
          {ws.can("edit") && <Btn variant="primary" size="lg" onClick={newOffer}>{all.length ? "Create an offer" : "Create the first offer"}</Btn>}
        </Empty>
      )}
    </Page>
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
  const newAsset = () => open({ kind: "asset", draft: { brandId: b.id, status: "Draft", offerIds: [] }, step: 0 });

  return (
    <Page>
      <PageHead eyebrow="Furniture" title="Assets" actions={ws.can("edit") && <Btn variant="primary" size="lg" onClick={newAsset}>+ Add asset</Btn>} />
      <p className="mb-[22px] text-[15px] text-[#566560]">{plural(liveCamp.length, "asset")} in this building. Each one exists once, however many offers point at it.</p>
      {unlinked.length > 0 && (
        <button type="button" onClick={() => { setUnlinkedOnly(!unlinkedOnly); setType("All"); setStat("All"); }} className="mb-[18px] block w-full text-left">
          <Warn>
            {unlinkedOnly ? <>Showing the {unlinked.length} not linked to any offer. <span className="font-semibold underline">Show everything</span></> : <>{unlinked.length} not linked to any offer — probably the fastest thing to fix in here. <span className="font-semibold underline">Show them</span></>}
          </Warn>
        </button>
      )}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name or tag" aria-label="Filter by name or tag" className="field mb-3 max-w-[280px] text-[15px]" />
      <Pills className="mb-2" value={type} onChange={setType} label="Type" options={types.map((s) => ({ value: s, label: s }))} />
      <Pills className="mb-[26px]" value={stat} onChange={setStat} label="Status" options={["All", ...Object.keys(ASSET_STATUS)].map((s) => ({ value: s, label: s }))} />
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4">{shown.map((a) => <AssetCard key={a.id} a={a} />)}</div>
      <ArchExpander items={archivedOnly(filtered)} noun="asset" onOpen={(a) => openAsset(a.id)} />
      {!shown.length && (
        <Empty title="Nothing to show" body={camp.length === 0 ? "Nothing in this building yet. Start with the thing you actually need — a landing page, an email, an ad." : "Nothing matches that search."}>
          {ws.can("edit") && <Btn variant="primary" size="lg" onClick={newAsset}>Add an asset</Btn>}
        </Empty>
      )}
    </Page>
  );
}

/* ================================================================ brand kit */

function Kit({ b }: { b: Brand }) {
  const { ws, open, toast } = useApp();
  const all = live(ws.assetsOf(b.id));
  const logos = all.filter((a) => a.type === "Logo");
  const fontAssets = all.filter((a) => a.type === "Font" || a.type === "Guidelines");
  const templates = all.filter((a) => a.isTemplate);
  const offers = live(ws.offersOf(b.id));
  const canEdit = ws.can("edit");

  return (
    <Page>
      <PageHead eyebrow="Foundation" title="Brand Kit" actions={canEdit && <Btn onClick={() => open({ kind: "kit", brandId: b.id })}>Edit kit</Btn>} />
      <p className="mb-[34px] max-w-[56ch] text-[15px] text-[#566560] text-pretty">Master files, not campaign work. Nothing in here is tied to an offer.</p>

      <H2 right={canEdit && <button type="button" onClick={() => open({ kind: "asset", draft: { brandId: b.id, type: "Logo", status: "Ready", offerIds: [] }, step: 3 })} className="text-[14.5px] text-mute-2 hover:text-ink">+ Add master file</button>}>Logos and typefaces</H2>
      <div className="mb-[38px] grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4">
        {logos.map((a) => <AssetCard key={a.id} a={a} variant="kit" />)}
        {fontAssets.map((a) => <AssetCard key={a.id} a={a} variant="font" />)}
        {!logos.length && !fontAssets.length && <div className="col-span-full rounded-[13px] border border-dashed border-line-strong p-6 text-center text-[15px] text-mute-2">No logo files yet.</div>}
      </div>

      <H2>Colours</H2>
      <div className="mb-[38px] grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4">
        {b.colours.map((c) => (
          <button key={c.name + c.hex} type="button" title="Copy hex" onClick={() => { void navigator.clipboard?.writeText(c.hex).catch(() => {}); toast(`${c.hex} copied`); }} className="flex flex-col overflow-hidden rounded-[13px] border border-line bg-white p-0 text-left hover:border-mute-2">
            <span className="flex h-24 items-end p-3 text-[14.5px] font-semibold tracking-[0.02em]" style={{ background: c.hex, color: onColor(c.hex) }}>{c.hex}</span>
            <span className="block px-3.5 py-[13px]"><span className="block text-[15px] font-semibold">{c.name}</span><span className="mt-[3px] block text-[14.5px] leading-[1.4] text-mute-2">{c.usage}</span></span>
          </button>
        ))}
        {!b.colours.length && <div className="col-span-full text-[15px] text-mute-3">No colours recorded.</div>}
      </div>

      <div className="mb-[38px] grid gap-6 md:grid-cols-2">
        <div>
          <H2>Fonts</H2>
          <Card className="rounded-[13px] px-[18px] py-1.5">
            {b.fonts.map((f) => (
              <div key={f.name + f.role} className="flex items-center gap-3 border-t border-divider py-[13px] first:border-t-0">
                <span className="flex-1"><span className="block text-[15px] font-semibold">{f.name}</span><span className="mt-0.5 block text-[14.5px] text-mute-2">{f.role}</span></span>
                <span className="text-[14px] text-[#64716B]">{f.files}</span>
              </div>
            ))}
            {!b.fonts.length && <div className="py-3 text-[15px] text-mute-3">No fonts recorded.</div>}
          </Card>
        </div>
        <div>
          <H2>Guidelines</H2>
          <Card className="rounded-[13px] px-[18px] py-1.5">
            {b.guidelines.map((g) => (
              <div key={g.name} className="flex items-center gap-3 border-t border-divider py-[13px] first:border-t-0">
                <span className="flex-1 truncate text-[15px] font-medium">{g.name}</span>
                <span className="flex-none text-[14px] text-[#64716B]">{g.size}</span>
              </div>
            ))}
            {!b.guidelines.length && <div className="py-3 text-[15px] text-mute-3">No guideline documents yet. Add a Guidelines master file above.</div>}
          </Card>
        </div>
      </div>

      <H2>Templates</H2>
      {templates.length ? (
        <div className="mb-[38px] grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4">
          {templates.map((a) => <TemplateCard key={a.id} id={a.id} name={a.name} short={a.short} />)}
        </div>
      ) : (
        <div className="mb-[38px] rounded-[13px] border border-dashed border-line-strong p-8 text-center text-[15px] text-mute-2">No templates saved for this brand yet.</div>
      )}

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
                <button type="button" onClick={() => open({ kind: "goalOffers", brandId: b.id, name: g.name })} className="flex-1 text-left text-[14px] font-medium hover:underline" style={{ color: n ? "#566560" : "#8A6A12" }}>{n ? plural(n, "offer") : "None yet"}</button>
                {canEdit && <button type="button" onClick={() => open({ kind: "goal", brandId: b.id, name: g.name, description: g.description, original: g.name })} className="text-[14px] text-mute-2 hover:text-ink">Edit</button>}
                {canEdit && b.goals.length > 1 && <button type="button" onClick={() => open({ kind: "mergeGoal", brandId: b.id, from: g.name })} className="text-[14px] text-mute-2 hover:text-ink">Merge</button>}
              </div>
            </Card>
          );
        })}
      </div>

      <h2 className="m-0 mb-[5px] text-[17px] font-semibold">Offer types</h2>
      <p className="mb-[13px] mt-0 max-w-[62ch] text-[15px] text-mute-2">What the offer physically is. An audit and a paid engagement can both chase the same goal.</p>
      <div className="mb-[38px] flex flex-wrap gap-2.5">
        {OFFER_TYPES.map((t) => {
          const n = offers.filter((o) => o.offerType === t).length;
          return (
            <div key={t} className="flex items-center gap-2.5 rounded-[11px] border border-line bg-white px-[15px] py-[11px]">
              <span className="text-[15px] font-semibold">{t}</span>
              <span className="text-[14px] font-medium" style={{ color: n ? "#566560" : "#8A6A12" }}>{n ? plural(n, "offer") : "None yet"}</span>
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

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="rounded-[13px] px-[22px] py-5">
          <h2 className="m-0 mb-[9px] text-[17px] font-semibold">Voice and tone</h2>
          <p className="m-0 text-[15px] leading-[1.6] text-ink-3 text-pretty">{b.voice || <span className="text-mute-4">Not written yet.</span>}</p>
        </Card>
        <Card className="rounded-[13px] px-[22px] py-5">
          <h2 className="m-0 mb-[9px] text-[17px] font-semibold">Boilerplate</h2>
          <p className="m-0 text-[15px] leading-[1.6] text-ink-3 text-pretty">{b.boilerplate || <span className="text-mute-4">Not written yet.</span>}</p>
        </Card>
      </div>
    </Page>
  );
}

function TemplateCard({ id, name, short }: { id: string; name: string; short: string }) {
  const { openAsset } = useApp();
  return (
    <button type="button" onClick={() => openAsset(id)} className="flex flex-col rounded-[13px] border border-dashed border-line-strong bg-white p-4 text-left hover:border-mute-2">
      <span className="mb-[9px] block font-mono text-[12px] font-bold tracking-[0.11em] text-mute-4">TEMPLATE</span>
      <span className="block text-[15px] font-semibold leading-[1.35]">{name}</span>
      <span className="mt-1 block text-[14.5px] text-mute-2">{short}</span>
    </button>
  );
}

/* ================================================================ CTAs */

function Ctas({ b }: { b: Brand }) {
  const { ws, open } = useApp();
  const ctas = ws.ctasOf(b.id);
  const newCta = () => open({ kind: "cta", draft: { brandId: b.id, bg: b.primary, fg: onColor(b.primary), style: "solid" } });
  return (
    <Page>
      <PageHead eyebrow="Doorhandles" title="CTA Library" actions={ws.can("edit") && <Btn variant="primary" size="lg" onClick={newCta}>+ New CTA</Btn>} />
      <p className="mb-7 max-w-[56ch] text-[15px] text-[#566560] text-pretty">Written once, used everywhere. These render in their real colours so you can see what a reader sees.</p>
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
                <div className="text-[14px] font-medium" style={{ color: used.length ? "#566560" : "#8A6A12" }}>{used.length ? `Used in ${plural(used.length, "place")}` : "Not used yet"}</div>
                {used.length > 0 && <div className="mt-0.5 text-[14px] text-[#64716B]">{used.slice(0, 3).join(" · ")}{used.length > 3 ? ` · +${used.length - 3} more` : ""}</div>}
              </div>
              <div className="flex gap-[7px] border-t border-divider pt-3">
                {ws.can("edit") && <Btn size="sm" onClick={() => open({ kind: "cta", draft: c })}>Edit</Btn>}
                {ws.can("del") && <Btn size="sm" variant="danger" onClick={() => open({ kind: "confirm", item: "cta", id: c.id, label: c.text })}>Delete</Btn>}
                <span className="flex-1" />
                <span className="self-center text-[13.5px] text-[#64716B]">{c.style}</span>
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
    </Page>
  );
}
