"use client";

import { FILE_KINDS, checkBatch, kindOf, sizeLabel, type FileKind, type MyUploadLimits } from "@/lib/upload-policy";
import { useCallback, useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Archive, ArchiveRestore, Copy, CopyPlus, Download, ExternalLink, File as FileIcon, FileArchive, FileAudio, FileImage, FileText, FileType, FileVideo, ImagePlus,
  Library as LibraryIcon, Link2, Pencil, Plus, RefreshCw, Trash2, Upload, X, type LucideIcon,
} from "lucide-react";
import type { Asset, FileRef } from "@/db/schema";
import { hexA, readable } from "@/lib/color";
import { ASSET_STATUS, CHANNEL_COLOR } from "@/lib/constants";
import { href } from "@/lib/routes";
import {
  addItem, listVersions, moveItem, removeFile, removeItem, resetList, restoreVersion,
  setArchived, setStatus, toggleItem, toggleLink, trackVisit,
} from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { Thread } from "@/components/discussion";
import { ArchivedNote, Avatar, Btn, ChangeNote, Chip, CodeTile, Hint, IconBtn, cx } from "@/components/ui";
import { FOCUS, PanelTabs, tabPanel } from "@/components/polish";
import { assetDownload, assetLink } from "@/components/cards";
import { CardMenu, type CardMenuItem } from "@/components/card-menu";
import { LinkBtn, displayUrl, useCopyLink } from "@/components/link-button";
import { ReviewLine, StatusSelect } from "@/components/workflow";
import { CtaTag } from "@/components/cta-tag";
import { ThumbnailPicker, imageFrom, intoText, useThumbnail } from "@/components/thumbnail-picker";
import { AiDraftButton } from "@/components/ai";
import { ProofView } from "@/components/proof";
import { PinLink, isPinned, proofFiles, type PinnedComment } from "@/components/proof-link";

const IMAGE = /^image\/(png|jpe?g|gif|webp|avif)$/;

type Tab = "overview" | "list" | "prompt" | "copy" | "proof" | "discussion" | "history";

export function AssetDrawer() {
  const { assetId, ws } = useApp();
  const a = assetId ? ws.asset(assetId) : null;
  if (!assetId) return null;
  if (!a) return <Missing />;
  return <Drawer key={a.id} a={a} />;
}

function Missing() {
  const { closeAsset } = useApp();
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 animate-fade bg-[rgba(16,22,20,.28)]" onClick={closeAsset} />
      <div className="absolute inset-y-0 right-0 flex w-[600px] max-w-full animate-slide flex-col items-center justify-center gap-3 bg-surface p-10 text-center shadow-pop">
        <div className="text-lead font-semibold">This asset is not here any more</div>
        <div className="text-body text-mute-2">It was deleted, or it belongs to a client you cannot see.</div>
        <Btn onClick={closeAsset}>Close</Btn>
      </div>
    </div>
  );
}

function Drawer({ a }: { a: Asset }) {
  const { ws, closeAsset, open, modal } = useApp();
  const [run] = useAction();
  const copy = useCopyLink();
  const params = useSearchParams();
  useEffect(() => { void trackVisit("asset", a.id); }, [a.id]);

  const b = ws.brand(a.brandId);
  const color = b?.primary ?? "#5E6C66";
  const offers = ws.linkedOffers(a.id);
  const cat = ws.catOf(a);
  const canEdit = ws.canChange(a) && (!!a.brandId || ws.can("library"));
  const items = a.items ?? [];
  const done = items.filter((i) => i.done).length;
  const proof = proofFiles(a);
  const canProof = proof.images.length > 0 || proof.pdfs.length > 0;
  const openPins = ws.commentsOf("asset", a.id).filter((c) => isPinned(c) && !c.resolved).length;
  const openNotes = ws.openCount("asset", a.id);
  const preview = ws.previewOf(a);
  const canThumb = canEdit && ws.can("upload");
  const [picking, setPicking] = useState(false);
  const thumb = useThumbnail(`/api/assets/${a.id}/thumbnail`);
  const link = assetLink(a);
  const file = link ? null : assetDownload(a);

  const tabs: { key: Tab; label: string; count?: string | number }[] = [
    { key: "overview", label: "Overview" },
    ...(a.type === "Checklist" ? [{ key: "list" as Tab, label: "Checklist", count: `${done}/${items.length}` }] : []),
    ...(a.type === "Prompt" ? [{ key: "prompt" as Tab, label: "Prompt" }] : []),
    { key: "copy", label: "Copy" },
    ...(canProof ? [{ key: "proof" as Tab, label: "Proof", count: openPins || undefined }] : []),
    { key: "discussion", label: "Discussion", count: openNotes || undefined },
    { key: "history", label: "History" },
  ];
  // ?tab= opens a section; the old Files and Client tabs (and an offer page's own tabs) land on the overview.
  const asked = params.get("tab");
  const [tab, setTab] = useState<Tab>(() => (tabs.some((t) => t.key === asked) ? (asked as Tab) : "overview"));
  // Which pin the proof view opens on. A new `n` remounts it, so a pinned note in the discussion can jump straight there.
  const [proofAt, setProofAt] = useState<{ fileKey?: string; pinId?: string; n: number }>(() => ({ pinId: params.get("pin") ?? undefined, n: 0 }));
  const goPin = useCallback((c: PinnedComment) => { setProofAt((p) => ({ fileKey: c.fileKey, pinId: c.id, n: p.n + 1 })); setTab("proof"); }, [setTab]);

  // The tabs stick right under the header, whatever height the title wraps to.
  const head = useRef<HTMLDivElement>(null);
  const [headH, setHeadH] = useState(57);
  useLayoutEffect(() => {
    const el = head.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setHeadH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A screenshot pasted anywhere in the drawer (outside a text box) becomes the card's thumbnail.
  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    if (!canThumb || picking || modal || thumb.busy || intoText(e.target)) return;
    const f = imageFrom(e.clipboardData, true);
    if (!f) return;
    e.preventDefault();
    void thumb.send(f);
  });
  useEffect(() => {
    const paste = (e: ClipboardEvent) => onPaste(e);
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, []);

  const editDraft = () => open({ kind: "asset", draft: { ...a, offerIds: offers.map((o) => o.id), copy: a.copy ?? { headline: "", body: "", cta: "" } }, step: 3 });
  // Everything that is not the everyday action sits in one menu.
  const more: CardMenuItem[] = [
    ...(canThumb ? [{ kind: "item" as const, label: "Change thumbnail", icon: <ImagePlus aria-hidden size={16} className="text-mute-2" />, onSelect: () => setPicking(true) }] : []),
    ...(canEdit ? [{ kind: "item" as const, label: "Clone", icon: <CopyPlus aria-hidden size={16} className="text-mute-2" />, onSelect: () => open({ kind: "clone", srcId: a.id, brandId: a.brandId, name: a.name + " (copy)", offerIds: [] }) }] : []),
    ...(canEdit && a.brandId ? [{ kind: "item" as const, label: "Link to offers", icon: <Link2 aria-hidden size={16} className="text-mute-2" />, onSelect: () => open({ kind: "linkAsset", assetId: a.id }) }] : []),
    ...(ws.can("archive") ? [{ kind: "item" as const, label: a.archived ? "Restore" : "Archive", icon: a.archived ? <ArchiveRestore aria-hidden size={16} className="text-mute-2" /> : <Archive aria-hidden size={16} className="text-mute-2" />, onSelect: () => void run(setArchived, "asset", a.id, !a.archived) }] : []),
    ...(ws.can("del") ? [{ kind: "item" as const, label: "Delete", icon: <Trash2 aria-hidden size={16} />, danger: true, onSelect: () => open({ kind: "confirm", item: "asset", id: a.id, label: a.name }) }] : []),
  ];
  const kind = cat === "campaign" ? "Campaign asset" : cat === "master" ? "Master file" : "Global asset";

  return (
    <PinLink.Provider value={goPin}>
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={a.name}>
      <div className="absolute inset-0 animate-fade bg-[rgba(16,22,20,.28)]" onClick={closeAsset} />
      <div data-scroll className="absolute inset-y-0 right-0 w-[600px] max-w-full animate-slide overflow-y-auto border-l border-line bg-surface shadow-pop">
        {/* One row: close, what this is, and what you can do with it. */}
        <div ref={head} className="sticky top-0 z-[3] flex items-center gap-2 border-b border-line bg-surface px-3 py-3 sm:px-4">
          <IconBtn label="Close" onClick={closeAsset}><X aria-hidden /></IconBtn>
          <h2 title={a.name} className="m-0 line-clamp-2 min-w-0 flex-1 text-body font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{a.name}</h2>
          <div className="flex flex-none items-center gap-1.5">
            {link && (
              <>
                <LinkBtn variant="primary" href={link.href} target="_blank" rel="noreferrer" title={link.href}><ExternalLink aria-hidden size={15} /><span className="sr-only sm:not-sr-only">Open</span></LinkBtn>
                <Btn size="sm" onClick={() => void copy(link.href)}><Copy aria-hidden size={14} /><span className="sr-only sm:not-sr-only">Copy link</span></Btn>
              </>
            )}
            {file && <LinkBtn variant="primary" href={file.href} download title={file.title}><Download aria-hidden size={15} /><span className="sr-only sm:not-sr-only">Download</span></LinkBtn>}
            {canEdit && <Btn size="sm" onClick={editDraft}><Pencil aria-hidden size={14} /><span className="sr-only sm:not-sr-only">Edit</span></Btn>}
            <CardMenu label="More asset actions" items={more} triggerClassName={TOP_MORE} />
          </div>
        </div>

        <div className="px-4 pb-10 pt-4 sm:px-6 sm:pt-5">
          {/*
            What it is, in one band: its picture at 16:10 (or the type code when there is none), then kind, the
            short line, brand, version and address. The picture opens the proof view, where it is shown large.
          */}
          <div className="mb-4 flex min-h-16 items-center gap-4">
            {preview ? (
              <Preview src={preview} contain={cat === "master"} busy={thumb.busy} onOpen={proof.images.length ? () => setTab("proof") : undefined} />
            ) : (
              <CodeTile code={ws.codeOf(a)} color={color} size={52} className={cx(thumb.busy && "opacity-50")} />
            )}
            <div className="min-w-0 flex-1">
              <p className="m-0 text-small text-mute-2">{kind} · {a.type}</p>
              {a.short && <p className="m-0 mt-0.5 text-body text-ink-3 text-pretty">{a.short}</p>}
              <p className="m-0 mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-small text-mute-2">
                {b ? (
                  <Link href={href.brand(b.id)} className="inline-flex items-center gap-1.5 rounded-sm font-medium text-ink-3 hover:underline">
                    <span aria-hidden className="size-2.5 rounded-sm" style={{ background: b.primary }} />{b.name}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-ink-3"><LibraryIcon aria-hidden size={13} />Global Library</span>
                )}
                <span aria-hidden>·</span>
                <span>v{a.version}</span>
                {link && <><span aria-hidden>·</span><span title={link.href} className="min-w-0 max-w-full truncate">{displayUrl(link.href)}</span></>}
              </p>
            </div>
          </div>

          <dl className="m-0 mb-4 grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2.5 text-meta">
            <dt className="text-mute-2">Status</dt>
            <dd className="m-0 min-w-0"><StatusSelect value={a.status} colors={ASSET_STATUS} readOnly={!canEdit} onChange={(st) => void run(setStatus, "asset", a.id, st)} /></dd>
            <dt className="text-mute-2">Review</dt>
            <dd className="m-0 min-w-0"><ReviewLine kind="asset" item={a} /></dd>
          </dl>
          {a.changeNote && a.review === "Changes requested" && <ChangeNote className="mb-4">{a.changeNote}</ChangeNote>}
          {a.archived && <ArchivedNote className="mb-4">Archived. Offers that link to it still show it, greyed out.</ArchivedNote>}

          <AttachedFiles a={a} onProof={proof.images.length ? () => setTab("proof") : undefined} onEdit={canEdit ? editDraft : undefined} />

          <div className="sticky z-[2] -mx-4 mb-5 border-b border-line bg-surface px-2 sm:-mx-6 sm:px-4" style={{ top: headH }}>
            <PanelTabs id="asset" label="Asset sections" value={tab} onChange={setTab} items={tabs} />
          </div>

          <div {...tabPanel("asset", tab)}>
            {tab === "overview" && <Overview a={a} />}
            {tab === "list" && <Checklist a={a} />}
            {tab === "prompt" && <PromptTab a={a} />}
            {tab === "copy" && <CopyTab a={a} onEdit={editDraft} />}
            {tab === "proof" && (canProof ? <ProofView key={proofAt.n} a={a} fileKey={proofAt.fileKey} pinId={proofAt.pinId} /> : <Overview a={a} />)}
            {tab === "discussion" && <Thread kind="asset" id={a.id} />}
            {tab === "history" && <History a={a} />}
          </div>
        </div>
      </div>
      {picking && (
        <ThumbnailPicker endpoint={`/api/assets/${a.id}/thumbnail`} subject={a.name} preview={preview} custom={!!a.thumbnail} resetLabel="Use first image"
          fallback={<span className="flex h-full w-full items-center justify-center font-mono text-body font-bold tracking-[0.1em]" style={{ background: hexA(color, 0.1), color: readable(color, 0.1) }}>{ws.codeOf(a)}</span>}
          onClose={() => setPicking(false)} />
      )}
    </div>
    </PinLink.Provider>
  );
}

/** The asset's picture at 16:10, small enough that the sections stay in reach. */
function Preview({ src, contain, busy, onOpen }: { src: string; contain: boolean; busy: boolean; onOpen?: () => void }) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file; the asset's name is the dialog's name
    <img src={src} alt="" className={cx("h-full w-full transition-opacity", contain ? "object-contain p-2" : "object-cover", busy && "opacity-50")} />
  );
  const cls = "block aspect-[16/10] w-32 flex-none overflow-hidden rounded-lg border border-line bg-wash sm:w-48";
  return onOpen
    ? <button type="button" onClick={onOpen} aria-label="Show the picture large in the proof view" className={cx(cls, "transition-[border-color,transform] duration-150 ease-snap hover:border-line-strong active:scale-[0.98]", FOCUS)}>{img}</button>
    : <span className={cls}>{img}</span>;
}

const TOP_MORE = cx("flex size-8 flex-none items-center justify-center rounded-lg border border-line bg-surface text-mute-2 transition-[background-color,border-color,color,transform] duration-150 ease-snap hover:border-line-strong hover:text-ink active:scale-[0.97]", FOCUS);

/** One quiet line of the details list: a small label over its value, no boxes. */
function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-small text-mute-2">{label}</dt>
      <dd className="m-0 mt-0.5 break-words text-meta font-medium text-ink-2">{children}</dd>
    </div>
  );
}

/* ---------------------------------------------------------------- tabs */

const SECTION = "m-0 mb-2 text-small font-medium text-mute-2";

function Overview({ a }: { a: Asset }) {
  const { ws, open, openAsset } = useApp();
  const [run] = useAction();
  const offers = ws.linkedOffers(a.id);
  const src = a.clonedFromId ? ws.asset(a.clonedFromId) : null;
  const b = ws.brand(a.brandId);
  const canLink = ws.canChange(a) && !!a.brandId;
  const section = (label: string, body: React.ReactNode) => (
    <div className="mb-5"><h3 className={SECTION}>{label}</h3>{body}</div>
  );
  return (
    <div>
      <h3 className={SECTION}>{offers.length === 0 ? "Not linked to any offer" : `Linked to ${offers.length} offer${offers.length > 1 ? "s" : ""}`}</h3>
      <div className="mb-6 flex flex-col gap-2">
        {offers.length > 0 && (
          <ul className="m-0 list-none overflow-hidden rounded-xl border border-line p-0">
            {offers.map((o) => (
              <li key={o.id} className="flex min-w-0 items-center gap-3 border-t border-divider px-3 py-2 first:border-t-0">
                <Link href={href.offer(o.id)} className="min-w-0 flex-1 truncate rounded-sm text-body font-medium text-ink hover:text-accent">{o.name}</Link>
                <span className="inline-flex flex-none items-center gap-1.5 text-small text-mute-2">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: ws.segColor(o.segment, o.brandId) }} />{o.segment}
                </span>
                {ws.canChange(a) && (
                  <button type="button" onClick={() => run(toggleLink, a.id, o.id)} aria-label={`Unlink from ${o.name}`}
                    className="inline-flex h-7 flex-none items-center rounded-lg px-2 text-small text-mute-2 transition-colors hover:bg-hover hover:text-danger">Unlink</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!offers.length && a.brandId && (
          <p className="m-0 rounded-xl bg-warn/10 px-4 py-3 text-body text-warn-ink">
            Not linked to anything yet, so nobody will find it by walking through the offers.
          </p>
        )}
        {/* The same asset can serve any number of offers; linking it to one more never copies it. */}
        {canLink && (
          <button type="button" onClick={() => open({ kind: "linkAsset", assetId: a.id })}
            className="flex h-9 items-center gap-2 self-start rounded-lg px-2 text-meta font-medium text-accent transition-colors hover:bg-soft">
            <Plus aria-hidden size={15} />{offers.length ? "Link to another offer" : "Link to an offer"}
          </button>
        )}
        {!offers.length && !a.brandId && <p className="m-0 text-body text-mute-2">Global Library items are not linked to offers. Clone one into a brand when you run it.</p>}
      </div>
      {src && (
        <p className="m-0 mb-5 text-body text-mute-2">
          Cloned from <button type="button" className="rounded-sm font-semibold text-ink hover:underline" onClick={() => openAsset(src.id)}>{src.name}</button>
        </p>
      )}
      {a.tags.length > 0 && section("Tags", <div className="flex flex-wrap gap-1">{a.tags.map((t) => <span key={t} className="rounded-sm bg-chip px-2 py-0.5 text-meta text-mute-1">{t}</span>)}</div>)}
      {a.ctaId && ws.cta(a.ctaId) && section("Call to action", <CtaTag c={ws.cta(a.ctaId)!} />)}
      {a.specs && section("Creative specs", <div className="text-body text-ink-3">{a.specs}</div>)}
      {a.audienceNotes && section("Audience notes", <div className="text-body text-ink-3">{a.audienceNotes}</div>)}
      {a.aiPrompt && section("AI prompt used", <div className="text-body italic text-mute-1">{a.aiPrompt}</div>)}
      {a.notes && section("Notes", <div className="whitespace-pre-wrap text-body text-ink-3 text-pretty">{a.notes}</div>)}

      <h3 className={cx(SECTION, "mb-3 mt-8 border-t border-divider pt-5")}>Details</h3>
      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3.5">
        <Meta label="Brand">{b ? <Link href={href.brand(b.id)} className="rounded-sm hover:text-accent">{b.name}</Link> : "Global Library"}</Meta>
        <Meta label="Type">{a.type}</Meta>
        <Meta label="Channel"><Chip color={CHANNEL_COLOR[a.channel] ?? "#46534D"}>{a.channel}</Chip></Meta>
        <Meta label="Delivery">{a.delivery || "None"}</Meta>
        <Meta label="Access">{a.gated ? "Gated (requested, then sent)" : "Open"}</Meta>
        <Meta label="Owner">{ws.user(a.ownerId).name}</Meta>
        <Meta label="Version">v{a.version} · updated {ws.ago(a.updatedAt)}</Meta>
      </dl>
    </div>
  );
}

export function CtaButton({ id, size = "md" }: { id: string; size?: "md" | "lg" }) {
  const { ws } = useApp();
  const c = ws.cta(id);
  if (!c) return null;
  const outline = c.style === "outline";
  const ghost = c.style === "ghost";
  return (
    <span
      title={c.url}
      className={cx("inline-block rounded-lg font-semibold", size === "lg" ? "px-4 py-2 text-body" : "px-4 py-2 text-body")}
      style={{ background: outline || ghost ? "transparent" : c.bg, color: c.fg, border: `1.5px solid ${outline ? c.fg : "transparent"}`, textDecoration: ghost ? "underline" : undefined }}
    >
      {c.text}
    </span>
  );
}

function Checklist({ a }: { a: Asset }) {
  const { ws } = useApp();
  const [run] = useAction();
  const [text, setText] = useState("");
  const items = a.items ?? [];
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const canTick = ws.can("comment");
  return (
    <div>
      <div className="mb-3.5 flex items-center gap-3">
        <span className="text-body font-semibold">{done} of {items.length} done</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-sm bg-avatar" role="progressbar" aria-label="Checks done" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span className="block h-1.5 rounded-sm bg-accent transition-[width] duration-300" style={{ width: pct + "%" }} />
        </span>
        {canTick && <button type="button" onClick={() => run(resetList, a.id)} className="inline-flex h-7 flex-none items-center rounded-lg px-2 text-meta text-mute-2 transition-colors hover:bg-hover hover:text-ink">Reset</button>}
      </div>
      {items.length > 0 && done === items.length && (
        <div className="mb-3 rounded-xl bg-ok/10 px-4 py-3 text-body text-ok">Every check is done.</div>
      )}
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {items.map((it, idx) => (
          <div key={idx} className="group flex items-start gap-3 border-t border-divider px-4 py-3 first:border-t-0">
            <button type="button" role="checkbox" aria-checked={it.done} aria-label={it.text} disabled={!canTick} onClick={() => run(toggleItem, a.id, idx)}
              className="-m-0.5 flex size-6 flex-none items-center justify-center rounded-md disabled:cursor-default">
              <span aria-hidden className={cx("flex size-[18px] items-center justify-center rounded-sm border-[1.5px] text-small font-bold text-on-accent", it.done ? "border-accent bg-accent" : "border-line-strong bg-surface")}>{it.done ? "✓" : ""}</span>
            </button>
            <span className="flex-none font-mono text-meta text-mute-2">{String(idx + 1).padStart(2, "0")}</span>
            <span className={cx("flex-1 text-body text-pretty", it.done ? "text-mute-2 line-through" : "text-ink-2")}>{it.text}</span>
            {ws.can("edit") && (
              <span className="flex flex-none gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <button type="button" aria-label="Move up" disabled={idx === 0} onClick={() => run(moveItem, a.id, idx, -1)} className="px-1 text-meta text-line-strong hover:text-ink disabled:opacity-30">↑</button>
                <button type="button" aria-label="Move down" disabled={idx === items.length - 1} onClick={() => run(moveItem, a.id, idx, 1)} className="px-1 text-meta text-line-strong hover:text-ink disabled:opacity-30">↓</button>
                <button type="button" aria-label="Remove check" onClick={() => run(removeItem, a.id, idx)} className="px-1 text-body text-line-strong hover:text-danger">✕</button>
              </span>
            )}
          </div>
        ))}
        {!items.length && <div className="p-7 text-center text-body text-mute-2">No checks yet.</div>}
      </div>
      {ws.can("edit") && (
        <form className="mt-2.5 flex gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await run(addItem, a.id, text); if (r.ok) setText(""); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a check" aria-label="Add a check" className="field flex-1 text-body" />
          <Btn type="submit" size="lg" className="font-semibold">Add</Btn>
        </form>
      )}
      <Hint className="mt-3.5">
        {ws.can("edit")
          ? "This is the master copy. Clone it into a brand when you run it on a real project, so the ticks belong to that job and this one stays clean."
          : "This is the master copy. The ticks show where the team last left it; ask an editor if something needs changing."}
      </Hint>
    </div>
  );
}

function useCopied() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, key: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied((k) => (k === key ? null : k)), 1600);
  };
  return [copied, copy] as const;
}

function PromptTab({ a }: { a: Asset }) {
  const { ws } = useApp();
  const [copied, copy] = useCopied();
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <span className="text-small text-mute-2">Use for</span>
        <span className="text-body font-semibold">{a.promptFor || <span className="font-normal text-mute-2">Not set</span>}</span>
        <span className="flex-1" />
        <Btn size="sm" className="font-semibold text-accent hover:border-accent" onClick={() => copy(a.prompt, "prompt")} disabled={!a.prompt}>{copied === "prompt" ? "Copied" : "Copy prompt"}</Btn>
      </div>
      <div className="rounded-xl border border-line bg-wash px-5 py-4">
        <pre className="m-0 whitespace-pre-wrap break-words font-[family-name:var(--font-code)] text-body leading-[1.75] text-ink-2">{a.prompt || "No prompt written yet."}</pre>
      </div>
      <Hint className="mt-3.5">
        {ws.can("edit")
          ? "Square brackets are the bits you swap per job. This is the finalised version: if you improve it, edit it here rather than keeping a better one in your notes."
          : "Square brackets are the bits you swap per job. Copy it and fill them in; this is the finalised version the team agreed on."}
      </Hint>
    </div>
  );
}

function CopyTab({ a, onEdit }: { a: Asset; onEdit: () => void }) {
  const { ws } = useApp();
  const [copied, copy] = useCopied();
  const c = a.copy;
  const has = !!(c && (c.headline || c.body));
  if (!has) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong p-9 text-center">
        <div className="mb-1 text-lead font-semibold">No copy written yet</div>
        <div className="mb-4 text-body text-mute-2">Headline, body and CTA live here so nobody has to open a design file to read them.</div>
        {ws.can("edit") && (
          <div className="flex flex-wrap justify-center gap-2">
            <Btn onClick={onEdit}><Pencil aria-hidden size={15} />Write the copy</Btn>
            {a.brandId && ws.d.aiEnabled && <AiDraftButton assetId={a.id} />}
          </div>
        )}
      </div>
    );
  }
  const all = [c!.headline, c!.body, c!.cta].filter(Boolean).join("\n\n");
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-line">
        <div className="border-b border-line px-4 py-4">
          <div className="mb-1 flex items-center text-small text-mute-4"><span className="flex-1">Headline</span><CopyLink on={copied === "h"} onClick={() => copy(c!.headline, "h")} /></div>
          <div className="text-lead font-semibold leading-[1.4] tracking-[-0.01em] text-pretty">{c!.headline}</div>
        </div>
        <div className="border-b border-line px-4 py-4">
          <div className="mb-1 flex items-center text-small text-mute-4"><span className="flex-1">Body</span><CopyLink on={copied === "b"} onClick={() => copy(c!.body, "b")} /></div>
          <div className="whitespace-pre-wrap text-lead leading-[1.65] text-ink-3 text-pretty">{c!.body}</div>
        </div>
        <div className="flex items-center gap-3 px-4 py-4">
          <div><div className="mb-1 text-small text-mute-4">Call to action</div><div className="text-lead font-semibold">{c!.cta || <span className="font-normal text-mute-2">Not set</span>}</div></div>
          <span className="flex-1" />
          <Btn size="sm" onClick={() => copy(all, "all")}>{copied === "all" ? "Copied" : "Copy all"}</Btn>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-body text-mute-3">
        <span className="flex-1">{wordCount(all)} words · reads in about {Math.max(1, Math.round(wordCount(all) / 3.5))} seconds</span>
        {ws.can("edit") && a.brandId && ws.d.aiEnabled && <AiDraftButton assetId={a.id} label="Suggest a rewrite" />}
      </div>
    </div>
  );
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function CopyLink({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="text-small text-mute-4 hover:text-ink">{on ? "Copied" : "Copy"}</button>;
}

const ROW_BTN = "inline-flex flex-none items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-meta font-semibold transition-colors hover:border-accent disabled:opacity-60 sm:px-3";

const GLYPH: Record<FileKind, LucideIcon> = {
  image: FileImage, video: FileVideo, audio: FileAudio, document: FileText, design: FileImage, font: FileType, archive: FileArchive,
};
/** "PDF", "PNG": the extension, as people say it. */
const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toUpperCase().slice(0, 5) : "");
/** Rows shown before "Show all", so a long list never pushes the tabs out of sight. */
const SHOWN = 4;

/** A small picture of the file: the image itself, or an icon for its kind. */
function FileGlyph({ f }: { f: FileRef }) {
  if (f.url && IMAGE.test(f.type ?? "")) {
    // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file; the name is right beside it
    return <img src={`${f.url}?inline=1`} alt="" loading="lazy" decoding="async" className="h-9 w-9 flex-none rounded-lg border border-line bg-wash object-cover" />;
  }
  const Icon = GLYPH[kindOf(f.name) as FileKind] ?? FileIcon;
  return <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-chip text-mute-3"><Icon size={17} strokeWidth={1.8} /></span>;
}

/**
 * The asset's files, right under the review line so nobody has to open a tab
 * to find them. Download, Download all, Replace and upload all happen here.
 * Its link lives in the header (Open, Copy link), so it is not repeated here.
 */
function AttachedFiles({ a, onProof, onEdit }: { a: Asset; onProof?: () => void; onEdit?: () => void }) {
  const { ws, toast } = useApp();
  const [run] = useAction();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  // One file input serves "Upload files" and every "Replace": this is the stored file being replaced while the picker is open.
  const replaceFor = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [all, setAll] = useState(false);
  const headId = useId();
  const files = a.files ?? [];
  const stored = files.filter((f) => f.key);
  const canEdit = ws.canChange(a) && (!!a.brandId || ws.can("library"));
  const canUpload = canEdit && ws.can("upload");
  const limits = ws.d.uploads.mine;
  const link = assetLink(a);
  const drive = a.type === "Drive link";
  const rows = all || files.length <= SHOWN + 1 ? files : files.slice(0, SHOWN);

  const upload = async (list: File[]) => {
    if (!list.length) return;
    // Same rules the server applies, checked first so nobody waits for a big file to be refused.
    const problem = checkBatch(list.map((f) => ({ name: f.name, size: f.size })), limits);
    if (problem) { toast(problem, "error"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      list.forEach((f) => fd.append("file", f));
      const res = await fetch(`/api/assets/${a.id}/files`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) toast(body.error ?? "Upload failed.", "error");
      else { toast(`${list.length} file${list.length > 1 ? "s" : ""} added`); router.refresh(); }
    } catch {
      toast("Upload failed. Check your connection and try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  /** Swaps one stored file for a new one in the same place in the list. The server drops the old copy once nothing points at it. */
  const replace = async (key: string, f: File) => {
    const old = files.find((x) => x.key === key);
    if (!old) return;
    const problem = checkBatch([{ name: f.name, size: f.size }], limits);
    if (problem) { toast(problem, "error"); return; }
    setSwapping(key);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("replace", key);
      const res = await fetch(`/api/assets/${a.id}/files`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) toast(body.error ?? "The file could not be replaced.", "error");
      else { toast(`Replaced ${old.name}`); router.refresh(); }
    } catch {
      toast("The file could not be replaced. Check your connection and try again.", "error");
    } finally {
      setSwapping(null);
    }
  };

  const pick = (key: string | null) => {
    const el = input.current;
    if (!el) return;
    replaceFor.current = key;
    el.multiple = !key;
    el.click();
  };

  const picked = (el: HTMLInputElement) => {
    const list = Array.from(el.files ?? []);
    const key = replaceFor.current;
    replaceFor.current = null;
    el.value = "";
    el.multiple = true;
    if (!list.length) return;
    if (key) void replace(key, list[0]);
    else void upload(list);
  };

  // Nothing to list and nothing to add: no section at all.
  if (!files.length && !canUpload && !(drive && !link)) return null;

  return (
    <section
      aria-labelledby={headId}
      onDragOver={(e) => { if (canUpload && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false); }}
      onDrop={(e) => { if (!canUpload) return; e.preventDefault(); setDrag(false); void upload(Array.from(e.dataTransfer.files)); }}
      className={cx("mb-6 rounded-xl transition", drag && "outline-2 outline-offset-4 outline-accent outline-dashed")}
    >
      <div className="mb-2 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 id={headId} className="m-0 text-small font-medium text-mute-2">
          {drive && !files.length ? "Drive link" : <>Files{files.length > 0 && <span className="tabular-nums"> {files.length}</span>}</>}
        </h3>
        <span className="flex-1" />
        {onProof && <button type="button" onClick={onProof} className="inline-flex h-7 items-center rounded-lg px-1.5 text-meta font-medium text-accent transition-colors hover:bg-soft">Open proof view</button>}
        {stored.length > 1 && (
          <a href={`/api/assets/${a.id}/download`} download aria-label={`Download all ${stored.length} files as a zip`} className={cx(ROW_BTN, "text-accent")}>
            <Download aria-hidden size={14} />Download all
          </a>
        )}
      </div>

      {drive && !link && (
        <div className="mb-2 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-strong px-3.5 py-3 text-body text-mute-2">
          <span className="flex-1">No Drive link added yet.</span>
          {onEdit && <Btn size="sm" onClick={onEdit}>Add the link</Btn>}
        </div>
      )}

      {files.length > 0 && (
        <ul aria-label="Attached files" className="m-0 list-none overflow-hidden rounded-xl border border-line p-0">
          {rows.map((f) => (
            <li key={f.name} className="group flex items-center gap-2.5 border-t border-divider px-3 py-2 first:border-t-0 sm:gap-3 sm:px-3.5">
              <FileGlyph f={f} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-medium text-ink">{f.name}</span>
                <span className="block text-small tabular-nums text-mute-2">{[f.size, extOf(f.name)].filter(Boolean).join(" · ")}</span>
              </span>
              {f.url ? (
                <a href={f.url} download={f.name} aria-label={`Download ${f.name}`} title={`Download ${f.name}`} className={cx(ROW_BTN, "text-accent")}>
                  <Download aria-hidden size={14} /><span className="hidden sm:inline">Download</span>
                </a>
              ) : (
                <span title="Listed for reference. The file itself was never uploaded here." className="flex-none rounded-lg border border-dashed border-line px-2.5 py-1 text-small text-mute-2">Not uploaded</span>
              )}
              {canUpload && f.key && (
                <button type="button" aria-label={`Replace ${f.name}`} title={`Replace ${f.name} with a new file`} disabled={busy || !!swapping} onClick={() => pick(f.key!)} className={cx(ROW_BTN, "text-ink-3")}>
                  <RefreshCw aria-hidden size={14} className={cx(swapping === f.key && "animate-spin motion-reduce:animate-none")} /><span className="hidden sm:inline">Replace</span>
                </button>
              )}
              {canEdit && (
                <button type="button" aria-label={`Remove ${f.name}`} title={`Remove ${f.name}`} onClick={() => run(removeFile, a.id, f.name)}
                  className="flex size-7 flex-none items-center justify-center rounded-lg text-mute-2 opacity-0 transition hover:bg-hover hover:text-danger group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100">
                  <X aria-hidden size={15} />
                </button>
              )}
            </li>
          ))}
          {rows.length < files.length && (
            <li className="border-t border-divider">
              <button type="button" onClick={() => setAll(true)} className="w-full px-3.5 py-2.5 text-left text-meta font-medium text-accent hover:bg-wash">Show all {files.length} files</button>
            </li>
          )}
        </ul>
      )}

      {canUpload && (
        <>
          <input ref={input} type="file" multiple hidden onChange={(e) => picked(e.currentTarget)} />
          <button type="button" disabled={busy || !!swapping} onClick={() => pick(null)}
            className={cx("flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface px-3 text-meta font-medium text-ink-3 transition-colors hover:border-mute-2 disabled:opacity-60", (files.length > 0 || (drive && !link)) && "mt-2")}>
            <Upload aria-hidden size={15} className="text-mute-2" />
            {busy ? "Uploading…" : swapping ? "Replacing…" : drive && !files.length ? "Upload files as well, or drop them here" : "Upload files, or drop them here"}
          </button>
          <details className="mt-1.5">
            <summary className="inline-flex h-6 w-fit cursor-pointer list-none items-center rounded-sm text-small text-mute-2 hover:text-ink [&::-webkit-details-marker]:hidden">Upload limits</summary>
            <UploadLimitsHint limits={limits} />
          </details>
        </>
      )}
    </section>
  );
}

type VersionRow = Awaited<ReturnType<typeof listVersions>>[number];

function History({ a }: { a: Asset }) {
  const { ws } = useApp();
  const [run, pending] = useAction();
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    listVersions(a.id).then((v) => alive && setVersions(v));
    return () => { alive = false; };
  }, [a.id, a.version]);
  const acts = ws.d.activity.filter((x) => x.type === "asset" && x.itemId === a.id);
  return (
    <div>
      <h3 className={SECTION}>Activity</h3>
      {acts.length ? (
        <ul className="m-0 mb-6 list-none rounded-xl border border-line px-4 py-1">
          {acts.map((x) => (
            <li key={x.id} className="flex items-start gap-3 border-t border-divider py-2.5 first:border-t-0">
              <Avatar initials={ws.user(x.userId).initials} size={22} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-body text-ink-3">{x.action.charAt(0).toUpperCase() + x.action.slice(1)}{x.field ? `: ${x.field}` : ""}</span>
                <span className="block text-small text-mute-2">{ws.first(x.userId)} · {ws.ago(x.createdAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 mb-6 rounded-xl border border-dashed border-line-strong px-6 py-5 text-center text-body text-mute-2">No changes recorded since this asset was created.</p>
      )}
      <h3 className={SECTION}>Earlier versions</h3>
      {versions === null && <div className="text-body text-mute-2">Loading…</div>}
      {versions && !versions.length && <div className="text-body text-mute-2">Every edit saves the version before it. Nothing has been edited here yet.</div>}
      {versions && versions.length > 0 && (
        <div className="rounded-xl border border-line px-4 py-1">
          {versions.map((v) => (
            <div key={v.id} className="flex items-center gap-3 border-t border-divider py-3 first:border-t-0">
              <span className="flex-none font-mono text-meta font-semibold text-mute-1">v{v.version}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-ink-3">{v.headline || v.name}</span>
                <span className="block text-small text-mute-2">Replaced {ws.ago(v.createdAt)}{v.userId ? ` by ${ws.first(v.userId)}` : ""}</span>
              </span>
              {ws.canChange(a) && <Btn size="sm" disabled={pending} onClick={() => run(restoreVersion, a.id, v.id)}>Restore</Btn>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Video up to 250 MB · Images 25 MB … · 1.2 GB of storage left" under the upload button. */
function UploadLimitsHint({ limits }: { limits: MyUploadLimits }) {
  const on = FILE_KINDS.filter((k) => limits.kinds[k.kind].allowed);
  const off = FILE_KINDS.filter((k) => !limits.kinds[k.kind].allowed);
  return (
    <p className="m-0 mt-2 text-small leading-[1.5] text-mute-3">
      Up to {limits.maxFiles} files at a time. {on.map((k) => `${k.label} ${sizeLabel(limits.kinds[k.kind].maxBytes)}`).join(" · ")}.
      {off.length > 0 && <> Not allowed: {off.map((k) => k.label.toLowerCase()).join(", ")}.</>}
      {limits.remainingBytes != null && <> <b className="font-semibold text-mute-1">{sizeLabel(limits.remainingBytes)}</b> of storage left.</>}
    </p>
  );
}
