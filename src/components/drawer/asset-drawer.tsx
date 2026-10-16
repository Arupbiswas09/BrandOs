"use client";

import { FILE_KINDS, checkBatch, kindOf, sizeLabel, type FileKind, type MyUploadLimits } from "@/lib/upload-policy";
import { useCallback, useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Archive, ArchiveRestore, ArrowLeft, Copy, Download, ExternalLink, Eye, File as FileIcon, FileArchive, FileAudio, FileImage, FileText, FileType, FileVideo, FolderOpen, History as HistoryIcon, ImagePlus,
  LayoutGrid, Library as LibraryIcon, Link2, ListChecks, MessageSquare, Pencil, Plus, RefreshCw, ScanEye, Terminal, Trash2, Type, Upload, type LucideIcon,
} from "lucide-react";
import type { Asset, FileRef } from "@/db/schema";
import { hexA, readable } from "@/lib/color";
import { ASSET_STATUS, CHANNEL_COLOR, REVIEW_COLOR } from "@/lib/constants";
import { href } from "@/lib/routes";
import { waitOn } from "@/lib/types";
import {
  addItem, approveItem, listVersions, moveItem, removeFile, removeItem, resetList, restoreVersion,
  setArchived, setStatus, toggleClientVisible, toggleItem, toggleLink, trackVisit,
} from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { Thread } from "@/components/discussion";
import { ArchivedNote, Avatar, Btn, ChangeNote, Chip, Eyebrow, Hint, cx } from "@/components/ui";
import { FOCUS } from "@/components/polish";
import { assetLink, assetPrimary } from "@/components/cards";
import { CardMenu, type CardMenuItem } from "@/components/card-menu";
import { ThumbnailPicker, imageFrom, intoText, useThumbnail } from "@/components/thumbnail-picker";
import { AiDraftButton } from "@/components/ai";
import { ProofView } from "@/components/proof";
import { PinLink, isPinned, proofFiles, type PinnedComment } from "@/components/proof-link";

const IMAGE = /^image\/(png|jpe?g|gif|webp|avif)$/;

type Tab = "overview" | "list" | "prompt" | "copy" | "proof" | "discussion" | "history" | "sharing";

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
      <div className="absolute inset-y-0 right-0 flex w-[560px] max-w-full animate-slide flex-col items-center justify-center gap-3 bg-surface p-10 text-center">
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
  const params = useSearchParams();
  // Files sit above the tabs now; old links to the Files tab land on the overview.
  const asked = params.get("tab");
  const [tab, setTab] = useState<Tab>(!asked || asked === "files" ? "overview" : (asked as Tab));
  useEffect(() => { void trackVisit("asset", a.id); }, [a.id]);
  // Which pin the proof view opens on. A new `n` remounts it, so a pinned note in the discussion can jump straight there.
  const [proofAt, setProofAt] = useState<{ fileKey?: string; pinId?: string; n: number }>(() => ({ pinId: params.get("pin") ?? undefined, n: 0 }));
  const goPin = useCallback((c: PinnedComment) => { setProofAt((p) => ({ fileKey: c.fileKey, pinId: c.id, n: p.n + 1 })); setTab("proof"); }, []);

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
  const preview = ws.previewOf(a);
  const canThumb = canEdit && ws.can("upload");
  const [picking, setPicking] = useState(false);
  const thumb = useThumbnail(`/api/assets/${a.id}/thumbnail`);

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

  const tabs: { key: Tab; label: string; icon: LucideIcon; count?: string | number }[] = [
    { key: "overview", label: "Overview", icon: LayoutGrid },
    ...(a.type === "Checklist" ? [{ key: "list" as Tab, label: "Checklist", icon: ListChecks, count: `${done}/${items.length}` }] : []),
    ...(a.type === "Prompt" ? [{ key: "prompt" as Tab, label: "Prompt", icon: Terminal }] : []),
    { key: "copy", label: "Copy", icon: Type },
    ...(canProof ? [{ key: "proof" as Tab, label: "Proof", icon: ScanEye, count: openPins }] : []),
    { key: "discussion", label: "Discussion", icon: MessageSquare, count: ws.openCount("asset", a.id) },
    { key: "history", label: "History", icon: HistoryIcon },
    { key: "sharing", label: "Client", icon: Eye },
  ];

  const editDraft = () => open({ kind: "asset", draft: { ...a, offerIds: offers.map((o) => o.id), copy: a.copy ?? { headline: "", body: "", cta: "" } }, step: 3 });
  const more: CardMenuItem[] = [
    ...(canThumb ? [{ kind: "item" as const, label: "Change thumbnail", icon: <ImagePlus aria-hidden size={16} className="text-mute-4" />, onSelect: () => setPicking(true) }] : []),
    ...(canEdit ? [{ kind: "item" as const, label: "Clone", icon: <Copy aria-hidden size={15} className="text-mute-4" />, onSelect: () => open({ kind: "clone", srcId: a.id, brandId: a.brandId, name: a.name + " (copy)", offerIds: [] }) }] : []),
    ...(ws.can("archive") ? [{ kind: "item" as const, label: a.archived ? "Restore" : "Archive", icon: a.archived ? <ArchiveRestore aria-hidden size={16} className="text-mute-4" /> : <Archive aria-hidden size={16} className="text-mute-4" />, onSelect: () => void run(setArchived, "asset", a.id, !a.archived) }] : []),
    ...(ws.can("del") ? [{ kind: "item" as const, label: "Delete", icon: <Trash2 aria-hidden size={16} />, danger: true, onSelect: () => open({ kind: "confirm", item: "asset", id: a.id, label: a.name }) }] : []),
  ];

  return (
    <PinLink.Provider value={goPin}>
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={a.name}>
      <div className="absolute inset-0 animate-fade bg-[rgba(16,22,20,.28)]" onClick={closeAsset} />
      <div data-scroll className="absolute inset-y-0 right-0 w-[560px] max-w-full animate-slide overflow-y-auto border-l border-line bg-surface shadow-card">
        <div className="sticky top-0 z-[2] flex flex-wrap items-center gap-2 border-b border-line bg-surface/95 px-4 py-3.5  sm:px-6">
          <button type="button" aria-label="Close" onClick={closeAsset} className="flex h-8 w-8 items-center justify-center rounded-lg text-mute-2 transition hover:bg-wash hover:text-ink"><ArrowLeft aria-hidden size={18} /></button>
          <span className="flex-1" />
          {canEdit && a.brandId && <Btn size="sm" onClick={() => open({ kind: "linkAsset", assetId: a.id })}><Link2 aria-hidden size={14} />Link to offers</Btn>}
          {canEdit && <Btn size="sm" variant="primary" onClick={editDraft}><Pencil aria-hidden size={14} />Edit</Btn>}
          {/* Clone, archive and the admin-only delete sit together out of the way of the everyday buttons. */}
          <CardMenu label="More asset actions" items={more} triggerClassName={TOP_MORE} />
        </div>

        <div className="px-5 pb-10 pt-5 sm:px-7">
          <Hero a={a} preview={preview} color={color} busy={thumb.busy} onChange={canThumb ? () => setPicking(true) : undefined} />

          <div className="mb-5">
            <Eyebrow className="mb-1">{cat === "campaign" ? "Campaign asset" : cat === "master" ? "Master file" : "Global asset"} · {a.type}</Eyebrow>
            <span className="block text-title font-semibold leading-[1.25] tracking-[-0.018em] text-ink">{a.name}</span>
            {a.short && <span className="mt-1 block text-body text-mute-2">{a.short}</span>}
            <span className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {!canEdit && <Chip color={ASSET_STATUS[a.status] ?? "#93A09A"}>{a.status}</Chip>}
              {b ? (
                <Link href={href.brand(b.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface py-0.5 px-2 text-small font-semibold text-mute-1 transition hover:border-accent hover:text-ink">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: b.primary }} />{b.name}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-0.5 text-small font-semibold text-mute-1"><LibraryIcon aria-hidden size={13} />Global Library</span>
              )}
              <span className="font-mono text-small text-mute-4">v{a.version}</span>
            </span>
          </div>

          {canEdit && (
            <div className="mb-5 flex flex-wrap items-center gap-1.5">
              <span className="eyebrow mr-1">Status</span>
              {(Object.keys(ASSET_STATUS) as Asset["status"][]).map((k) => {
                const on = a.status === k; const c = ASSET_STATUS[k];
                return (
                  <button key={k} type="button" aria-pressed={on} onClick={() => !on && run(setStatus, "asset", a.id, k)} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-meta font-medium transition hover:border-line-strong"
                    style={{ borderColor: on ? hexA(c, 0.45) : "var(--bos-border)", background: on ? hexA(c, 0.16) : "#FFF", color: on ? readable(c) : "#56645E" }}>
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: c }} />{k}
                  </button>
                );
              })}
            </div>
          )}

          {a.archived && <ArchivedNote className="mb-4">Archived. Offers that link to it still show it, greyed out.</ArchivedNote>}

          <ReviewBar kind="asset" item={a} />
          {a.changeNote && a.review === "Changes requested" && <ChangeNote className="mb-4">{a.changeNote}</ChangeNote>}

          <AttachedFiles a={a} onProof={proof.images.length ? () => setTab("proof") : undefined} onEdit={canEdit ? editDraft : undefined} />

          <div className="mb-5 flex gap-0.5 overflow-x-auto border-b border-line" role="tablist" aria-label="Asset sections">
            {tabs.map(({ key: k, label, icon: Icon, count }) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={cx("-mb-px inline-flex flex-none items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-body transition", tab === k ? "border-accent font-semibold text-ink" : "border-transparent font-medium text-mute-2 hover:text-ink")}>
                <Icon aria-hidden size={15} className={tab === k ? "text-accent" : "text-mute-4"} />
                {label}
                {count !== undefined && " "}
                {count !== undefined && <span className={cx("rounded-full px-1.5 py-px text-micro font-semibold tabular-nums leading-[1.5]", tab === k ? "bg-accent text-on-accent" : "bg-chip text-mute-3")}>{count}</span>}
              </button>
            ))}
          </div>

          {tab === "overview" && <Overview a={a} />}
          {tab === "list" && <Checklist a={a} />}
          {tab === "prompt" && <PromptTab a={a} />}
          {tab === "copy" && <CopyTab a={a} onEdit={editDraft} />}
          {tab === "proof" && (canProof ? <ProofView key={proofAt.n} a={a} fileKey={proofAt.fileKey} pinId={proofAt.pinId} /> : <Overview a={a} />)}
          {tab === "discussion" && <Thread kind="asset" id={a.id} />}
          {tab === "history" && <History a={a} />}
          {tab === "sharing" && <Sharing a={a} />}
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

const TOP_MORE = cx("flex h-[31px] w-[31px] items-center justify-center rounded-lg border border-line bg-surface text-mute-2 transition-colors hover:border-line-strong hover:text-ink", FOCUS);
const OVER = cx("flex h-8 w-8 items-center justify-center rounded-full border border-black/[.06] bg-surface text-ink-3 shadow-card transition-colors hover:text-accent", FOCUS);

/**
 * The picture at the top of the drawer: the thumbnail at 16:10, or a shorter
 * band with the type code when there is none. Download or Open sit over its
 * top-right corner; Change thumbnail over its bottom-right for people who can.
 */
function Hero({ a, preview, color, busy, onChange }: { a: Asset; preview: string | null; color: string; busy: boolean; onChange?: () => void }) {
  const { ws } = useApp();
  const primary = assetPrimary(a);
  const whole = ws.catOf(a) === "master";
  return (
    <div className={cx("group/hero relative mb-5 overflow-hidden rounded-xl border border-line bg-wash", preview ? "aspect-[16/10]" : "aspect-[16/6]")}>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file; the asset's name is the dialog's name
        <img src={preview} alt="" className={cx("h-full w-full transition-opacity", whole ? "object-contain p-6" : "object-cover", busy && "opacity-50")} />
      ) : (
        <span aria-hidden className={cx("flex h-full w-full items-center justify-center font-mono text-title font-bold tracking-[0.12em] transition-opacity", busy && "opacity-50")}
          style={{ background: hexA(color, 0.1), color: readable(color, 0.1) }}>{ws.codeOf(a)}</span>
      )}
      {primary && (
        <span className="absolute right-3 top-3 flex gap-1.5">
          {primary.kind === "download" ? (
            <a href={primary.href} download aria-label={`Download ${a.name}`} title={primary.title} className={OVER}><Download aria-hidden size={15} /></a>
          ) : (
            <a href={primary.href} target="_blank" rel="noreferrer" aria-label={`Open ${a.name}`} title={primary.title} className={OVER}><ExternalLink aria-hidden size={15} /></a>
          )}
        </span>
      )}
      {onChange && (
        <button type="button" onClick={onChange} title="Pasting a screenshot while this is open works too."
          className={cx("absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-black/[.06] bg-surface px-3 py-1.5 text-meta font-semibold text-ink-3 shadow-card transition hover:text-accent",
            "opacity-0 group-hover/hero:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100", FOCUS)}>
          <ImagePlus aria-hidden size={14} />Change thumbnail
        </button>
      )}
    </div>
  );
}

/** One quiet line of the details list: a small mono label over its value, no boxes. */
function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-micro text-mute-4">{label}</dt>
      <dd className="m-0 mt-0.5 break-words text-meta font-medium text-ink-2">{children}</dd>
    </div>
  );
}

export function ReviewBar({ kind, item }: { kind: "asset" | "offer"; item: Pick<Asset, "id" | "review" | "reviewerId" | "ownerId"> }) {
  const { ws, open } = useApp();
  const [run, pending] = useAction();
  const w = waitOn(item);
  const tone = w ? (w.act === "review" ? "#8A6A12" : "#C2410C") : null;
  const label = item.review === "None" ? "Not reviewed" : item.review;
  // One row: where it stands on the left, said once, and what you can do about it on the right.
  return (
    <div
      className={cx("flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border px-3.5 py-2.5", kind === "asset" ? "mb-4 rounded-xl" : "mb-3 rounded-xl bg-surface px-4 py-3")}
      style={{ background: tone ? hexA(tone, 0.08) : kind === "asset" ? "transparent" : "#FFFFFF", borderColor: tone ? hexA(tone, 0.35) : "var(--bos-border)" }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Chip color={REVIEW_COLOR[item.review]}>{label}</Chip>
        {w && (
          <span className="min-w-0 text-body font-semibold text-ink-3">
            {w.verb} — {ws.user(w.who).name}{w.who === ws.me.id ? " (you)" : ""}
          </span>
        )}
      </span>
      <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {ws.canChange(item) && (!ws.can("review") || item.review !== "In review") && (
          <Btn size="sm" disabled={pending} onClick={() => open({ kind: "sendReview", item: kind, id: item.id })}>{item.review === "In review" ? "Reassign" : "Send for review"}</Btn>
        )}
        {ws.can("review") && (
          <>
            {ws.canChange(item) && item.review === "In review" && <Btn size="sm" disabled={pending} onClick={() => open({ kind: "sendReview", item: kind, id: item.id })}>Reassign</Btn>}
            <Btn size="sm" variant="change" disabled={pending} onClick={() => open({ kind: "reqChanges", item: kind, id: item.id })}>Request changes</Btn>
            {item.review !== "Approved" && <Btn size="sm" variant="approve" disabled={pending} onClick={() => run(approveItem, kind, item.id)}>Approve</Btn>}
          </>
        )}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- tabs */

function Overview({ a }: { a: Asset }) {
  const { ws, open } = useApp();
  const router = useRouter();
  const [run] = useAction();
  const offers = ws.linkedOffers(a.id);
  const src = a.clonedFromId ? ws.asset(a.clonedFromId) : null;
  const b = ws.brand(a.brandId);
  const canLink = ws.canChange(a) && !!a.brandId;
  const section = (label: string, body: React.ReactNode) => (
    <div className="mb-4"><Eyebrow className="mb-1.5">{label}</Eyebrow>{body}</div>
  );
  return (
    <div>
      <Eyebrow className="mb-2.5">{offers.length === 0 ? "Not linked to any offer" : `Linked to ${offers.length} offer${offers.length > 1 ? "s" : ""}`}</Eyebrow>
      <div className="mb-6 flex flex-col gap-2">
        {offers.map((o) => (
          <div key={o.id} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-3">
            <button type="button" onClick={() => router.push(href.offer(o.id))} className="flex-1 text-left text-body font-medium text-ink hover:text-accent">{o.name}</button>
            <Chip color={ws.segColor(o.segment, o.brandId)} size="xs">{o.segment}</Chip>
            {ws.canChange(a) && <button type="button" onClick={() => run(toggleLink, a.id, o.id)} className="flex-none px-1 py-0.5 text-meta text-mute-5 hover:text-danger">Unlink</button>}
          </div>
        ))}
        {!offers.length && a.brandId && (
          <div className="rounded-xl border border-dashed border-[rgba(201,154,46,.5)] bg-[rgba(201,154,46,.07)] p-4 text-body text-warn-ink">
            This asset is not linked to anything, so nobody will find it by walking through the rooms.
          </div>
        )}
        {/* The same asset can serve any number of offers; linking it to one more never copies it. */}
        {canLink && (
          <button type="button" onClick={() => open({ kind: "linkAsset", assetId: a.id })}
            className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-left text-body font-medium text-mute-2 transition-colors hover:border-accent hover:text-ink">
            <Plus aria-hidden size={15} />{offers.length ? "Link to another offer" : "Link to an offer"}
          </button>
        )}
        {!offers.length && !a.brandId && <div className="text-body text-mute-2">Global Library items are not linked to offers. Clone one into a brand when you run it.</div>}
      </div>
      {src && (
        <div className="mb-5 rounded-xl bg-wash px-3.5 py-3 text-body text-mute-1">
          Cloned from <button type="button" className="font-semibold text-ink hover:underline" onClick={() => ws.asset(src.id) && router.push(`?asset=${src.id}`, { scroll: false })}>{src.name}</button>
        </div>
      )}
      {/* A link that already sits with the files at the top is not repeated here. */}
      {a.url && !linkOnTop(a) && section("Live URL", <a href={assetLink(a)!.href} target="_blank" rel="noreferrer" className="break-all text-body text-accent hover:underline">{a.url}</a>)}
      {a.tags.length > 0 && section("Tags", <div className="flex flex-wrap gap-1">{a.tags.map((t) => <span key={t} className="rounded-sm bg-chip px-2 py-1 text-meta text-mute-1">{t}</span>)}</div>)}
      {a.ctaId && ws.cta(a.ctaId) && section("Call to action", <CtaButton id={a.ctaId} />)}
      {a.specs && section("Creative specs", <div className="text-body leading-[1.55] text-ink-3">{a.specs}</div>)}
      {a.audienceNotes && section("Audience notes", <div className="text-body leading-[1.55] text-ink-3">{a.audienceNotes}</div>)}
      {a.aiPrompt && section("AI prompt used", <div className="text-body italic leading-[1.55] text-mute-1">{a.aiPrompt}</div>)}
      {a.notes && section("Notes", <div className="whitespace-pre-wrap text-body leading-[1.6] text-ink-3 text-pretty">{a.notes}</div>)}

      <Eyebrow className="mb-3 mt-8 border-t border-divider pt-5">Details</Eyebrow>
      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3.5">
        <Meta label="Brand">{b ? <button type="button" className="text-left hover:text-accent" onClick={() => router.push(href.brand(b.id))}>{b.name}</button> : "Global Library"}</Meta>
        <Meta label="Type">{a.type}</Meta>
        <Meta label="Channel"><Chip color={CHANNEL_COLOR[a.channel] ?? "#46534D"}>{a.channel}</Chip></Meta>
        <Meta label="Visibility">{a.clientVisible ? "Visible to client" : "Internal only"}</Meta>
        <Meta label="Delivery">{a.delivery || "None"}</Meta>
        <Meta label="Access">{a.gated ? "Gated — requested, then sent" : "Open"}</Meta>
        <Meta label="Owner">{ws.user(a.ownerId).name}</Meta>
        <Meta label="Version">v{a.version} · updated {ws.ago(a.updatedAt)}</Meta>
      </dl>
    </div>
  );
}

/** Whether the asset's link shows with its files at the top: always for a Drive link, and for any asset that is only a link. */
const linkOnTop = (a: Asset) => !!assetLink(a) && (a.type === "Drive link" || !(a.files ?? []).some((f) => f.key));

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
        <span className="h-1.5 flex-1 overflow-hidden rounded-sm bg-avatar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span className="block h-1.5 rounded-sm bg-accent transition-[width] duration-300" style={{ width: pct + "%" }} />
        </span>
        {canTick && <button type="button" onClick={() => run(resetList, a.id)} className="flex-none px-1 py-0.5 text-meta text-mute-3 hover:text-ink">Reset</button>}
      </div>
      {items.length > 0 && done === items.length && (
        <div className="mb-3 rounded-xl border border-[rgba(47,143,98,.28)] bg-[rgba(47,143,98,.09)] px-4 py-3 text-body text-[#1F6F4A]">Every check is done.</div>
      )}
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {items.map((it, idx) => (
          <div key={idx} className="group flex items-start gap-3 border-t border-divider px-4 py-3 first:border-t-0">
            <button type="button" role="checkbox" aria-checked={it.done} disabled={!canTick} onClick={() => run(toggleItem, a.id, idx)}
              className="mt-px flex h-[19px] w-[19px] flex-none items-center justify-center rounded-sm text-meta font-bold text-white disabled:cursor-default"
              style={{ border: `1.5px solid ${it.done ? "var(--bos-accent)" : "#C9D3CE"}`, background: it.done ? "var(--bos-accent)" : "#FFF" }}>
              {it.done ? "✓" : ""}
            </button>
            <span className="mt-1 flex-none font-mono text-meta text-mute-5">{String(idx + 1).padStart(2, "0")}</span>
            <span className="flex-1 text-lead leading-[1.5] text-pretty" style={{ color: it.done ? "#56645E" : "#2A3833", textDecoration: it.done ? "line-through" : "none" }}>{it.text}</span>
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
          : "This is the master copy. The ticks show where the team last left it — ask an editor if something needs changing."}
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
        <span className="eyebrow text-micro">Use for</span>
        <span className="text-body font-semibold">{a.promptFor || "—"}</span>
        <span className="flex-1" />
        <Btn size="sm" className="font-semibold text-accent hover:border-accent" onClick={() => copy(a.prompt, "prompt")} disabled={!a.prompt}>{copied === "prompt" ? "Copied" : "Copy prompt"}</Btn>
      </div>
      <div className="rounded-xl border border-line bg-[#F7F9F8] px-5 py-4">
        <pre className="m-0 whitespace-pre-wrap break-words font-[family-name:var(--font-code)] text-body leading-[1.75] text-ink-2">{a.prompt || "No prompt written yet."}</pre>
      </div>
      <Hint className="mt-3.5">
        {ws.can("edit")
          ? "Square brackets are the bits you swap per job. This is the finalised version — if you improve it, edit it here rather than keeping a better one in your notes."
          : "Square brackets are the bits you swap per job. Copy it and fill them in — this is the finalised version the team agreed on."}
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
            <Btn variant="primary" onClick={onEdit}>Write the copy</Btn>
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
          <div><div className="mb-1 text-small text-mute-4">Call to action</div><div className="text-lead font-semibold">{c!.cta || "—"}</div></div>
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
 * The asset's files (and, for a Drive link or a link-only asset, its link),
 * right under the review bar so nobody has to open a tab to find them.
 * Download, Download all, Replace and upload all happen here.
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
  const showLink = linkOnTop(a);
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

  return (
    <section
      aria-labelledby={headId}
      onDragOver={(e) => { if (canUpload && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false); }}
      onDrop={(e) => { if (!canUpload) return; e.preventDefault(); setDrag(false); void upload(Array.from(e.dataTransfer.files)); }}
      className={cx("mb-6 rounded-xl transition", drag && "outline-2 outline-offset-4 outline-accent outline-dashed")}
    >
      <div className="mb-2 flex min-h-[30px] flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 id={headId} className="eyebrow m-0">
          {files.length ? <>Files <span className="text-mute-4">· {files.length}</span></> : showLink ? (drive ? "Drive link" : "Link") : "Files"}
        </h3>
        <span className="flex-1" />
        {onProof && <button type="button" onClick={onProof} className="text-meta font-semibold text-accent hover:underline">Open proof view</button>}
        {stored.length > 1 && (
          <a href={`/api/assets/${a.id}/download`} download aria-label={`Download all ${stored.length} files as a zip`} className={cx(ROW_BTN, "text-accent")}>
            <Download aria-hidden size={14} />Download all
          </a>
        )}
      </div>

      {showLink && link && (
        <a href={link.href} target="_blank" rel="noreferrer" className={cx("mb-2 flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors hover:border-accent sm:px-3.5", FOCUS)}>
          <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-soft text-accent">{drive ? <FolderOpen size={17} strokeWidth={1.8} /> : <Link2 size={17} strokeWidth={1.8} />}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-body font-semibold text-ink">{link.label}</span>
            <span className="block truncate font-mono text-small text-mute-4">{a.url}</span>
          </span>
          <ExternalLink aria-hidden size={16} className="flex-none text-mute-4" />
        </a>
      )}
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
                <span className="block font-mono text-small text-mute-4">{[f.size, extOf(f.name)].filter(Boolean).join(" · ")}</span>
              </span>
              {f.url ? (
                <a href={f.url} download={f.name} aria-label={`Download ${f.name}`} title={`Download ${f.name}`} className={cx(ROW_BTN, "text-accent")}>
                  <Download aria-hidden size={14} /><span className="hidden sm:inline">Download</span>
                </a>
              ) : (
                <span title="Listed for reference. The file itself was never uploaded here." className="flex-none rounded-lg border border-dashed border-line px-3 py-1 text-meta text-mute-4">Not uploaded</span>
              )}
              {canUpload && f.key && (
                <button type="button" aria-label={`Replace ${f.name}`} title={`Replace ${f.name} with a new file`} disabled={busy || !!swapping} onClick={() => pick(f.key!)} className={cx(ROW_BTN, "text-ink-3")}>
                  <RefreshCw aria-hidden size={14} className={cx(swapping === f.key && "animate-spin motion-reduce:animate-none")} /><span className="hidden sm:inline">Replace</span>
                </button>
              )}
              {canEdit && <button type="button" aria-label={`Remove ${f.name}`} onClick={() => run(removeFile, a.id, f.name)} className="flex-none px-1 text-body text-line-strong opacity-0 transition hover:text-danger group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100">✕</button>}
            </li>
          ))}
          {rows.length < files.length && (
            <li className="border-t border-divider">
              <button type="button" onClick={() => setAll(true)} className="w-full px-3.5 py-2.5 text-left text-body font-semibold text-accent hover:bg-wash">Show all {files.length} files</button>
            </li>
          )}
        </ul>
      )}
      {!files.length && !showLink && !drive && !canUpload && <p className="m-0 text-body text-mute-3">No files attached yet.</p>}

      {canUpload && (
        <>
          <input ref={input} type="file" multiple hidden onChange={(e) => picked(e.currentTarget)} />
          <button type="button" disabled={busy || !!swapping} onClick={() => pick(null)}
            className={cx("flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface px-3 py-2.5 text-body font-semibold text-ink-3 transition-colors hover:border-mute-2 disabled:opacity-60", (files.length > 0 || showLink) && "mt-2")}>
            <Upload aria-hidden size={15} className="text-mute-4" />
            {busy ? "Uploading…" : swapping ? "Replacing…" : drive && !files.length ? "Upload files as well — or drop them here" : "Upload files — or drop them here"}
          </button>
          <details className="mt-1.5">
            <summary className="w-fit cursor-pointer list-none text-small text-mute-3 hover:text-ink [&::-webkit-details-marker]:hidden">Upload limits</summary>
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
      <Eyebrow className="mb-2.5">Activity</Eyebrow>
      {acts.length ? (
        <div className="mb-6 rounded-xl border border-line px-4 py-1">
          {acts.map((x) => (
            <div key={x.id} className="flex items-center gap-3 border-t border-divider py-3 first:border-t-0">
              <Avatar initials={ws.user(x.userId).initials} size={20} />
              <span className="flex-1 text-body text-ink-3">{ws.first(x.userId)} {x.action}{x.field ? ` — ${x.field}` : ""}</span>
              <span className="flex-none text-meta text-[#5A6862]">{ws.ago(x.createdAt)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-dashed border-line-strong p-9 text-center text-body text-mute-2">No changes recorded since this asset was created.</div>
      )}
      <Eyebrow className="mb-2.5">Earlier versions</Eyebrow>
      {versions === null && <div className="text-body text-mute-4">Loading…</div>}
      {versions && !versions.length && <div className="text-body text-mute-3">Every edit saves the version before it. Nothing has been edited here yet.</div>}
      {versions && versions.length > 0 && (
        <div className="rounded-xl border border-line px-4 py-1">
          {versions.map((v) => (
            <div key={v.id} className="flex items-center gap-3 border-t border-divider py-3 first:border-t-0">
              <span className="flex-none font-mono text-meta font-semibold text-mute-1">v{v.version}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-ink-3">{v.headline || v.name}</span>
                <span className="block text-meta text-mute-4">replaced {ws.ago(v.createdAt)}{v.userId ? ` by ${ws.first(v.userId)}` : ""}</span>
              </span>
              {ws.canChange(a) && <Btn size="sm" disabled={pending} onClick={() => run(restoreVersion, a.id, v.id)}>Restore</Btn>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Sharing({ a }: { a: Asset }) {
  const { ws, open } = useApp();
  const [run, pending] = useAction();
  const label = a.clientVisible ? "Visible to client" : "Internal only";
  return (
    <div>
      <div className="rounded-xl border border-line p-4">
        <div className="flex items-center gap-3.5">
          <div className="flex-1">
            <div className="mb-1 text-lead font-semibold">Cleared to send</div>
            <div className="text-body leading-[1.5] text-mute-2">Marks this as signed off and safe to put in front of the client.</div>
          </div>
          {ws.can("share") ? (
            <button type="button" role="switch" aria-checked={a.clientVisible} disabled={pending} onClick={() => run(toggleClientVisible, a.id)}
              className={cx("flex flex-none items-center gap-2 rounded-lg border px-3 py-1.5 text-body font-medium", a.clientVisible ? "border-ok/40 bg-[rgba(47,143,98,.08)] text-ok" : "border-line bg-surface text-ink-3 hover:border-mute-2")}>
              <span className={cx("h-2 w-2 rounded-full", a.clientVisible ? "bg-ok" : "bg-line-strong")} />{label}
            </button>
          ) : (
            <span className="flex-none rounded-lg bg-chip px-3 py-1.5 text-body font-semibold text-mute-1">{label}</span>
          )}
        </div>
        {a.clientVisible && a.review !== "Approved" && (
          <div className="mt-3 rounded-lg bg-[rgba(201,154,46,.08)] px-3 py-2 text-body text-warn-ink">Cleared to send, but nobody has approved it yet.</div>
        )}
      </div>
      <Hint className="mt-3.5">Assets cleared to send appear for people with the Client role and on the brand&apos;s client share page. Every other asset stays internal.</Hint>
      {a.brandId && ws.can("share") && <Btn className="mt-3" onClick={() => open({ kind: "share", brandId: a.brandId! })}>Manage client links</Btn>}
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
