"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Funnel, FunnelLink, Offer } from "@/db/schema";
import { readable, rgb } from "@/lib/color";
import { NEUTRAL } from "@/lib/constants";
import { href } from "@/lib/routes";
import type { WS } from "@/lib/ws";
import { useApp } from "@/components/app/provider";
import { cx } from "@/components/ui";

/*
 * What a funnel box points at, as the board shows it: a type code, the
 * item's name, a sub label and where the ↗ goes.
 */

export type OpenTarget = { kind: "asset"; id: string } | { kind: "page"; href: string } | { kind: "external"; url: string };
export type Resolved = { code: string; name: string; sub: string; color: string; missing: boolean; open: OpenTarget | null };

/** A CTA's URL as something a new tab can open: http(s) as written, a bare domain gets https. */
export function ctaUrl(url: string): string | null {
  const u = url.trim();
  if (/^https?:\/\/\S+$/i.test(u)) return u;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(u)) return `https://${u}`;
  return null;
}

export function resolveLink(ws: WS, link: FunnelLink): Resolved {
  const missing: Resolved = { code: "?", name: "Not available", sub: "Deleted, or not shared with you", color: NEUTRAL, missing: true, open: null };
  const brandColor = (id: string | null | undefined) => ws.brand(id)?.primary ?? NEUTRAL;
  switch (link.type) {
    case "asset": {
      const a = ws.asset(link.id);
      if (!a) return missing;
      const sub = [a.type, !a.brandId && "Global Library", a.archived && "Archived"].filter(Boolean).join(" · ");
      return { code: ws.codeOf(a), name: a.name, sub, color: a.brandId ? brandColor(a.brandId) : NEUTRAL, missing: false, open: { kind: "asset", id: a.id } };
    }
    case "offer": {
      const o = ws.offer(link.id);
      if (!o) return missing;
      return { code: "OF", name: o.name, sub: o.archived ? "Offer · Archived" : `Offer · ${o.status}`, color: brandColor(o.brandId), missing: false, open: { kind: "page", href: href.offer(o.id) } };
    }
    case "service": {
      const v = ws.service(link.id);
      if (!v) return missing;
      return { code: "SVC", name: v.name, sub: v.archived ? "Service · Archived" : "Service", color: brandColor(v.brandId), missing: false, open: { kind: "page", href: href.service(v.id) } };
    }
    case "cta": {
      const c = ws.cta(link.id);
      if (!c) return missing;
      const url = ctaUrl(c.url);
      return { code: "CTA", name: c.text, sub: c.url ? `CTA · ${c.url}` : "CTA", color: brandColor(c.brandId), missing: false, open: url ? { kind: "external", url } : null };
    }
  }
}

/** The tint as a solid colour over white, so the tile reads the same on a white card or a yellow note. */
function solidTint(hex: string, a: number) {
  return "#" + rgb(hex).map((c) => Math.round(255 - (255 - c) * a).toString(16).padStart(2, "0")).join("");
}

/** The small type-code tile: LP, ADS, CTA, SVC… */
export function CodeBadge({ code, color, size = 28 }: { code: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex flex-none items-center justify-center rounded-[7px] px-1 font-mono font-bold tracking-[0.04em]"
      style={{ height: size, minWidth: size, fontSize: size >= 28 ? 11 : 10.5, background: solidTint(color, 0.12), color: readable(color, 0.12) }}
    >
      {code}
    </span>
  );
}

/** Opens what a linked box points at: the asset drawer, an offer or service page, or a CTA's URL in a new tab. */
export function OpenLink({ target, label, className, children, style }: { target: OpenTarget; label: string; className?: string; children: ReactNode; style?: React.CSSProperties }) {
  const { openAsset } = useApp();
  if (target.kind === "asset") {
    return <button type="button" aria-label={label} title={label} className={className} style={style} onClick={(e) => { e.stopPropagation(); openAsset(target.id); }}>{children}</button>;
  }
  if (target.kind === "page") {
    return <Link href={target.href} aria-label={label} title={label} className={className} style={style} onClick={(e) => e.stopPropagation()}>{children}</Link>;
  }
  return <a href={target.url} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} className={className} style={style} onClick={(e) => e.stopPropagation()}>{children}</a>;
}

export const linkValue = (l?: FunnelLink) => (l ? `${l.type}:${l.id}` : "");
export function parseLinkValue(v: string): FunnelLink | undefined {
  const i = v.indexOf(":");
  if (i < 1) return undefined;
  const type = v.slice(0, i) as FunnelLink["type"];
  if (!["asset", "offer", "service", "cta"].includes(type)) return undefined;
  return { type, id: v.slice(i + 1) };
}

type Group = { label: string; options: { value: string; label: string }[] };

/** Everything a box on this offer's board may point at, grouped the way people look for it. */
export function linkGroups(ws: WS, offer: Offer): Group[] {
  const linked = ws.linkedAssets(offer.id).filter((a) => !a.archived);
  const linkedIds = new Set(linked.map((a) => a.id));
  const brand = ws.brand(offer.brandId);
  const asset = (a: { id: string; name: string; type: string }) => ({ value: `asset:${a.id}`, label: `${a.name} · ${a.type}` });
  const groups: Group[] = [
    { label: "Linked to this offer", options: linked.map(asset) },
    { label: `Other ${brand?.name ?? "brand"} assets`, options: ws.assetsOf(offer.brandId).filter((a) => !a.archived && !linkedIds.has(a.id)).map(asset) },
    { label: "Global Library", options: ws.d.assets.filter((a) => !a.brandId && !a.archived && !linkedIds.has(a.id)).map(asset) },
    { label: "Offers", options: ws.offersOf(offer.brandId).filter((o) => o.id !== offer.id && !o.archived).map((o) => ({ value: `offer:${o.id}`, label: o.name })) },
    { label: "Services", options: ws.servicesOf(offer.brandId).filter((v) => !v.archived).map((v) => ({ value: `service:${v.id}`, label: v.name })) },
    { label: "CTAs", options: ws.ctasOf(offer.brandId).map((c) => ({ value: `cta:${c.id}`, label: `${c.text} · CTA` })) },
  ];
  return groups.filter((g) => g.options.length);
}

/** A select over `linkGroups`, with an empty first option. Keeps the current link listed even if it has gone. */
export function LinkSelect({ groups, value, onChange, empty, label, className, current }: {
  groups: Group[]; value: string; onChange: (v: string) => void; empty: string; label: string; className?: string; current?: string;
}) {
  const known = !value || groups.some((g) => g.options.some((o) => o.value === value));
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cx("field", className)}>
      <option value="">{empty}</option>
      {!known && <option value={value}>{current ?? "Current link"}</option>}
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

/** "Everything this funnel points at": each linked item once, as a one-click shortcut. Hidden when nothing is linked. */
export function FunnelIndex({ funnel }: { funnel: Funnel }) {
  const { ws } = useApp();
  const seen = new Set<string>();
  const items = [...funnel.boxes]
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .flatMap((b) => {
      if (!b.link) return [];
      const key = linkValue(b.link);
      if (seen.has(key)) return [];
      seen.add(key);
      const r = resolveLink(ws, b.link);
      return r.missing ? [] : [{ key, r }];
    });
  if (!items.length) return null;
  const row = "inline-flex max-w-full items-center gap-2 rounded-[10px] border border-line bg-white py-1.5 pl-1.5 pr-2.5 text-left";
  return (
    <div className="mt-4">
      <h3 className="m-0 mb-2 text-[14.5px] font-semibold text-ink-3">Everything this funnel points at</h3>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {items.map(({ key, r }) => {
          const body = (
            <>
              <CodeBadge code={r.code} color={r.color} size={26} />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold leading-tight text-ink">{r.name}</span>
                <span className="block truncate text-[12.5px] leading-tight text-mute-3">{r.sub}</span>
              </span>
              {r.open && <ArrowUpRight aria-hidden size={14} className="flex-none text-mute-4" />}
            </>
          );
          return (
            <li key={key} className="min-w-0 max-w-full">
              {r.open ? (
                <OpenLink target={r.open} label={`Open ${r.name} (${r.sub})`} className={cx(row, "transition hover:border-line-strong hover:bg-wash")}>{body}</OpenLink>
              ) : (
                <span className={row}>{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

