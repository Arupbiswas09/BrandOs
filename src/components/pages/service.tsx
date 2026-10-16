"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { Asset, Offer } from "@/db/schema";
import { Archive, ArchiveRestore, Download, ExternalLink, Plus } from "lucide-react";
import { ASSET_STATUS, REVIEW_COLOR, roleOf } from "@/lib/constants";
import { assetGet } from "@/lib/asset-download";
import { fmtDateTime } from "@/lib/format";
import { href } from "@/lib/routes";
import { plural, type FunnelGroup } from "@/lib/ws";
import { setArchived } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { OfferCard } from "@/components/cards";
import { ArchivedNote, Btn, Chip, Empty, Page, Pills, cx } from "@/components/ui";
import { EntityHeader, FOCUS } from "@/components/polish";
import { NotHere, useVisit } from "./common";

/* ---------------------------------------------------------------- where things stand */

/** One dot and one word for where something stands: a pending review first, then its stage. */
type Stand = { word: string; color: string };

const LIVE = ASSET_STATUS.Live;
const DRAFT = ASSET_STATUS.Draft;

function assetStand(a: Asset): Stand {
  if (a.review === "Changes requested" || a.review === "In review") return { word: a.review, color: REVIEW_COLOR[a.review] };
  if (a.status === "Live" || a.status === "Ready") return { word: a.status, color: LIVE };
  return { word: a.status, color: DRAFT };
}

function offerStand(o: Offer): Stand {
  if (o.review === "Changes requested" || o.review === "In review") return { word: o.review, color: REVIEW_COLOR[o.review] };
  return o.status === "Active" ? { word: "Active", color: LIVE } : { word: o.status, color: DRAFT };
}

const LEGEND: Stand[] = [
  { word: "Live or ready", color: LIVE },
  { word: "Draft", color: DRAFT },
  { word: "In review", color: REVIEW_COLOR["In review"] },
  { word: "Changes requested", color: REVIEW_COLOR["Changes requested"] },
];

function Dot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cx("inline-block h-[7px] w-[7px] flex-none rounded-full", className)} style={{ background: color }} />;
}

/** The asset kinds the list can narrow to. Anything that is not one of the first four counts as proof or a resource. */
type Kind = "all" | "lp" | "mag" | "auto" | "traffic" | "proof";
const KINDS: { key: Exclude<Kind, "all">; label: string }[] = [
  { key: "lp", label: "Landing pages" },
  { key: "mag", label: "Lead magnets" },
  { key: "auto", label: "Automations" },
  { key: "traffic", label: "Traffic" },
  { key: "proof", label: "Proof & resources" },
];
function kindOf(a: Asset): Exclude<Kind, "all"> {
  if (a.type === "Landing page") return "lp";
  if (a.type === "Lead magnet") return "mag";
  const role = roleOf(a.type);
  return role === "automation" ? "auto" : role === "traffic" ? "traffic" : "proof";
}

type Section = "offers" | "assets" | "funnels";
const sectionId = (s: Section) => `service-${s}`;

/* ---------------------------------------------------------------- page */

export function ServicePage({ id }: { id: string }) {
  const { ws, open } = useApp();
  const [run] = useAction();
  const [kind, setKind] = useState<Kind>("all");
  const v = ws.service(id);
  useVisit("service", id, !!v);
  if (!v) return <NotHere what="service" />;
  const b = ws.brand(v.brandId);
  const offers = ws.serviceOffers(v.brandId, v.id);
  const archivedOffers = ws.offersOfService(v.id).filter((o) => o.archived);
  const assets = ws.assetsOfOffers(offers);
  const stats = ws.serviceStats(v.brandId, v.id);
  const canEdit = ws.canChange(v);
  const newOffer = (segment = "All segments") => open({ kind: "offer", draft: { brandId: v.brandId, serviceId: v.id, segment, status: "Ideation" } });

  // The filter row only shows when there are two kinds to choose between, so a tile only narrows the list when it can be undone.
  const present = KINDS.filter((k) => assets.some((a) => kindOf(a) === k.key));
  const filterable = present.length > 1;
  const go = (to: Section, k: Kind = "all") => {
    if (to === "assets") setKind(filterable && present.some((p) => p.key === k) ? k : "all");
    const el = document.getElementById(sectionId(to));
    if (!el) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    el.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  };

  const tiles: { label: string; n: number; to: Section; kind?: Kind }[] = [
    { label: "Offers", n: stats.offers, to: "offers" },
    { label: "Lead magnets", n: stats.leadMagnets, to: "assets", kind: "mag" },
    { label: "Landing pages", n: stats.landingPages, to: "assets", kind: "lp" },
    { label: "Funnels", n: stats.funnels, to: "funnels" },
    { label: "Automations", n: stats.automations, to: "assets", kind: "auto" },
  ];

  return (
    <Page>
      <EntityHeader
        eyebrow={<>Service{b ? <> · <Link href={href.brand(b.id, "services")} className="hover:text-ink hover:underline">{b.name}</Link></> : null}</>}
        title={v.name}
        sub={v.short}
        actions={canEdit && (
          <>
            <Btn onClick={() => open({ kind: "service", draft: v })}>Edit</Btn>
            <Btn variant="primary" onClick={() => newOffer()}><Plus aria-hidden size={16} />New offer</Btn>
          </>
        )}
      >
        {v.description && <p className="m-0 max-w-[64ch] pb-8 pt-4 text-lead leading-[1.6] text-ink-3 text-pretty">{v.description}</p>}
      </EntityHeader>
      {v.archived && <ArchivedNote className="mb-6">Archived. Its offers still exist and are reachable from the offers tab.</ArchivedNote>}

      {offers.length === 0 ? (
        <Empty title="No offers for this service yet" body="An offer is this service argued at one segment.">
          {canEdit && <Btn variant="primary" size="lg" onClick={() => newOffer()}>Write the first offer</Btn>}
        </Empty>
      ) : (
        <>
          {/* What this service holds, counted once; each number is the way into its section. */}
          <div className="grid grid-cols-6 gap-2.5 sm:grid-cols-5 sm:gap-3">
            {tiles.map((t, i) => (
              <button
                key={t.label}
                type="button"
                onClick={() => go(t.to, t.kind)}
                className={cx(
                  // Phones: three across, then two wider ones, so no row is left half empty.
                  "flex flex-col items-start rounded-xl border px-3.5 py-3 text-left transition-colors sm:col-span-1 sm:px-4 sm:py-3.5",
                  i < 3 ? "col-span-2" : "col-span-3",
                  t.n ? "border-line bg-surface hover:border-line-strong" : "border-line bg-transparent hover:bg-surface",
                  FOCUS,
                )}
              >
                <span className={cx("block text-heading font-semibold leading-none tabular-nums tracking-[-0.02em]", t.n ? "text-ink" : "text-[#7D8B85]")}>{t.n}</span>
                <span className="mt-1.5 block text-meta leading-[1.3] text-mute-3">{t.label}</span>
              </button>
            ))}
          </div>
          <p className="m-0 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-meta text-mute-3">
            <span>{plural(stats.assets, "asset")} linked across {plural(stats.offers, "offer")}</span>
            {stats.updatedAt && (
              <span>
                Updated <time dateTime={stats.updatedAt.toISOString()} title={fmtDateTime(stats.updatedAt)} suppressHydrationWarning>{ws.ago(stats.updatedAt)}</time>
                {stats.updatedBy && <> by {ws.first(stats.updatedBy)}</>}
              </span>
            )}
          </p>

          <AllAssets assets={assets} offers={offers} kind={kind} setKind={setKind} present={present} />
          <Funnels groups={ws.funnelGroups(offers)} />
          <OffersBySegment offers={offers} brandId={v.brandId} canEdit={canEdit} newOffer={newOffer} />
        </>
      )}

      {archivedOffers.length > 0 && (
        <p className="mb-0 mt-6 text-body text-mute-3">
          {plural(archivedOffers.length, "archived offer")} hidden. Find {archivedOffers.length === 1 ? "it" : "them"} under <Link className="underline hover:text-ink" href={href.brand(v.brandId, "offers")}>Offers</Link>.
        </p>
      )}

      {/* Services are never deleted; archiving puts one out of sight and keeps its offers. */}
      {ws.can("archive") && (
        <div className="mt-14 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-5">
          <Btn onClick={() => run(setArchived, "service", v.id, !v.archived)}>{v.archived ? <ArchiveRestore aria-hidden size={16} /> : <Archive aria-hidden size={16} />}{v.archived ? "Restore service" : "Archive service"}</Btn>
          <span className="text-meta text-mute-3">Archiving hides the service. Its offers stay where they are.</span>
        </div>
      )}
    </Page>
  );
}

/** A section with a heading the count tiles can scroll to and focus. */
function Block({ id, title, sub, children }: { id: Section; title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section id={sectionId(id)} aria-labelledby={`${sectionId(id)}-h`} className="mt-14 scroll-mt-24">
      <div className="mb-4">
        <h2 id={`${sectionId(id)}-h`} tabIndex={-1} className="m-0 rounded-sm text-title font-semibold tracking-[-0.015em] text-ink">{title}</h2>
        {sub && <p className="m-0 mt-1 text-body text-mute-3 text-pretty">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- all assets */

function AllAssets({ assets, offers, kind, setKind, present }: {
  assets: Asset[]; offers: Offer[]; kind: Kind; setKind: (k: Kind) => void; present: typeof KINDS;
}) {
  const { ws, openAsset } = useApp();
  const mine = new Set(offers.map((o) => o.id));
  const shown = kind === "all" ? assets : assets.filter((a) => kindOf(a) === kind);
  return (
    <Block id="assets" title="All assets" sub="Everything linked to this service's offers, in one place to open or download.">
      {present.length > 1 && (
        <Pills
          className="mb-3.5"
          label="Show assets"
          value={kind}
          onChange={setKind}
          options={[{ value: "all" as Kind, label: "All", count: assets.length }, ...present.map((k) => ({ value: k.key as Kind, label: k.label, count: assets.filter((a) => kindOf(a) === k.key).length }))]}
        />
      )}
      {shown.length ? (
        <ul className="m-0 list-none overflow-hidden rounded-xl border border-line bg-surface p-0">
          {shown.map((a) => {
            const st = assetStand(a);
            const serves = ws.linkedOffers(a.id).filter((o) => mine.has(o.id));
            const servesText = serves.length ? `${serves[0].name}${serves.length > 1 ? ` and ${serves.length - 1} more` : ""}` : "";
            const get = assetGet(a);
            return (
              <li key={a.id} className="flex items-center border-t border-divider transition-colors first:border-t-0 hover:bg-wash">
                <button type="button" onClick={() => openAsset(a.id)} className="focus-inset flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left sm:gap-4 sm:pl-5">
                  <span className="w-11 flex-none font-mono text-micro font-semibold tracking-[0.06em] text-mute-3 sm:w-12">{ws.codeOf(a)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-ink" title={a.name}>{a.name}</span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-meta text-mute-3">
                      <span className="flex flex-none items-center gap-1.5 sm:hidden"><Dot color={st.color} />{st.word}{servesText && <span aria-hidden>·</span>}</span>
                      {servesText && <span className="truncate">For {servesText}</span>}
                    </span>
                  </span>
                  <span className="hidden w-[150px] flex-none items-center gap-2 text-meta text-mute-2 sm:flex"><Dot color={st.color} />{st.word}</span>
                </button>
                <span className="flex flex-none justify-end pr-3 sm:w-[136px] sm:pr-5">
                  {get ? (
                    <a
                      href={get.href}
                      title={get.title}
                      aria-label={get.kind === "link" ? `Open link to ${a.name}` : get.kind === "zip" ? `Download all of ${a.name}` : `Download ${a.name}`}
                      {...(get.kind === "link" ? { target: "_blank", rel: "noreferrer" } : { download: "" })}
                      className={cx("inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 text-meta font-medium text-ink-3 transition-colors hover:border-accent hover:text-accent sm:px-2.5", FOCUS)}
                    >
                      {get.kind === "link" ? <ExternalLink aria-hidden size={15} /> : <Download aria-hidden size={15} />}
                      <span className="hidden sm:inline">{get.kind === "link" ? "Open link" : get.kind === "zip" ? "Download all" : "Download"}</span>
                    </a>
                  ) : (
                    <span className="text-right text-small text-mute-4"><span className="sr-only sm:not-sr-only">No files yet</span></span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 rounded-xl border border-dashed border-line-strong px-5 py-4 text-body text-mute-3">
          {assets.length ? "Nothing of that kind here." : "No assets linked yet. Link them from an offer and they show up here."}
        </p>
      )}
    </Block>
  );
}

/* ---------------------------------------------------------------- funnels */

function Funnels({ groups }: { groups: FunnelGroup[] }) {
  return (
    <Block id="funnels" title="Funnels" sub="Grouped by the landing page or lead magnet people arrive on.">
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {groups.map((g) => <FunnelRow key={g.entry?.id ?? "none"} g={g} />)}
      </ul>
      <p className="m-0 mt-3.5 flex flex-wrap gap-x-5 gap-y-1.5 text-meta text-mute-3">
        <span className="sr-only">Dot colours: </span>
        {LEGEND.map((l) => <span key={l.word} className="inline-flex items-center gap-1.5"><Dot color={l.color} />{l.word}</span>)}
      </p>
    </Block>
  );
}

function Col({ label, children, empty }: { label: string; children?: ReactNode; empty: boolean }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow mb-2.5 text-micro">{label}</div>
      {empty ? <span className="text-meta text-mute-4">None linked</span> : children}
    </div>
  );
}

function FunnelRow({ g }: { g: FunnelGroup }) {
  const { ws, openAsset } = useApp();
  const e = g.entry;
  const est = e ? assetStand(e) : null;
  const assetLine = (a: Asset) => {
    const st = assetStand(a);
    return (
      <li key={a.id} className="flex min-w-0 items-center gap-2">
        <Dot color={st.color} />
        <button type="button" onClick={() => openAsset(a.id)} title={a.name} className="min-w-0 truncate rounded-sm text-left text-body text-ink hover:underline">{a.name}</button>
        <span className="sr-only">{st.word}</span>
      </li>
    );
  };
  return (
    <li className={cx("grid gap-x-8 gap-y-5 rounded-xl border p-5 sm:grid-cols-2 xl:grid-cols-[1fr_1.05fr_0.85fr_1.2fr]", e ? "border-line bg-surface" : "border-[rgba(201,154,46,.4)] bg-[#FCF8EE]")}>
      <Col label="Entry" empty={false}>
        {e && est ? (
          <>
            <span className="flex min-w-0 items-start gap-2">
              <span className="mt-0.5 flex-none rounded-sm bg-chip px-1.5 py-0.5 font-mono text-micro font-semibold tracking-[0.06em] text-mute-1">{ws.codeOf(e)}</span>
              <button type="button" onClick={() => openAsset(e.id)} className="min-w-0 rounded-sm text-left text-body font-semibold leading-[1.35] text-ink hover:underline">{e.name}</button>
            </span>
            <span className="mt-1.5 flex items-center gap-1.5 text-meta text-mute-3"><Dot color={est.color} />{est.word}</span>
          </>
        ) : (
          <>
            <span className="block text-body font-semibold text-warn-text">No entry point</span>
            <span className="mt-1 block max-w-[34ch] text-meta leading-[1.45] text-mute-2">These offers have no landing page or lead magnet linked.</span>
          </>
        )}
      </Col>
      <Col label="Offers" empty={!g.offers.length}>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {g.offers.map((o) => {
            const st = offerStand(o);
            const mapped = (o.funnel?.boxes?.length ?? 0) > 0;
            return (
              <li key={o.id} className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <Dot color={st.color} />
                  <Link href={href.offer(o.id)} title={o.name} className="min-w-0 truncate rounded-sm text-body text-ink hover:underline">{o.name}</Link>
                  <span className="sr-only">{st.word}</span>
                </span>
                <span className="mt-0.5 block pl-4 text-small text-mute-3">{mapped ? "Funnel mapped" : "No funnel"}</span>
              </li>
            );
          })}
        </ul>
      </Col>
      <Col label="Automation" empty={!g.automations.length}>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">{g.automations.map(assetLine)}</ul>
      </Col>
      <Col label="Traffic and resources" empty={!g.resources.length}>
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {g.resources.map((a) => {
            const st = assetStand(a);
            return (
              <li key={a.id} className="min-w-0 max-w-full">
                <button type="button" onClick={() => openAsset(a.id)} title={a.name} className={cx("inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-left text-meta text-ink-3 transition-colors hover:border-line-strong hover:text-ink", FOCUS)}>
                  <Dot color={st.color} />
                  <span className="flex-none font-mono text-micro font-semibold tracking-[0.05em] text-mute-3">{ws.codeOf(a)}</span>
                  <span className="truncate">{a.name}</span>
                  <span className="sr-only">, {st.word}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Col>
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
    <Block id="offers" title="Offers" sub="By segment: the same service, argued for each audience.">
      <div className="flex flex-col gap-8">
        {groups.map((g) => (
          <div key={g.name}>
            <h3 className="m-0 mb-3 flex items-center gap-2.5 text-body font-normal text-mute-3">
              {/* On white, so the tint matches what the chip's text colour was worked out against. */}
              <span className="rounded-sm bg-surface"><Chip color={ws.segColor(g.name, brandId)} size="md">{g.name}</Chip></span>
              <span aria-hidden>·</span>
              {plural(g.list.length, "offer")}
            </h3>
            <div className="grid gap-3.5 md:grid-cols-2">{g.list.map((o) => <OfferCard key={o.id} o={o} variant="service" />)}</div>
          </div>
        ))}
        {orphans.length > 0 && (
          <div>
            <h3 className="m-0 mb-3 text-body font-normal text-mute-3">Offers whose segment is no longer in the Brand Kit · {plural(orphans.length, "offer")}</h3>
            <div className="grid gap-3.5 md:grid-cols-2">{orphans.map((o) => <OfferCard key={o.id} o={o} variant="service" />)}</div>
          </div>
        )}
      </div>
      {missing.length > 0 && (
        <p className="m-0 mt-5 text-body text-mute-3">
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
    </Block>
  );
}
