"use client";

import Link from "next/link";
import type { Asset, Offer } from "@/db/schema";
import { ASSET_STATUS, REVIEW_COLOR, assetStand, offerStand, type Stand } from "@/lib/constants";
import { assetGet, linkHref } from "@/lib/asset-download";
import { href } from "@/lib/routes";
import type { WS } from "@/lib/ws";
import { plural } from "@/lib/ws";
import { useState, type ReactNode } from "react";
import { setArchived, toggleLink } from "@/app/actions";
import { useAction, useApp } from "./app/provider";
import { Archive, ArchiveRestore, CalendarDays, ChevronRight, CopyPlus, Download, ExternalLink, ImagePlus, Link2, MessageSquare, Pencil, Trash2, Unlink } from "lucide-react";
import { CodeTile, IconBtn, Tick, cx } from "./ui";
import { FOCUS, LIFT } from "./polish";
import { CardMenu, type CardMenuItem } from "./card-menu";
import { ThumbnailPicker } from "./thumbnail-picker";
import { fmtDate } from "@/lib/format";
import { isLinkBroken } from "@/lib/link-health";
import { LinkStatus } from "./features/links/link-status";
import { PagePictureButton } from "./features/links/page-picture-button";
import { ResultBadge } from "./features/results/result-badge";

/* ---------------------------------------------------------------- the colour vocabulary */

/** A small round dot in a state or segment colour. Never on its own: a word always sits beside it. */
export function Dot({ color, small, className }: { color: string; small?: boolean; className?: string }) {
  return <span aria-hidden className={cx("inline-block flex-none rounded-full", small ? "size-1.5" : "size-2", className)} style={{ background: color }} />;
}

/** Where something stands: one dot and one word. `muted` quietens the word when the state is the expected one (an active offer). */
export function StateWord({ s, muted, className }: { s: Stand; muted?: boolean; className?: string }) {
  return (
    <span title={s.full !== s.word ? s.full : undefined} className={cx("inline-flex min-w-0 items-center gap-1.5", className)}>
      <Dot color={s.color} />
      <span className={cx("truncate", muted ? "text-mute-2" : "font-medium text-ink-3")}>{s.word}</span>
    </span>
  );
}

/** A segment: a neutral outline tag with a small dot in the segment's colour, or just the dot and word (`bare`). */
export function SegmentTag({ name, color, bare, className }: { name: string; color: string; bare?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex min-w-0 max-w-full items-center gap-1.5 text-ink-3", !bare && "rounded-sm border border-line bg-surface px-1.5 py-px", className)}>
      <Dot color={color} small />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** "5 approved · 1 in review": where a set of assets stands in review, in words. Empty when none has been reviewed. */
export function reviewSummary(list: Asset[]): string {
  const n = (r: Asset["review"]) => list.filter((a) => a.review === r).length;
  return [
    n("Approved") && `${n("Approved")} approved`,
    n("In review") && `${n("In review")} in review`,
    n("Changes requested") && `${n("Changes requested")} with changes`,
  ].filter(Boolean).join(" · ");
}

/** "● Approved · Live · v6": review state (when there is one), status and version on one line, the dot in the colour that matters most. */
export function StatusLine({ a }: { a: Asset }) {
  const reviewed = a.review !== "None";
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-small text-mute-2">
      <Dot color={reviewed ? REVIEW_COLOR[a.review] : ASSET_STATUS[a.status]} />
      <span className="truncate">{reviewed && <span className="font-medium text-ink-3">{a.review} · </span>}{a.status} · v{a.version}</span>
    </span>
  );
}

/** The goals an offer chases, as plain words. Goals are not states, so they get no colour. */
export function GoalChips({ o, size = "sm" }: { ws?: WS; o: Offer; size?: "sm" | "md" }) {
  if (!o.goals.length) return null;
  return <span className={cx("text-mute-2", size === "md" ? "text-body" : "text-meta")}>{o.goals.join(", ")}</span>;
}

/* ---------------------------------------------------------------- getting hold of an asset */

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

/**
 * What a person may do to one asset from a card or a row: edit it, and the "…" menu. The menu
 * offers what the asset's own "…" menu offers (thumbnail, clone, offers, archive, delete), so
 * the card is enough; on an offer page (`offerId`) also unlinking from that offer, and folders.
 */
function useAssetTools(a: Asset, move?: FolderMove, offerId?: string) {
  const { ws, open: openModal, toast } = useApp();
  const [run] = useAction();
  const [picking, setPicking] = useState(false);
  const canEdit = ws.canChange(a) && (!!a.brandId || ws.can("library"));
  const canThumb = canEdit && ws.can("upload");
  const offer = offerId ? ws.offer(offerId) : null;
  const edit = () => openModal({ kind: "asset", draft: { ...a, offerIds: ws.linkedOfferIds(a.id), copy: a.copy ?? { headline: "", body: "", cta: "" } }, step: 3 });
  const unlink = async () => {
    if (!offer) return;
    const r = await run(toggleLink, a.id, offer.id);
    if (r.ok) toast(`Unlinked ${a.name} from ${offer.name}. It is still in ${ws.brand(a.brandId)?.name ?? "its brand"}'s assets.`);
  };
  const icon = (I: typeof ImagePlus) => <I aria-hidden size={16} className="text-mute-4" />;
  const menu: CardMenuItem[] = [
    ...(canThumb ? [{ kind: "item" as const, label: "Change thumbnail", icon: icon(ImagePlus), onSelect: () => setPicking(true) }] : []),
    ...(ws.can("edit") ? [{ kind: "item" as const, label: "Clone", icon: icon(CopyPlus), onSelect: () => openModal({ kind: "clone", srcId: a.id, brandId: a.brandId, name: a.name + " (copy)", offerIds: [] }) }] : []),
    ...(canEdit && a.brandId ? [{ kind: "item" as const, label: "Link to offers", icon: icon(Link2), onSelect: () => openModal({ kind: "linkAsset", assetId: a.id }) }] : []),
    ...(offer && ws.canChange(a) && ws.linkedOfferIds(a.id).includes(offer.id) ? [{ kind: "item" as const, label: "Unlink from this offer", icon: icon(Unlink), onSelect: () => void unlink() }] : []),
    ...(ws.can("archive") ? [{ kind: "item" as const, label: a.archived ? "Restore" : "Archive", icon: icon(a.archived ? ArchiveRestore : Archive), onSelect: () => void run(setArchived, "asset", a.id, !a.archived) }] : []),
    ...(ws.can("del") ? [{ kind: "item" as const, label: "Delete", icon: <Trash2 aria-hidden size={16} />, danger: true, onSelect: () => openModal({ kind: "confirm", item: "asset", id: a.id, label: a.name }) }] : []),
    ...(move?.folders.length ? [{
      kind: "choice" as const, label: "Move to folder",
      options: [
        ...move.folders.map((f) => ({ label: f.name, checked: move.current === f.id, onSelect: () => move.onMove(f.id) })),
        { label: "No folder", checked: !move.current, onSelect: () => move.onMove(null) },
      ],
    }] : []),
  ];
  return { canEdit, edit, menu, picking, setPicking };
}

const CARD_ACTION = cx(
  "flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink-3 shadow-card transition-colors hover:text-accent",
  FOCUS,
);

/* ---------------------------------------------------------------- asset card (grid) */

/**
 * `selecting` turns the card into a checkbox for bulk changes instead of opening the asset.
 * The card body is one button; download, edit and the "…" menu sit beside it (never inside
 * it), so each is its own keyboard stop and the card keeps the accessible name it always had.
 * They show on hover or keyboard focus, and always on touch screens. `move` (offer pages
 * with folders) adds "Move to folder" to the menu and lets the card be dragged onto a folder.
 * `offerId` (an offer's Assets tab) adds "Unlink from this offer".
 *
 * Only a real picture gets picture space. Without one the card is compact: the type's code
 * on a small tile beside the words, never a large empty frame.
 */
export function AssetCard({ a, variant = "full", selecting, selected, onToggle, move, offerId }: {
  a: Asset; variant?: AssetVariant; selecting?: boolean; selected?: boolean; onToggle?: () => void; move?: FolderMove; offerId?: string;
}) {
  const { ws, openAsset } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const { canEdit, edit, menu, picking, setPicking } = useAssetTools(a, move, offerId);
  const color = ws.colorOf(a);
  const n = ws.linkedOfferIds(a.id).length;
  const open = ws.openCount("asset", a.id);
  const quiet = variant === "kit" || variant === "font";
  // Logos, guidelines and fonts are shown whole on the page tint; everything else fills its frame.
  const whole = ws.catOf(a) === "master";
  const preview = ws.previewOf(a);
  const primary = assetPrimary(a);
  const code = ws.codeOf(a);
  const tile = <CodeTile code={code} color={color} height={84} className="w-full" style={{ height: "100%" }} />;
  const draggable = !selecting && !!move?.folders.length;
  const words = (
    <>
      {/* Read out type first, as the card always has been; on screen the type follows in the line below. */}
      <span className="sr-only">{a.type} </span>
      {/* Two lines before it cuts off: names are what people scan for. */}
      <span className="line-clamp-2 break-words text-body font-semibold leading-[1.35] text-ink">{a.name}</span>
      {variant === "kit" && a.short && <span className="mt-0.5 block truncate text-meta text-mute-2">{a.short}</span>}
      {variant === "library" && (
        <span className="mt-0.5 line-clamp-2 text-meta leading-[1.45] text-mute-2">
          {a.type === "Checklist" && <>{(a.items ?? []).length} checks · </>}
          {a.type === "Prompt" && a.promptFor && <>{a.promptFor} · </>}
          {a.short}
        </span>
      )}
      {(variant === "full" || variant === "recent") && (
        <>
          <span className="mt-1 block"><StatusLine a={a} /></span>
          <span className="mt-0.5 block truncate text-small text-mute-2">
            <span aria-hidden>{a.type} · </span><span className={cx(n === 0 && "font-medium text-warn-text")}>{n === 0 ? "Not linked yet" : plural(n, "offer")}</span>
            {open > 0 && <> · {plural(open, "note")}</>}
          </span>
          {/* Plain spans, no button: the whole card is the button. */}
          {isLinkBroken(a) && <span className="mt-1.5 block"><LinkStatus asset={a} variant="badge" /></span>}
        </>
      )}
    </>
  );
  return (
    <div
      draggable={draggable || undefined}
      onDragStart={draggable ? (e) => { e.dataTransfer.setData(ASSET_DRAG, a.id); e.dataTransfer.effectAllowed = "move"; } : undefined}
      className={cx(
        "group relative flex flex-col rounded-xl border border-line bg-surface shadow-card",
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
        className={cx("relative flex w-full flex-1 overflow-hidden rounded-xl p-0 text-left", preview ? "flex-col" : "items-start gap-3 p-3", FOCUS)}
      >
        {selecting && <span className={cx("z-[1] rounded-lg bg-surface p-0.5 shadow-card", preview ? "absolute left-2 top-2" : "flex-none self-center")}><Tick on={!!selected} size={19} /></span>}
        {preview ? (
          <>
            {/* A fixed 4:3 frame, so cards never jump while their pictures load. Purely a picture: the name follows in words. */}
            <span aria-hidden className="relative block aspect-[4/3] w-full flex-none overflow-hidden rounded-t-xl border-b border-divider bg-wash">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file; next/image would proxy it through the optimizer. The name sits right under it, so alt stays empty. */}
              <img src={preview} alt="" loading="lazy" decoding="async" draggable={false} className={cx("h-full w-full", whole ? "object-contain p-5" : "object-cover")} />
            </span>
            <span className="block min-w-0 px-3.5 pb-3 pt-2.5">{words}</span>
          </>
        ) : (
          <>
            <span aria-hidden className="flex-none"><CodeTile code={code} color={color} size={40} style={{ fontSize: 12 }} /></span>
            <span className="block min-w-0 flex-1">{words}</span>
          </>
        )}
      </button>
      {!selecting && (primary || canEdit || menu.length > 0) && (
        <span className={cx(
          "absolute right-2 top-2 z-[1] flex gap-1.5 transition-opacity duration-150",
          // Over words rather than a picture, the buttons sit on the card's own surface so no text shows between them.
          !preview && "rounded-full bg-surface pl-1.5",
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
        <ThumbnailPicker endpoint={`/api/assets/${a.id}/thumbnail`} subject={a.name} preview={preview} custom={!!a.thumbnail} resetLabel="Use first image" fallback={tile}
          extra={<PagePictureButton asset={a} onDone={() => setPicking(false)} />} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- asset row (list) */

const ROW_GET = cx("inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2 text-meta font-medium text-ink-3 transition-colors hover:border-line-strong hover:text-ink @3xl:px-2.5", FOCUS);

/**
 * One asset as a row: its picture or code, name, type, where it stands and how many
 * offers use it, with Download or Open and Copy link always in reach on the right.
 * `serves` names the offers (of the ones in view) it is used by, under its name.
 * `tools` adds Edit and the "…" menu, for pages where people look after assets.
 * `selecting` turns the row into a checkbox for bulk changes.
 */
export function AssetRow({ a, serves, tools, selecting, selected, onToggle }: {
  a: Asset; serves?: Offer[]; tools?: boolean; selecting?: boolean; selected?: boolean; onToggle?: () => void;
}) {
  const { ws, openAsset, toast } = useApp();
  const { canEdit, edit, menu, picking, setPicking } = useAssetTools(a);
  const preview = ws.previewOf(a);
  const color = ws.colorOf(a);
  const code = ws.codeOf(a);
  const st = assetStand(a);
  const n = ws.linkedOfferIds(a.id).length;
  const get = assetGet(a);
  const link = linkHref(a.url);
  const servesText = serves?.length ? `For ${serves[0].name}${serves.length > 1 ? ` and ${serves.length - 1} more` : ""}` : "";
  const offersText = n === 0 ? "Not linked" : plural(n, "offer");
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); toast("Link copied"); } catch { window.prompt("Copy this link", link); }
  };
  return (
    <li className={cx("@container border-t border-divider first:border-t-0", a.archived && !selected && "opacity-60", selected && "bg-soft")}>
      <div className="flex min-h-12 items-center gap-2 pr-2 transition-colors hover:bg-wash @3xl:pr-3">
        <button
          type="button"
          onClick={() => (selecting ? onToggle?.() : openAsset(a.id))}
          {...(selecting && { role: "checkbox", "aria-checked": !!selected })}
          className="focus-inset flex min-w-0 flex-1 items-center gap-3 self-stretch py-1 pl-3 text-left @3xl:pl-4"
        >
          {selecting && <Tick on={!!selected} size={19} />}
          <span aria-hidden className="flex w-12 flex-none items-center">
            {preview
              // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file; the name follows in words.
              ? <img src={preview} alt="" loading="lazy" decoding="async" className="h-9 w-12 rounded-md border border-line bg-wash object-cover" />
              : <CodeTile code={code} color={color} size={40} style={{ fontSize: 12 }} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate text-body font-medium text-ink" title={a.name}>{a.name}</span>
              <LinkStatus asset={a} variant="badge" className="flex-none" />
            </span>
            {servesText
              ? <span className="mt-0.5 hidden truncate text-small text-mute-2 @3xl:block">{servesText}</span>
              : <span className="mt-0.5 hidden truncate text-small text-mute-2 @3xl:block @4xl:hidden">{a.type}</span>}
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-small text-mute-2 @3xl:hidden">
              <StateWord s={st} muted={st.tone !== "review" && st.tone !== "change"} className="flex-none" />
              <span aria-hidden>·</span>
              <span className="truncate">{servesText || `${offersText} · ${a.type}`}</span>
            </span>
          </span>
          <span className="hidden w-32 flex-none truncate text-meta text-mute-2 @4xl:block">{a.type}</span>
          <span className="hidden w-36 flex-none text-meta @3xl:flex"><StateWord s={st} muted={st.tone !== "review" && st.tone !== "change"} /></span>
          <span className={cx("hidden w-20 flex-none text-meta @3xl:block", n === 0 ? "font-medium text-warn-text" : "text-mute-2")}>{offersText}</span>
        </button>
        <span className="flex flex-none items-center gap-1">
          <span className={cx("w-9 flex-none justify-end @3xl:flex @3xl:w-34", get ? "flex" : "hidden")}>
            {get ? (
              <a
                href={get.href}
                title={get.title}
                aria-label={get.kind === "link" ? `Open link to ${a.name}` : get.kind === "zip" ? `Download all of ${a.name}` : `Download ${a.name}`}
                {...(get.kind === "link" ? { target: "_blank", rel: "noreferrer" } : { download: "" })}
                className={ROW_GET}
              >
                {get.kind === "link" ? <ExternalLink aria-hidden size={15} /> : <Download aria-hidden size={15} />}
                <span className="hidden @3xl:inline">{get.kind === "link" ? "Open" : get.kind === "zip" ? "Download all" : "Download"}</span>
              </a>
            ) : (
              <span className="text-right text-small text-mute-2"><span className="sr-only @3xl:not-sr-only">No files yet</span></span>
            )}
          </span>
          <span className={cx("w-7 flex-none justify-center @3xl:flex", link ? "flex" : "hidden")}>
            {link && <IconBtn size="sm" label={`Copy link to ${a.name}`} onClick={copy}><Link2 aria-hidden /></IconBtn>}
          </span>
          {tools && (
            <>
              <span className={cx("w-7 flex-none justify-center @3xl:flex", canEdit && !selecting ? "flex" : "hidden")}>
                {canEdit && !selecting && <IconBtn size="sm" label={`Edit ${a.name}`} onClick={edit}><Pencil aria-hidden /></IconBtn>}
              </span>
              {/* At every width: on a phone the menu is the only way to the thumbnail, archive and delete from the list. */}
              <span className={cx("w-7 flex-none justify-center @3xl:flex", menu.length > 0 && !selecting ? "flex" : "hidden")}>
                {menu.length > 0 && !selecting && <CardMenu label={`More for ${a.name}`} items={menu} triggerClassName={cx("inline-flex size-7 items-center justify-center rounded-lg text-mute-2 transition-colors hover:bg-hover hover:text-ink", FOCUS)} />}
              </span>
            </>
          )}
        </span>
      </div>
      {picking && (
        <ThumbnailPicker endpoint={`/api/assets/${a.id}/thumbnail`} subject={a.name} preview={preview} custom={!!a.thumbnail} resetLabel="Use first image"
          fallback={<CodeTile code={code} color={color} height={84} className="w-full" style={{ height: "100%" }} />}
          extra={<PagePictureButton asset={a} onDone={() => setPicking(false)} />} onClose={() => setPicking(false)} />
      )}
    </li>
  );
}

/** The bordered list that asset rows sit in. */
export function AssetRows({ children, label }: { children: ReactNode; label?: string }) {
  return <ul aria-label={label} className="m-0 list-none overflow-hidden rounded-xl border border-line bg-surface p-0">{children}</ul>;
}

/* ---------------------------------------------------------------- offers */

/** "Launches 14 Oct" / "Launched 3 Mar 2025". A marketing fact rather than a deadline, so no overdue colours. */
function launchWord(at: Date | string, now: number) {
  const d = new Date(at);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return { past: day(d) < day(new Date(now)), when: fmtDate(d, { short: true, now }) };
}

function LaunchDate({ at, now, bare }: { at: Date | string; now: number; bare?: boolean }) {
  const { past, when } = launchWord(at, now);
  return (
    <span suppressHydrationWarning title={`${past ? "Launched" : "Launches"} ${when}`} className="inline-flex flex-none items-center gap-1 text-mute-2">
      <CalendarDays aria-hidden size={14} className="flex-none" />
      {bare ? <><span className="sr-only">{past ? "Launched" : "Launches"} </span>{when}</> : <>{past ? "Launched" : "Launches"} {when}</>}
    </span>
  );
}

/**
 * One offer as a compact row: where it stands, its name and label, segment, goal,
 * assets, launch date and last change. The whole row is the link; the positioning
 * shows on hover. Columns drop away as the list gets narrower; on a phone the row
 * becomes the name over one line of facts.
 */
export function OfferRow({ o, segment = true }: { o: Offer; /** Off where the list is already grouped by segment. */ segment?: boolean }) {
  const { ws } = useApp();
  const st = offerStand(o);
  const ac = ws.linkedAssetIds(o.id).length;
  const label = o.short.trim();
  const segColor = ws.segColor(o.segment, o.brandId);
  const assets = ac === 0 ? "No assets" : plural(ac, "asset");
  const muted = st.word === "Active";
  const launch = o.dueAt && o.status !== "Archived" ? o.dueAt : null;
  return (
    <li className={cx("@container border-t border-divider first:border-t-0", o.archived && "opacity-60")}>
      <Link href={href.offer(o.id)} title={o.positioning || undefined} className="focus-inset flex min-h-12 items-center gap-3 px-4 py-1.5 transition-colors hover:bg-wash">
        <span className="hidden w-36 flex-none text-meta @2xl:flex"><StateWord s={st} muted={muted} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            {/* The name keeps its room; the label takes what is left. */}
            <span className="min-w-0 truncate text-body font-medium text-ink">{o.name}</span>
            <ResultBadge offerId={o.id} />
            {label && <span className="hidden min-w-0 flex-1 truncate text-meta text-mute-2 @3xl:inline">{label}</span>}
          </span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-small text-mute-2 @2xl:hidden">
            <StateWord s={st} muted={muted} />
            {segment && <><span aria-hidden>·</span><SegmentTag bare name={o.segment} color={segColor} /></>}
            <span aria-hidden>·</span><span className={cx(ac === 0 && "text-warn-text")}>{assets}</span>
            {launch && <><span aria-hidden>·</span><LaunchDate at={launch} now={ws.d.now} /></>}
          </span>
        </span>
        {segment && <span className="hidden w-36 flex-none text-meta @4xl:flex"><SegmentTag bare name={o.segment} color={segColor} /></span>}
        <span className="hidden w-32 flex-none truncate text-meta text-mute-2 @4xl:block" title={o.goals.join(", ") || undefined}>{o.goals[0] ?? ""}{o.goals.length > 1 && <span className="sr-only">, {o.goals.slice(1).join(", ")}</span>}</span>
        <span className={cx("hidden w-18 flex-none text-meta @2xl:block", ac === 0 ? "text-warn-text" : "text-mute-2")}>{assets}</span>
        <span className="hidden w-20 flex-none text-meta @3xl:flex">{launch && <LaunchDate at={launch} now={ws.d.now} bare />}</span>
        <span className="hidden w-24 flex-none text-right text-meta text-mute-2 @2xl:block" suppressHydrationWarning>{ws.ago(o.updatedAt)}</span>
      </Link>
    </li>
  );
}

/** The bordered list that offer rows sit in. */
export function OfferRows({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return <ul aria-label={label} className={cx("m-0 list-none overflow-hidden rounded-xl border border-line bg-surface p-0", className)}>{children}</ul>;
}

/** One bordered list holding several titled groups of rows (see ListGroup). */
export function GroupedRows({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("overflow-hidden rounded-xl border border-line bg-surface", className)}>{children}</div>;
}

/**
 * A titled group inside GroupedRows: a quiet header row with its count, then its
 * rows. With `onFold` the title is a button that folds the rows away. `aside`
 * sits at the right of the header (a link to the group's own page, say).
 */
export function ListGroup({ id, title, count, noun = ["item", "items"], aside, folded = false, onFold, as: H = "h2", children }: {
  id: string; title: ReactNode; count: number; /** What the count counts, for screen readers ("2 offers"). */ noun?: [string, string];
  aside?: ReactNode; folded?: boolean; onFold?: () => void; as?: "h2" | "h3"; children: ReactNode;
}) {
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2 truncate">{title}</span>{" "}
      <span className="flex-none font-normal text-mute-2">{count}<span className="sr-only"> {count === 1 ? noun[0] : noun[1]}</span></span>
    </>
  );
  return (
    <section aria-labelledby={`${id}-h`} className="border-t border-line first:border-t-0">
      <div className="flex min-h-10 items-center justify-between gap-3 bg-wash px-3 py-1">
        <H id={`${id}-h`} className="m-0 flex min-w-0 flex-1 text-meta font-semibold text-ink">
          {onFold ? (
            <button type="button" aria-expanded={!folded} aria-controls={id} onClick={onFold} className="focus-inset inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg py-1 pl-1 pr-2 text-left transition-colors hover:text-accent">
              <ChevronRight aria-hidden size={16} className={cx("flex-none text-mute-2 transition-transform duration-200 ease-snap", !folded && "rotate-90")} />
              {body}
            </button>
          ) : <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 py-1 pl-1">{body}</span>}
        </H>
        {aside}
      </div>
      <ul id={id} hidden={folded} className="m-0 list-none border-t border-divider p-0">{children}</ul>
    </section>
  );
}

/** One offer as a card, for the Cards view: the same facts as its row, with the positioning written out. */
export function OfferCard({ o }: { o: Offer; /** Kept so older call sites compile; every card is the same now. */ variant?: "full" | "standalone" | "service" }) {
  const { ws } = useApp();
  const assets = ws.linkedAssets(o.id);
  const ac = assets.length;
  const open = ws.openCount("offer", o.id);
  const st = offerStand(o);
  const label = o.short.trim();
  const summary = reviewSummary(assets);
  return (
    <Link href={href.offer(o.id)} title={o.name} className={cx("flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 text-left shadow-card", LIFT, FOCUS, o.archived && "opacity-55")}>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta">
        <StateWord s={st} muted={st.word === "Active"} />
        <ResultBadge offerId={o.id} />
        <SegmentTag name={o.segment} color={ws.segColor(o.segment, o.brandId)} className="text-small" />
        {o.dueAt && o.status !== "Archived" && <span className="text-small"><LaunchDate at={o.dueAt} now={ws.d.now} /></span>}
      </span>
      <span className="block">
        <span className="block text-lead font-semibold leading-[1.3] tracking-[-0.012em] text-ink">{o.name}</span>
        {label && <span className="mt-0.5 block text-meta text-mute-2">{label}</span>}
      </span>
      {o.positioning && <span className="line-clamp-3 text-body leading-[1.5] text-ink-3 text-pretty">{o.positioning}</span>}
      {o.goals.length > 0 && <span className="block text-meta text-mute-2"><span className="text-ink-3">Goal:</span> {o.goals.join(", ")}</span>}
      <span className="mt-auto flex w-full items-center gap-3 border-t border-divider pt-2.5 text-meta">
        <span className={cx("min-w-0 truncate", ac === 0 ? "font-medium text-warn-text" : "text-mute-2")}>
          {ac === 0 ? "No assets yet" : plural(ac, "asset")}{summary && <> · {summary}</>}
        </span>
        {open > 0 && <span className="inline-flex flex-none items-center gap-1 text-mute-2"><MessageSquare aria-hidden size={14} />{plural(open, "note")}</span>}
        <span className="flex-1" />
        <span className="flex-none text-mute-2" suppressHydrationWarning>{ws.ago(o.updatedAt)}</span>
      </span>
    </Link>
  );
}
