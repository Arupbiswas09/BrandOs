"use client";

import { FILE_KINDS, checkBatch, kindOf, sizeLabel, type FileKind, type MyUploadLimits } from "@/lib/upload-policy";
import { useCallback, useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Archive, ArchiveRestore, Copy, CopyPlus, Download, ExternalLink, Eye, EyeOff, File as FileIcon, FileArchive, FileAudio, FileImage, FileText, FileType, FileVideo, ImagePlus,
  Library as LibraryIcon, Link2, Pencil, Plus, RefreshCw, Trash2, Upload, X, type LucideIcon,
} from "lucide-react";
import type { Asset, FileRef } from "@/db/schema";
import { hexA, readable } from "@/lib/color";
import { ASSET_STATUS, CHANNEL_COLOR } from "@/lib/constants";
import { linkEmbed } from "@/lib/embeds";
import { previewKind, primaryPreview } from "@/lib/files";
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
import { LinkBtn, displayUrl, linkBtn, useCopyLink } from "@/components/link-button";
import { ReviewLine, StatusSelect } from "@/components/workflow";
import { CtaTag } from "@/components/cta-tag";
import { ThumbnailPicker, imageFrom, intoText, useThumbnail } from "@/components/thumbnail-picker";
import { AiDraftButton } from "@/components/ai";
import { ProofView } from "@/components/proof";
import { PinLink, isPinned, proofFiles, type PinnedComment } from "@/components/proof-link";
import { StarButton } from "@/components/features/stars/star-button";
import { useStarShortcut } from "@/components/features/stars/use-star-shortcut";
import { LinkStatus } from "@/components/features/links/link-status";
import { PagePictureButton } from "@/components/features/links/page-picture-button";
import { FileHistory } from "@/components/features/files/file-history";
import { FilePreview, LinkPreview } from "@/components/features/files/file-preview";

const IMAGE = /^image\/(png|jpe?g|gif|webp|avif)$/;

/** Who the daily link check's history lines are from (LINK_CHECKER in src/server/link-fetcher.ts): BrandOS itself, not a person. */
const LINK_CHECKER = "link-checker";

/** A stored file the browser can show in place: a picture, PDF, video, audio or text. */
const showable = (f: FileRef) => !!f.key && !!f.url && previewKind(f) !== "other";

/**
 * What the preview shows first, when there is something worth showing: a file
 * that can be shown in place, or a link that can be framed (Figma, Google,
 * YouTube, Vimeo, Loom). A plain web page is left out: the header already has
 * Open and Copy link for it, and a card saying the same again adds nothing.
 */
function previewOf(a: Asset): { kind: "file"; file: FileRef } | { kind: "link"; url: string } | null {
  const p = primaryPreview(a);
  if (!p) return null;
  if (p.kind === "file") return showable(p.file) ? p : null;
  return linkEmbed(p.url) ? p : null;
}

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
  useStarShortcut("asset", a.id, a.name);
  const [run] = useAction();
  const copy = useCopyLink();
  const params = useSearchParams();
  const pathname = usePathname();
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

  // The full preview stays folded away until someone asks, so the sections stay in reach.
  const first = previewOf(a);
  const [showing, setShowing] = useState(false);
  // A file chosen from the list; back to the first one when it is gone (replaced or removed).
  const [chosen, setChosen] = useState<string | null>(null);
  const chosenFile = (a.files ?? []).find((f) => f.key === chosen && showable(f)) ?? null;
  const previewId = useId();
  const previewBox = useRef<HTMLDivElement>(null);
  const showFile = (f: FileRef) => {
    setChosen(f.key ?? null);
    setShowing(true);
    requestAnimationFrame(() => previewBox.current?.scrollIntoView({ block: "nearest" }));
  };

  const tabs: { key: Tab; label: string; count?: string | number }[] = [
    { key: "overview", label: "Overview" },
    ...(a.type === "Checklist" ? [{ key: "list" as Tab, label: "Checklist", count: `${done}/${items.length}` }] : []),
    ...(a.type === "Prompt" ? [{ key: "prompt" as Tab, label: "Prompt" }] : []),
    { key: "copy", label: "Copy" },
    ...(canProof ? [{ key: "proof" as Tab, label: "Proof", count: openPins || undefined }] : []),
    { key: "discussion", label: "Discussion", count: openNotes || undefined },
    { key: "history", label: "History" },
  ];
  // ?assetTab= opens a section (?tab= belongs to the page underneath). Older links said ?tab=; that still
  // works when it names one of these sections, except on an offer page, whose own tabs include Discussion.
  // A section that no longer exists lands on the overview.
  const legacy = params.get("tab");
  const asked = params.get("assetTab") ?? (legacy === "discussion" && pathname.startsWith("/offers/") ? null : legacy);
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
    // A clone is new work owned by whoever makes it, so anyone who can create work may clone (a library master into a brand, say).
    ...(ws.can("edit") ? [{ kind: "item" as const, label: "Clone", icon: <CopyPlus aria-hidden size={16} className="text-mute-2" />, onSelect: () => open({ kind: "clone", srcId: a.id, brandId: a.brandId, name: a.name + " (copy)", offerIds: [] }) }] : []),
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
        {/*
          Close, what this is, and what you can do with it: one row where there is room. On a phone the
          worded actions take a second row under the name (star and "…" stay beside it), so they keep
          their words instead of shrinking to icons.
        */}
        <div ref={head} className="sticky top-0 z-[3] flex flex-wrap items-center gap-x-1.5 gap-y-2 border-b border-line bg-surface px-3 py-3 sm:flex-nowrap sm:px-4">
          <IconBtn label="Close" onClick={closeAsset} className="mr-0.5"><X aria-hidden /></IconBtn>
          <h2 title={a.name} className="m-0 mr-0.5 line-clamp-2 min-w-0 flex-1 text-body font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{a.name}</h2>
          <StarButton kind="asset" id={a.id} name={a.name} />
          {(link || file || canEdit) && (
            <div className="flex flex-none flex-wrap items-center gap-1.5 max-sm:order-last max-sm:basis-full max-sm:pl-10">
              {link && (
                <>
                  <LinkBtn variant="primary" href={link.href} target="_blank" rel="noreferrer" title={link.href}><ExternalLink aria-hidden size={15} />Open</LinkBtn>
                  <Btn size="sm" onClick={() => void copy(link.href)}><Copy aria-hidden size={14} />Copy link</Btn>
                </>
              )}
              {file && <LinkBtn variant="primary" href={file.href} download title={file.title}><Download aria-hidden size={15} />Download</LinkBtn>}
              {canEdit && <Btn size="sm" onClick={editDraft}><Pencil aria-hidden size={14} />Edit</Btn>}
            </div>
          )}
          <CardMenu label="More asset actions" items={more} triggerClassName={TOP_MORE} />
        </div>

        <div className="px-4 pb-10 pt-4 sm:px-6 sm:pt-5">
          {/*
            What it is, in one band: its picture at 16:10 (or the type code when there is none), then kind, the
            short line, brand, version and address. The picture opens the proof view, where it is shown large.
          */}
          <div className="mb-4 flex min-h-16 items-center gap-4">
            {preview ? (
              <Preview src={preview} contain={cat === "master"} busy={thumb.busy} onOpen={first ? () => setShowing((v) => !v) : undefined} />
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
              {first && (
                <button type="button" aria-expanded={showing} aria-controls={previewId} onClick={() => setShowing((v) => !v)} className={cx(linkBtn("quiet"), "-ml-1.5 mt-1", FOCUS)}>
                  {showing ? <EyeOff aria-hidden size={13} /> : <Eye aria-hidden size={13} />}{showing ? "Hide preview" : "Preview"}
                </button>
              )}
            </div>
          </div>

          {first && showing && (
            <div ref={previewBox} id={previewId} className="mb-4 scroll-mt-20">
              {chosenFile ? <FilePreview key={chosenFile.key} file={chosenFile} asset={a} />
                : first.kind === "file" ? <FilePreview key={first.file.key} file={first.file} asset={a} />
                : <LinkPreview url={first.url} title={a.name} />}
            </div>
          )}

          <LinkStatus asset={a} className="mb-4" />

          <dl className="m-0 mb-4 grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2.5 text-meta">
            <dt className="text-mute-2">Status</dt>
            <dd className="m-0 min-w-0"><StatusSelect value={a.status} colors={ASSET_STATUS} readOnly={!canEdit} onChange={(st) => void run(setStatus, "asset", a.id, st)} /></dd>
            <dt className="text-mute-2">Review</dt>
            <dd className="m-0 min-w-0"><ReviewLine kind="asset" item={a} /></dd>
          </dl>
          {a.changeNote && a.review === "Changes requested" && <ChangeNote className="mb-4">{a.changeNote}</ChangeNote>}
          {a.archived && (
            <ArchivedNote className="mb-4">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="min-w-0 flex-1 basis-48">Archived. Offers that link to it still show it, greyed out.</span>
                {ws.can("archive") && <Btn size="sm" onClick={() => void run(setArchived, "asset", a.id, false)}><ArchiveRestore aria-hidden size={14} />Restore</Btn>}
              </span>
            </ArchivedNote>
          )}

          <AttachedFiles a={a} onProof={proof.images.length ? () => setTab("proof") : undefined} onEdit={canEdit ? editDraft : undefined} onPreview={showFile} />

          <div className="sticky z-[2] -mx-4 mb-5 border-b border-line bg-surface px-2 sm:-mx-6 sm:px-4" style={{ top: headH }}>
            <PanelTabs id="asset" label="Asset sections" value={tab} onChange={setTab} items={tabs} />
          </div>

          <div {...tabPanel("asset", tab)}>
            {tab === "overview" && <Overview a={a} />}
            {tab === "list" && <Checklist a={a} />}
            {tab === "prompt" && <PromptTab a={a} />}
            {tab === "copy" && <CopyTab a={a} onEdit={canEdit ? editDraft : undefined} />}
            {tab === "proof" && (canProof ? <ProofView key={proofAt.n} a={a} fileKey={proofAt.fileKey} pinId={proofAt.pinId} /> : <Overview a={a} />)}
            {tab === "discussion" && <Thread kind="asset" id={a.id} />}
            {tab === "history" && <History a={a} canRestore={canEdit} />}
          </div>
        </div>
      </div>
      {picking && (
        <ThumbnailPicker endpoint={`/api/assets/${a.id}/thumbnail`} subject={a.name} preview={preview} custom={!!a.thumbnail} resetLabel="Use first image"
          fallback={<span className="flex h-full w-full items-center justify-center font-mono text-body font-semibold tracking-[0.1em]" style={{ background: hexA(color, 0.1), color: readable(color, 0.1) }}>{ws.codeOf(a)}</span>}
          extra={<PagePictureButton asset={a} onDone={() => setPicking(false)} />}
          onClose={() => setPicking(false)} />
      )}
    </div>
    </PinLink.Provider>
  );
}

/**
 * The asset's picture at 16:10, small enough that the sections stay in reach.
 * With `onOpen` a click shows the full preview: a mouse shortcut for the
 * Preview button beside it, which is the one keyboard and screen readers use.
 */
function Preview({ src, contain, busy, onOpen }: { src: string; contain: boolean; busy: boolean; onOpen?: () => void }) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file; the asset's name is the dialog's name
    <img src={src} alt="" className={cx("h-full w-full transition-opacity", contain ? "object-contain p-2" : "object-cover", busy && "opacity-50")} />
  );
  const cls = "block aspect-[16/10] w-32 flex-none overflow-hidden rounded-lg border border-line bg-wash sm:w-48";
  return onOpen
    ? <button type="button" onClick={onOpen} tabIndex={-1} aria-hidden className={cx(cls, "cursor-zoom-in transition-[border-color,transform] duration-150 ease-snap hover:border-line-strong active:scale-[0.98]")}>{img}</button>
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
  const [run, pending] = useAction();
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
                  <Btn size="sm" disabled={pending} onClick={() => run(toggleLink, a.id, o.id)} aria-label={`Unlink from ${o.name}`} className="h-7 px-2.5">Unlink</Btn>
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
  // Changing the checks themselves is editing the asset: its owner (for contributors), and the library's own permission for a master.
  const canEdit = ws.canChange(a) && (!!a.brandId || ws.can("library"));
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
            {canEdit && (
              // Shown on hover or focus, and always on touch screens, which have no hover.
              <span className="flex flex-none gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                <button type="button" aria-label="Move up" title="Move up" disabled={idx === 0} onClick={() => run(moveItem, a.id, idx, -1)} className="px-1 text-meta text-mute-2 hover:text-ink disabled:opacity-30">↑</button>
                <button type="button" aria-label="Move down" title="Move down" disabled={idx === items.length - 1} onClick={() => run(moveItem, a.id, idx, 1)} className="px-1 text-meta text-mute-2 hover:text-ink disabled:opacity-30">↓</button>
                <button type="button" aria-label="Remove check" title="Remove check" onClick={() => run(removeItem, a.id, idx)} className="px-1 text-body text-mute-2 hover:text-danger">✕</button>
              </span>
            )}
          </div>
        ))}
        {!items.length && <div className="p-7 text-center text-body text-mute-2">No checks yet.</div>}
      </div>
      {canEdit && (
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
  const { toast } = useApp();
  const [copied, setCopied] = useState<string | null>(null);
  // "Copied" only once it really is; otherwise say so, rather than a button that seems to work and did nothing.
  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast("That could not be copied. Select the text and copy it instead.", "error");
      return;
    }
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
        {ws.canChange(a) && (!!a.brandId || ws.can("library"))
          ? "Square brackets are the bits you swap per job. This is the finalised version: if you improve it, edit it here rather than keeping a better one in your notes."
          : "Square brackets are the bits you swap per job. Copy it and fill them in; this is the finalised version the team agreed on."}
      </Hint>
    </div>
  );
}

function CopyTab({ a, onEdit }: { a: Asset; onEdit?: () => void }) {
  const { ws } = useApp();
  const [copied, copy] = useCopied();
  const c = a.copy;
  const has = !!(c && (c.headline || c.body));
  if (!has) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong p-9 text-center">
        <div className="mb-1 text-lead font-semibold">No copy written yet</div>
        <div className="mb-4 text-body text-mute-2">Headline, body and CTA live here so nobody has to open a design file to read them.</div>
        {onEdit && (
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
        {onEdit && a.brandId && ws.d.aiEnabled && <AiDraftButton assetId={a.id} label="Suggest a rewrite" />}
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
function AttachedFiles({ a, onProof, onEdit, onPreview }: { a: Asset; onProof?: () => void; onEdit?: () => void; onPreview: (f: FileRef) => void }) {
  const { ws, toast } = useApp();
  const [run, removePending] = useAction();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  // The file waiting on "Remove it from this asset?".
  const [removing, setRemoving] = useState<string | null>(null);
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

  /** Swaps one stored file for a new one in the same place in the list. The server keeps the old one as an earlier version of it. */
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
      else { toast(`Replaced ${old.name}. The earlier file is kept under its earlier versions.`); router.refresh(); }
    } catch {
      toast("The file could not be replaced. Check your connection and try again.", "error");
    } finally {
      setSwapping(null);
    }
  };

  /** Takes a file off the asset. The server saves the version before, so History can put it back. */
  const remove = async (name: string) => {
    const r = await run(removeFile, a.id, name);
    setRemoving(null);
    if (r.ok) toast(`Removed ${name}. To put it back, restore the version before in History.`);
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
            <li key={f.name} data-file={f.name} className="group border-t border-divider px-3 py-2 first:border-t-0 sm:px-3.5">
              <div className="flex items-center gap-3">
                <FileGlyph f={f} />
                <span className="min-w-0 flex-1">
                  {showable(f) ? (
                    <button type="button" onClick={() => onPreview(f)} aria-label={`Preview ${f.name}`} title={`Preview ${f.name}`}
                      className="block max-w-full truncate rounded-sm text-left text-body font-medium text-ink hover:underline">{f.name}</button>
                  ) : (
                    <span className="block truncate text-body font-medium text-ink">{f.name}</span>
                  )}
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
                  <button type="button" aria-label={`Replace ${f.name}`} title={`Replace ${f.name} with a new file. This one is kept as an earlier version.`} disabled={busy || !!swapping} onClick={() => pick(f.key!)} className={cx(ROW_BTN, "text-ink-3")}>
                    <RefreshCw aria-hidden size={14} className={cx(swapping === f.key && "animate-spin motion-reduce:animate-none")} /><span className="hidden sm:inline">Replace</span>
                  </button>
                )}
                {canEdit && (
                  <IconBtn size="sm" label={`Remove ${f.name}`} aria-expanded={removing === f.name} disabled={removePending} onClick={() => setRemoving(removing === f.name ? null : f.name)} className="hover:text-danger">
                    <X aria-hidden />
                  </IconBtn>
                )}
              </div>
              {removing === f.name && (
                <div role="group" aria-label={`Remove ${f.name}`} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setRemoving(null); } }}
                  className="ml-12 mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-wash px-3 py-2.5">
                  <p className="m-0 min-w-0 flex-1 basis-48 text-meta text-ink-3 text-pretty">Remove it from this asset? History keeps the version with it, so it can be put back.</p>
                  <span className="flex flex-wrap items-center gap-2">
                    <Btn size="sm" variant="ghost" disabled={removePending} onClick={() => setRemoving(null)}>Cancel</Btn>
                    {/* It appears because the person just asked to remove this file, so focus goes straight to it. */}
                    <Btn size="sm" variant="danger" autoFocus disabled={removePending} onClick={() => void remove(f.name)}>{removePending ? "Removing…" : "Remove"}</Btn>
                  </span>
                </div>
              )}
              {/* Lined up with the file name: glyph 36px plus the 12px gap. */}
              {f.key && <FileHistory assetId={a.id} fileKey={f.key} className="mt-1 pl-12" />}
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

function History({ a, canRestore }: { a: Asset; canRestore: boolean }) {
  const { ws, toast } = useApp();
  const [run, pending] = useAction();
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    listVersions(a.id).then((v) => alive && setVersions(v));
    return () => { alive = false; };
  }, [a.id, a.version]);
  const acts = ws.d.activity.filter((x) => x.type === "asset" && x.itemId === a.id);
  const who = (id: string) => (id === LINK_CHECKER ? { first: "BrandOS", initials: "B" } : { first: ws.first(id), initials: ws.user(id).initials });
  return (
    <div>
      <h3 className={SECTION}>Activity</h3>
      {acts.length ? (
        <ul className="m-0 mb-6 list-none rounded-xl border border-line px-4 py-1">
          {acts.map((x) => (
            <li key={x.id} className="flex items-start gap-3 border-t border-divider py-2.5 first:border-t-0">
              <Avatar initials={who(x.userId).initials} size={22} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-body text-ink-3">{x.action.charAt(0).toUpperCase() + x.action.slice(1)}{x.field ? `: ${x.field}` : ""}</span>
                <span className="block text-small text-mute-2">{who(x.userId).first} · {ws.ago(x.createdAt)}</span>
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
              {canRestore && <Btn size="sm" disabled={pending} onClick={async () => { if ((await run(restoreVersion, a.id, v.id)).ok) toast(`Restored v${v.version}. The version it replaced is kept here too.`); }}>Restore</Btn>}
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
