"use client";

import Link from "next/link";
import type { Asset, Offer } from "@/db/schema";
import { ASSET_STATUS, OFFER_STATUS, REVIEW_COLOR } from "@/lib/constants";
import { href } from "@/lib/routes";
import type { WS } from "@/lib/ws";
import { plural } from "@/lib/ws";
import { useState } from "react";
import { useApp } from "./app/provider";
import { CalendarDays, Download, ExternalLink, ImagePlus, MessageSquare, Pencil } from "lucide-react";
import { Avatar, Blocks, Chip, CodeTile, Tick, cx } from "./ui";
import { FOCUS, LIFT } from "./polish";
import { CardMenu, type CardMenuItem } from "./card-menu";
import { ThumbnailPicker } from "./thumbnail-picker";
import { fmtDate } from "@/lib/format";

/** One square per asset, coloured by where it stands in review. Live assets get a ring. */
export function blocksFor(list: Asset[], limit = 28) {
  return list.slice(0, limit).map((a) => {
    const rv = a.review ?? "None";
    const color = rv === "Approved" ? "#2F8F62" : rv === "In review" ? "#C99A2E" : rv === "Changes requested" ? "#C2410C" : "#C9D3CE";
    return {
      id: a.id,
      color,
      title: `${a.name} — ${a.status}${rv !== "None" ? ` · ${rv}` : ""}`,
      ring: a.status === "Live" ? "inset 0 0 0 1.5px rgba(16,22,20,.35)" : "none",
    };
  });
}

/** "● Approved · Live · v6": review state (when there is one), status and version on one line, the dot in the colour that matters most. */
export function StatusLine({ a }: { a: Asset }) {
  const reviewed = a.review !== "None";
  return (
    <span className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[13px] text-mute-2">
      <span aria-hidden className="h-2 w-2 flex-none rounded-full" style={{ background: reviewed ? REVIEW_COLOR[a.review] : ASSET_STATUS[a.status] ?? "#93A09A" }} />
      <span className="truncate">{reviewed && <span className="font-medium text-ink-3">{a.review} · </span>}{a.status} · v{a.version}</span>
    </span>
  );
}

export function StatusChips({ a }: { a: Asset }) {
  return (
    <span className="mb-2 flex flex-wrap items-center gap-[5px]">
      <Chip color={ASSET_STATUS[a.status] ?? "#93A09A"} size="xs">{a.status}</Chip>
      {a.review !== "None" && <Chip color={REVIEW_COLOR[a.review]} size="xs">{a.review}</Chip>}
      <span className="font-mono text-[12.5px] text-mute-4">v{a.version}</span>
    </span>
  );
}

type AssetVariant = "full" | "recent" | "library" | "kit" | "font";

/** Where a download of the whole asset points: the file itself when there is one, a zip of them all when there are several. */
export function assetDownload(a: Asset): { href: string; title: string } | null {
  const stored = (a.files ?? []).filter((f) => f.key);
  if (!stored.length) return null;
  if (stored.length === 1) return { href: stored[0].url ?? `/api/files/${stored[0].key}`, title: `Download ${stored[0].name}` };
  return { href: `/api/assets/${a.id}/download`, title: `Download all ${stored.length} files as a zip` };
}

/** Where an asset that lives at a link (a Drive folder, a live page) opens, and what to call that. */
export function assetLink(a: Asset): { href: string; label: string } | null {
  const url = (a.url ?? "").trim();
  if (!url) return null;
  const href = /^https?:\/\//i.test(url) ? url : `https://${url.replace(/^\/+/, "")}`;
  return { href, label: /^https?:\/\/(drive|docs)\.google\.com\//i.test(href) ? "Open in Drive" : "Open link" };
}

/** The card's corner button: download the files, or open the link for a Drive link or an asset that is only a link. */
export function assetPrimary(a: Asset): { kind: "download" | "open"; href: string; title: string } | null {
  const download = assetDownload(a);
  const link = assetLink(a);
  if (link && (a.type === "Drive link" || !download)) return { kind: "open", href: link.href, title: link.label };
  return download ? { kind: "download", ...download } : null;
}

/** Moving a card between the folders of the offer page it sits on. */
export type FolderMove = { folders: { id: string; name: string }[]; current: string | null; onMove: (folderId: string | null) => void };

/** What a dragged asset card carries, so a folder knows which asset landed on it. */
export const ASSET_DRAG = "application/x-brandos-asset";

const CARD_ACTION = cx(
  "flex h-8 w-8 items-center justify-center rounded-full border border-black/[.06] bg-white text-ink-3 shadow-[0_1px_4px_rgba(16,22,20,.16)] transition-colors hover:text-accent",
  FOCUS,
);

/**
 * `selecting` turns the card into a checkbox for bulk changes instead of opening the asset.
 * The card body is one button; download, edit and the "…" menu sit beside it (never inside
 * it), so each is its own keyboard stop and the card keeps the accessible name it always had.
 * They show on hover or keyboard focus, and always on touch screens. `move` (offer pages
 * with folders) adds "Move to folder" to the menu and lets the card be dragged onto a folder.
 */
export function AssetCard({ a, variant = "full", selecting, selected, onToggle, move }: {
  a: Asset; variant?: AssetVariant; selecting?: boolean; selected?: boolean; onToggle?: () => void; move?: FolderMove;
}) {
  const { ws, openAsset, open: openModal } = useApp();
  const [picking, setPicking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const color = ws.colorOf(a);
  const n = ws.linkedOfferIds(a.id).length;
  const open = ws.openCount("asset", a.id);
  const quiet = variant === "kit" || variant === "font";
  // Logos, guidelines and fonts are shown whole on the page tint; everything else fills its frame.
  const whole = ws.catOf(a) === "master";
  const preview = ws.previewOf(a);
  const primary = assetPrimary(a);
  const canEdit = ws.canChange(a) && (!!a.brandId || ws.can("library"));
  const canThumb = canEdit && ws.can("upload");
  const edit = () => openModal({ kind: "asset", draft: { ...a, offerIds: ws.linkedOfferIds(a.id), copy: a.copy ?? { headline: "", body: "", cta: "" } }, step: 3 });
  const menu: CardMenuItem[] = [
    ...(canThumb ? [{ kind: "item" as const, label: "Change thumbnail", icon: <ImagePlus aria-hidden size={16} className="text-mute-4" />, onSelect: () => setPicking(true) }] : []),
    ...(move?.folders.length ? [{
      kind: "choice" as const, label: "Move to folder",
      options: [
        ...move.folders.map((f) => ({ label: f.name, checked: move.current === f.id, onSelect: () => move.onMove(f.id) })),
        { label: "No folder", checked: !move.current, onSelect: () => move.onMove(null) },
      ],
    }] : []),
  ];
  const tile = <CodeTile code={ws.codeOf(a)} color={color} height={84} className="w-full" style={{ height: "100%", fontSize: 15 }} />;
  const draggable = !selecting && !!move?.folders.length;
  return (
    <div
      draggable={draggable || undefined}
      onDragStart={draggable ? (e) => { e.dataTransfer.setData(ASSET_DRAG, a.id); e.dataTransfer.effectAllowed = "move"; } : undefined}
      className={cx(
        "group relative flex flex-col rounded-[13px] border border-line bg-white shadow-[0_1px_2px_rgba(16,22,20,.04)]",
        quiet ? "transition hover:border-line-strong" : LIFT,
        a.archived && !selected && "opacity-55",
        selected && "border-accent ring-2 ring-accent",
        menuOpen && "z-20",
      )}
    >
      <button
        type="button"
        onClick={() => (selecting ? onToggle?.() : openAsset(a.id))}
        {...(selecting && { role: "checkbox", "aria-checked": !!selected })}
        className={cx("relative flex w-full flex-1 flex-col overflow-hidden rounded-[12px] p-0 text-left", FOCUS)}
      >
        {selecting && <span className="absolute left-2 top-2 z-[1] rounded-[6px] bg-white p-[2px] shadow-[0_1px_4px_rgba(16,22,20,.25)]"><Tick on={!!selected} size={19} /></span>}
        {/* A fixed 4:3 frame, so cards never jump while their pictures load. Purely a picture: the type and name follow in words. */}
        <span aria-hidden className="relative block aspect-[4/3] w-full flex-none overflow-hidden rounded-t-[12px] border-b border-divider bg-wash">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file; next/image would proxy it through the optimizer. The name sits right under it, so alt stays empty.
            <img src={preview} alt="" loading="lazy" decoding="async" draggable={false} className={cx("h-full w-full", whole ? "object-contain p-5" : "object-cover")} />
          ) : tile}
        </span>
        <span className="block px-3.5 pb-3 pt-2.5">
          <span className="block truncate font-mono text-[11px] uppercase tracking-[0.08em] text-mute-4">{a.type}</span>
          <span className="mt-0.5 block truncate text-[15px] font-semibold leading-[1.35] text-ink">{a.name}</span>
          {variant === "kit" && a.short && <span className="mt-1 block truncate text-[13.5px] text-mute-2">{a.short}</span>}
          {variant === "library" && (
            <span className="mt-1 block text-[13.5px] leading-[1.45] text-mute-2">
              {a.type === "Checklist" && <span className="font-mono text-[12.5px]">{(a.items ?? []).length} checks · </span>}
              {a.type === "Prompt" && a.promptFor && <span className="font-mono text-[12.5px]">{a.promptFor} · </span>}
              {a.short}
            </span>
          )}
          {(variant === "full" || variant === "recent") && (
            <>
              <StatusLine a={a} />
              <span className="mt-0.5 block text-[12px] text-mute-3">
                <span className={cx(n === 0 && "font-medium text-warn-text")}>{n === 0 ? "Not linked yet" : plural(n, "offer")}</span>
                {open > 0 && <> · {plural(open, "note")}</>}
              </span>
            </>
          )}
        </span>
      </button>
      {!selecting && (primary || canEdit || menu.length > 0) && (
        <span className={cx(
          "absolute right-2 top-2 z-[1] flex gap-1.5 transition-opacity duration-150",
          menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100",
        )}>
          {menu.length > 0 && <CardMenu label={`More for ${a.name}`} items={menu} triggerClassName={CARD_ACTION} onOpenChange={setMenuOpen} />}
          {canEdit && (
            <button type="button" aria-label={`Edit ${a.name}`} title="Edit details and add files" onClick={(e) => { e.stopPropagation(); edit(); }} className={CARD_ACTION}>
              <Pencil aria-hidden size={14} />
            </button>
          )}
          {primary?.kind === "download" && (
            <a href={primary.href} download aria-label={`Download ${a.name}`} title={primary.title} onClick={(e) => e.stopPropagation()} className={CARD_ACTION}>
              <Download aria-hidden size={15} />
            </a>
          )}
          {primary?.kind === "open" && (
            <a href={primary.href} target="_blank" rel="noreferrer" aria-label={`Open ${a.name}`} title={primary.title} onClick={(e) => e.stopPropagation()} className={CARD_ACTION}>
              <ExternalLink aria-hidden size={15} />
            </a>
          )}
        </span>
      )}
      {picking && (
        <ThumbnailPicker endpoint={`/api/assets/${a.id}/thumbnail`} subject={a.name} preview={preview} custom={!!a.thumbnail} resetLabel="Use first image" fallback={tile} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}

/** "Launches 14 Oct" / "Launched 3 Mar 2025". A marketing fact rather than a deadline, so no overdue colours. */
function LaunchDate({ at, now }: { at: Date | string; now: number }) {
  const d = new Date(at);
  const today = new Date(now);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const when = fmtDate(d, { short: true, now });
  return (
    <span suppressHydrationWarning className="inline-flex flex-none items-center gap-1 text-[13px] font-medium text-mute-2">
      <CalendarDays aria-hidden size={13} className="text-mute-4" />{day(d) < day(today) ? "Launched" : "Launches"} {when}
    </span>
  );
}

export function GoalChips({ ws, o, size = "sm" }: { ws: WS; o: Offer; size?: "sm" | "md" }) {
  if (!o.goals.length) return null;
  return (
    <span className="flex flex-wrap gap-[5px]">
      {o.goals.map((g) => <Chip key={g} round size={size} color={ws.goalColor(o.brandId, g)}>{g}</Chip>)}
    </span>
  );
}

export function OfferCard({ o, variant = "full" }: { o: Offer; variant?: "full" | "standalone" | "service" }) {
  const { ws } = useApp();
  const assets = ws.linkedAssets(o.id);
  const ac = assets.length;
  const open = ws.openCount("offer", o.id);
  const segColor = ws.segColor(o.segment, o.brandId);
  const assetLabel = ac === 0 ? "No assets yet" : plural(ac, "asset");
  const serviceName = o.serviceId ? ws.service(o.serviceId)?.name ?? "" : "Standalone";
  // Only a label someone typed: the positioning is printed right below, so a derived one would repeat it.
  const label = o.short.trim();

  if (variant === "standalone") {
    return (
      <Link href={href.offer(o.id)} className={cx("flex flex-col gap-2.5 rounded-[13px] border border-line bg-white px-5 py-[18px] text-left shadow-[0_1px_2px_rgba(16,22,20,.04)]", LIFT, FOCUS, o.archived && "opacity-55")}>
        <span className="flex flex-wrap items-center gap-1.5">
          <Chip color={OFFER_STATUS[o.status]}>{o.status}</Chip>
          <Chip color={segColor}>{o.segment}</Chip>
        </span>
        <span className="block text-[16.5px] font-semibold leading-[1.3] tracking-[-0.012em] text-ink">{o.name}</span>
        {o.positioning && <span className="block text-[15px] leading-[1.5] text-mute-1 text-pretty">{o.positioning}</span>}
        <span className="mt-auto block w-full border-t border-divider pt-2.5 text-[14px] font-medium" style={{ color: ac === 0 ? "#8A6A12" : "#46534D" }}>{assetLabel}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href.offer(o.id)}
      className={cx(
        "flex flex-col rounded-[14px] border border-line bg-white text-left shadow-[0_1px_2px_rgba(16,22,20,.04)]",
        LIFT, FOCUS,
        variant === "full" ? "gap-3 px-[22px] py-5" : "gap-2.5 p-5",
        o.archived && "opacity-55",
      )}
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <Chip color={OFFER_STATUS[o.status]}>{o.status}</Chip>
        {variant === "full" && <Chip color={segColor}>{o.segment}</Chip>}
        {o.review !== "None" && <Chip color={REVIEW_COLOR[o.review]}>{o.review}</Chip>}
        {o.dueAt && o.status !== "Archived" && <LaunchDate at={o.dueAt} now={ws.d.now} />}
      </span>
      {variant === "full" ? (
        <span className="block">
          <span className="eyebrow mb-1 block">{serviceName}</span>
          <span className="block text-[18px] font-semibold leading-[1.25] tracking-[-0.015em] text-ink">{o.name}</span>
          {label && <span className="mt-1 block text-[15px] text-mute-2">{label}</span>}
        </span>
      ) : (
        <span className="block text-[17px] font-semibold leading-[1.25] tracking-[-0.014em] text-ink">{o.name}</span>
      )}
      {o.positioning && <span className="block text-[15px] leading-[1.55] text-ink-3 text-pretty">{o.positioning}</span>}
      <GoalChips ws={ws} o={o} />
      {ac > 0 && <span className="mb-0.5"><Blocks blocks={blocksFor(assets)} /></span>}
      <span className="mt-auto flex w-full items-center gap-3 border-t border-divider pt-3 text-[14px]">
        <span className="font-medium" style={{ color: ac === 0 ? "#8A6A12" : "#46534D" }}>{assetLabel}</span>
        {open > 0 && <span className="inline-flex items-center gap-1 text-mute-2"><MessageSquare aria-hidden size={14} />{plural(open, "note")}</span>}
        <span className="flex-1" />
        <span className="text-mute-5">{ws.ago(o.updatedAt)}</span>
        {variant === "full" && <Avatar initials={ws.user(o.ownerId).initials} size={22} title={ws.user(o.ownerId).name} />}
      </span>
    </Link>
  );
}
