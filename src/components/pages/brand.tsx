"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStored } from "@/lib/stored";
import type { Brand } from "@/db/schema";
import {
  Archive, ArchiveRestore, Building2, ChevronRight, Download, FilePlus2, FolderOpen, Layers, Library, Megaphone, Palette, Pencil, Trash2,
  type LucideIcon,
} from "lucide-react";
import { hexA, readable, onColor } from "@/lib/color";
import { ASSET_STATUS, ASSET_TYPES, OFFER_STATUS, OFFER_TYPES } from "@/lib/constants";
import { href, type BrandTab } from "@/lib/routes";
import { archivedOnly, live, plural } from "@/lib/ws";
import { setArchived } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { AssetCard, OfferCard, blocksFor } from "@/components/cards";
import { BulkBar, SelectToggle, canBulk, useSelection } from "@/components/bulk";
import { CtaButton } from "@/components/drawer/asset-drawer";
import { ArchExpander, ArchivedNote, Blocks, Btn, Card, H2, Mark, Page, Pills, SectionHead, Warn, cx } from "@/components/ui";
import { EmptyArt, FOCUS, IconTile, LIFT } from "@/components/polish";
import { SpotArt } from "@/components/art";
import { NotHere, useVisit } from "./common";
import { BrandHealth } from "@/components/health";
import { BrandKit } from "./kit";

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
  // second row of tabs here. Home gets the full welcome; every other section
  // gets one line saying which brand you are in.
  return (
    <Page>
      {tab === "home" ? <BrandHero b={b} /> : <BrandLine b={b} />}
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

/** The brand's welcome, on its Home only. It shows the brand's own colours even with the theme takeover off. */
function BrandHero({ b }: { b: Brand }) {
  const { ws } = useApp();
  const parent = ws.brand(b.parentId);
  const client = ws.client(b.clientId);
  return (
    <div className="head-band -mt-8 mb-7 pb-8 pt-9 text-center sm:-mt-10 sm:pt-10">
      {/* Full-bleed brand tint and colour strip, painted over the band's white. */}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -z-[1] w-[200vw] -translate-x-1/2" style={{ background: `linear-gradient(180deg, ${hexA(b.primary, 0.1)}, ${hexA(b.secondary, 0.04)} 70%, rgba(255,255,255,0))` }} />
      <span aria-hidden className="pointer-events-none absolute left-1/2 top-0 -z-[1] h-[3px] w-[200vw] -translate-x-1/2" style={{ background: `linear-gradient(90deg, ${b.primary}, ${b.secondary})` }} />
      <Mark mark={b.mark} color={b.primary} size={64} radius={16} className="mx-auto mb-4 text-[21px] shadow-[0_8px_20px_-10px_rgba(15,23,42,.5)]" />
      <h1 className="m-0 text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[32px]">Welcome to {b.name}</h1>
      {b.tagline && <p className="mx-auto mb-0 mt-2 max-w-[56ch] text-[16px] text-mute-2 text-pretty">{b.tagline}</p>}
      <p className="m-0 mt-2 flex flex-wrap items-center justify-center gap-x-2 text-[14px] text-mute-3">
        {client && <Link href={href.client(client.id)} className="inline-flex items-center gap-1.5 hover:text-ink hover:underline"><Building2 aria-hidden size={14} />{client.name}</Link>}
        {parent && <><span aria-hidden>·</span><span>Sub-brand of <Link href={href.brand(parent.id)} className="font-medium hover:text-ink hover:underline">{parent.name}</Link></span></>}
        {b.archived && <><span aria-hidden>·</span><span className="font-semibold">Archived</span></>}
      </p>
    </div>
  );
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
  const subs = live(ws.subBrands(b.id));
  const canEdit = ws.can("edit");

  // Everyone who can open this brand, the same rule the server uses.
  const team = ws.d.users.filter((u) => u.allClients || u.clientIds.includes(b.clientId) || u.brandIds.includes(b.id) || (b.parentId && u.brandIds.includes(b.parentId))
    || u.groupIds.some((g) => ws.group(g)?.clientIds.includes(b.clientId) || ws.group(g)?.brandIds.includes(b.id))).length;
  const stats = [
    { label: "Offers", value: offers.length, to: href.brand(b.id, "offers") },
    { label: "Services", value: services.length, to: href.brand(b.id, "services") },
    { label: "Assets", value: camp.length, to: href.brand(b.id, "assets") },
    { label: "CTAs", value: ctas.length, to: `${href.brand(b.id, "kit")}#kit-ctas` },
    { label: "Templates", value: templates.length, to: `${href.brand(b.id, "kit")}#kit-files` },
    { label: "Team", value: team, to: null },
  ];

  const typeMap = new Map<string, typeof camp>();
  camp.forEach((a) => typeMap.set(a.type, [...(typeMap.get(a.type) ?? []), a]));
  const byType = [...typeMap.entries()].sort((x, y) => y[1].length - x[1].length);
  const rc = { Approved: 0, "In review": 0, "Changes requested": 0, None: 0 };
  camp.forEach((a) => { rc[a.review] += 1; });
  const recent = [...camp].sort((x, y) => +new Date(y.updatedAt) - +new Date(x.updatedAt)).slice(0, 4);

  const actions = [
    canEdit && { label: "Create an offer", sub: "Positioning first, assets after", icon: Megaphone, go: () => open({ kind: "offer", draft: { brandId: b.id, segment: "All segments", status: "Ideation" } }) },
    canEdit && { label: "Add an asset", sub: "Landing page, email, ad, document", icon: FilePlus2, go: () => open({ kind: "asset", draft: { brandId: b.id, status: "Draft", offerIds: [] }, step: 0 }) },
    { label: "View the Brand Kit", sub: "Logos, colours, fonts, guidelines", icon: Palette, go: () => router.push(href.brand(b.id, "kit")) },
    { label: "Browse the library", sub: "Everything reusable in this brand", icon: Library, go: () => router.push(href.brand(b.id, "assets")) },
  ].filter(Boolean) as { label: string; sub: string; icon: LucideIcon; go: () => void }[];

  return (
    <div className="animate-fade">
      {/* One strip, as in the prototype: the numbers are the way in. */}
      <Card className="mb-5 grid grid-cols-3 overflow-hidden sm:grid-cols-6">
        {stats.map((st) => {
          const body = (
            <>
              <span className="block text-[24px] font-semibold leading-[1.1] tabular-nums tracking-[-0.02em] text-ink">{st.value}</span>
              <span className="mt-1 block text-[13.5px] font-medium text-mute-3">{st.label}</span>
            </>
          );
          const cls = "block border-b border-r border-divider px-4 py-4 text-center [&:nth-child(3n)]:border-r-0 sm:border-b-0 sm:[&:nth-child(3n)]:border-r sm:last:border-r-0";
          return st.to
            ? <Link key={st.label} href={st.to} className={cx(cls, "transition-colors hover:bg-wash", FOCUS)}>{body}</Link>
            : <div key={st.label} className={cls} title="People who can open this brand">{body}</div>;
        })}
      </Card>

      <div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map((q) => (
            <button key={q.label} type="button" onClick={q.go} className={cx("flex items-start gap-3 rounded-xl border border-line bg-white p-4 text-left", LIFT, FOCUS)}>
              <IconTile icon={q.icon} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15.5px] font-semibold text-ink">{q.label}</span>
                <span className="mt-0.5 block text-[14.5px] leading-[1.45] text-mute-2">{q.sub}</span>
              </span>
            </button>
          ))}
        </div>
        {b.archived && <ArchivedNote className="mt-[22px]">Archived. Everything inside is untouched and comes back exactly as it was.</ArchivedNote>}
        {b.description && <p className="m-0 mt-[34px] max-w-[64ch] text-[15px] leading-[1.6] text-ink-3 text-pretty">{b.description}</p>}

        {(subs.length > 0 || (ws.can("structure") && !b.parentId)) && (
          <div className="mt-10">
            <H2 right={ws.can("structure") && !b.parentId && <button type="button" onClick={() => open({ kind: "brand", draft: { clientId: b.clientId, parentId: b.id } })} className="text-[14.5px] text-mute-2 hover:text-ink">+ Add sub-brand</button>}>Sub-brands</H2>
            {subs.length > 0 ? (
              <div className="grid gap-3.5 md:grid-cols-2">
                {subs.map((sb) => (
                  <Link key={sb.id} href={href.brand(sb.id)} className={cx("flex items-center gap-3.5 rounded-[13px] border border-line p-[18px] text-left", LIFT, FOCUS)} style={{ background: `linear-gradient(100deg, ${hexA(sb.primary, 0.1)}, ${hexA(sb.secondary, 0.05)} 60%, #FFFFFF)` }}>
                    <Mark mark={sb.mark} color={sb.primary} size={38} radius={9} />
                    <span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold">{sb.name}</span><span className="mt-0.5 block text-[14px] text-mute-1">{sb.tagline}</span></span>
                    <span className="flex-none text-[14.5px] text-mute-2">{plural(live(ws.assetsOf(sb.id)).length, "asset")}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-[12px] border border-dashed border-line-strong px-5 py-4 text-[15px] text-mute-3">No sub-brands. Add one when part of this brand needs its own identity.</div>
            )}
          </div>
        )}

        {camp.length > 0 && (
          <div className="mt-10">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <div>
                <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em]">Everything in this brand</h2>
                <p className="m-0 mt-1 text-[14.5px] text-mute-3">One square per asset, coloured by where it stands. Hover any square to name it.</p>
              </div>
              <span className="text-[14.5px] font-medium text-mute-2">{plural(camp.length, "asset")} in this brand</span>
            </div>
            <Card className="overflow-hidden">
              {byType.map(([type, list]) => (
                <Link key={type} href={`${href.brand(b.id, "assets")}?type=${encodeURIComponent(type)}`} className="group flex w-full items-center gap-4 border-t border-divider px-5 py-3 text-left transition-colors first:border-t-0 hover:bg-wash focus-visible:bg-wash">
                  <span className="w-[110px] flex-none text-[15px] font-semibold sm:w-[140px]">{type}</span>
                  <span className="w-8 flex-none rounded-full bg-chip py-px text-center text-[13px] font-semibold tabular-nums text-mute-2">{list.length}</span>
                  <span className="min-w-0 flex-1"><Blocks blocks={blocksFor(list, 60)} size={14} gap={4} /></span>
                  <ChevronRight aria-hidden size={16} className="flex-none text-mute-4 transition group-hover:translate-x-0.5 group-hover:text-ink" />
                </Link>
              ))}
              <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line bg-wash-2 px-5 py-3">
                {[["Approved", rc.Approved, "#2F8F62"], ["In review", rc["In review"], "#C99A2E"], ["Changes requested", rc["Changes requested"], "#C2410C"], ["Not reviewed", rc.None, "#CBD5E1"]].map(([l, n, c]) => (
                  <span key={l as string} className="flex items-center gap-[7px] text-[14px] text-mute-2">
                    <span aria-hidden className="h-[11px] w-[11px] rounded-[3px]" style={{ background: c as string }} />{l}
                    <span className="font-semibold tabular-nums text-ink">{n}</span>
                  </span>
                ))}
              </div>
            </Card>
          </div>
        )}

        <BrandHealth b={b} />

        <div className="mt-10">
          <H2>Recently updated</H2>
          {recent.length > 0 ? (
            <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
              {recent.map((a) => <AssetCard key={a.id} a={a} variant="recent" />)}
            </div>
          ) : (
            <EmptyArt art={<SpotArt kind="rocket" />} title="This brand is empty" body="Start with the thing you actually need, not with a database record.">
              {canEdit && <Btn variant="primary" size="lg" onClick={() => open({ kind: "asset", draft: { brandId: b.id, status: "Draft", offerIds: [] }, step: 0 })}>Add the first asset</Btn>}
            </EmptyArt>
          )}
        </div>

        <div className="mt-11 flex flex-wrap items-center gap-2.5 border-t border-line pt-5">
          {ws.can("structure") && <Btn onClick={() => open({ kind: "brand", draft: b })}><Pencil aria-hidden size={16} />Edit brand identity</Btn>}
          {/* BrandOS is internal: the kit leaves as a PDF, not as a client login or link. */}
          <a href={`/guidelines/${b.id}`} target="_blank" rel="noreferrer" className={cx("inline-flex items-center gap-1.5 rounded-[8px] border border-line bg-white px-[13px] py-[7px] text-[15px] font-medium text-ink-3 hover:border-line-strong hover:bg-wash", FOCUS)}><Download aria-hidden size={16} />Export brand kit</a>
          {/* Archiving or deleting a whole brand is for admins only. */}
          {ws.can("del") && <Btn onClick={() => run(setArchived, "brand", b.id, !b.archived)}>{b.archived ? <ArchiveRestore aria-hidden size={16} /> : <Archive aria-hidden size={16} />}{b.archived ? "Restore brand" : "Archive brand"}</Btn>}
          {ws.can("del") && <Btn variant="danger" onClick={() => open({ kind: "confirm", item: "brand", id: b.id, label: b.name, back: href.client(b.clientId) })}><Trash2 aria-hidden size={16} />Delete brand</Btn>}
          <span className="flex-1" />
          {ws.can("del") && <span className="text-[14px] text-mute-3 md:max-w-[52ch]">Archiving hides a brand and everything in it. Nothing inside changes, and restoring brings it all back as it was.</span>}
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
    <>
      <SectionHead eyebrow="What the brand sells" title="Services" actions={canEdit && <Btn variant="primary" size="lg" onClick={() => open({ kind: "service", draft: { brandId: b.id } })}>+ New service</Btn>}
        sub={<>A service is what you sell. An offer is that service argued at one segment. Keeping them apart is what makes a missing version visible.</>}
      />

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
                        style={{ background: n ? hexA(b.primary, 0.1 + Math.min(n, 4) * 0.05) : "#FFFFFF", color: n ? readable(b.primary) : "#526077" }}
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
            <Link key={v.id} href={href.service(v.id)} className={cx("flex flex-col gap-[13px] rounded-[14px] border border-line bg-white p-[22px] text-left shadow-[0_1px_2px_rgba(15,23,42,.04)]", LIFT, FOCUS)}>
              <span className="flex items-start gap-3.5">
                <IconTile icon={Layers} color={b.primary} size={40} />
                <span className="min-w-0 flex-1"><span className="block text-[19px] font-semibold leading-[1.25] tracking-[-0.015em] text-ink">{v.name}</span>{v.short && <span className="mt-[3px] block text-[15px] text-mute-2">{v.short}</span>}</span>
              </span>
              <span className="block text-[15px] leading-[1.55] text-ink-3 text-pretty">{v.description}</span>
              <span className="flex flex-wrap gap-[5px]">{[...segs].map((n) => <span key={n} className="rounded-[5px] px-2 py-0.5 text-[13px] font-semibold" style={{ background: hexA(ws.segColor(n, b.id), 0.13), color: readable(ws.segColor(n, b.id)) }}>{n}</span>)}</span>
              {hasGap && <span className="block text-[14px] text-warn-text">Nothing written for {missing.join(", ")}</span>}
              <Blocks blocks={blocksFor(assets)} />
              <span className="mt-auto flex gap-4 border-t border-divider pt-3 text-[14.5px] text-mute-2">
                <span className="inline-flex items-center gap-1.5"><Megaphone aria-hidden size={15} className="text-mute-4" />{plural(so.length, "offer")}</span>
                <span className="inline-flex items-center gap-1.5"><FolderOpen aria-hidden size={15} className="text-mute-4" />{plural(assets.length, "asset")}</span>
              </span>
            </Link>
          );
        })}
      </div>
      <ArchExpander items={archivedOnly(all)} noun="service" onOpen={(v) => router.push(href.service(v.id))} />
      {!all.length && (
        <EmptyArt art={<SpotArt kind="kit" />} title="No services yet" body="A service is a capability you sell. Offers hang off it, one per segment.">
          {canEdit && <Btn variant="primary" size="lg" onClick={() => open({ kind: "service", draft: { brandId: b.id } })}>Create the first service</Btn>}
        </EmptyArt>
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
        <EmptyArt art={<SpotArt kind={all.length === 0 ? "offer" : "search"} />} title="No offers here" body={all.length === 0 ? "No offers yet. An offer is a campaign or package — it holds the positioning and every asset that supports it." : "Nothing matches those filters."}>
          {ws.can("edit") && <Btn variant="primary" size="lg" onClick={newOffer}>{all.length ? "Create an offer" : "Create the first offer"}</Btn>}
        </EmptyArt>
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
        <EmptyArt art={<SpotArt kind={camp.length === 0 ? "folder" : "search"} />} title="Nothing to show" body={camp.length === 0 ? "No assets yet. Start with the thing you actually need — a landing page, an email, an ad." : "Nothing matches that search."}>
          {ws.can("edit") && <Btn variant="primary" size="lg" onClick={newAsset}>Add an asset</Btn>}
        </EmptyArt>
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
        sub={<>Goals, segments and offer types. Offers are tagged with these, so gaps show up in the grid on the Services tab.</>}
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
                <button type="button" onClick={() => open({ kind: "goalOffers", brandId: b.id, name: g.name })} className="flex-1 text-left text-[14px] font-medium hover:underline" style={{ color: n ? "#475569" : "#8A6A12" }}>{n ? plural(n, "offer") : "None yet"}</button>
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
              <span className="text-[14px] font-medium" style={{ color: n ? "#475569" : "#8A6A12" }}>{n ? plural(n, "offer") : "None yet"}</span>
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
                <div className="text-[14px] font-medium" style={{ color: used.length ? "#475569" : "#8A6A12" }}>{used.length ? `Used in ${plural(used.length, "place")}` : "Not used yet"}</div>
                {used.length > 0 && <div className="mt-0.5 text-[14px] text-[#526077]">{used.slice(0, 3).join(" · ")}{used.length > 3 ? ` · +${used.length - 3} more` : ""}</div>}
              </div>
              <div className="flex gap-[7px] border-t border-divider pt-3">
                {ws.canChange({ ownerId: null }) && <Btn size="sm" onClick={() => open({ kind: "cta", draft: c })}>Edit</Btn>}
                {ws.can("del") && <Btn size="sm" variant="danger" onClick={() => open({ kind: "confirm", item: "cta", id: c.id, label: c.text })}>Delete</Btn>}
                <span className="flex-1" />
                <span className="self-center text-[13.5px] text-[#526077]">{c.style}</span>
              </div>
            </Card>
          );
        })}
      </div>
      {!ctas.length && (
        <EmptyArt art={<SpotArt kind="inbox" />} title="No CTAs yet" body="Write the button once and reuse it across every offer and asset.">
          {ws.can("edit") && <Btn variant="primary" size="lg" onClick={newCta}>Create a CTA</Btn>}
        </EmptyArt>
      )}
    </>
  );
}
