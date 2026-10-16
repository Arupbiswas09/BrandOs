"use client";

import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, ExternalLink, Globe, Link2, Maximize2, Play, X } from "lucide-react";
import type { Asset, FileRef } from "@/db/schema";
import { linkEmbed, linkParts, webUrl, type Embed } from "@/lib/embeds";
import { extOf, previewKind } from "@/lib/files";
import { Btn, IconBtn, cx } from "@/components/ui";
import { FOCUS } from "@/components/polish";
import { KindIcon, LINK_BTN } from "./parts";

/*
 * Showing a file or a link where it is, without opening anything else:
 * images fit and open full size, PDFs read inline, video and audio play,
 * text shows its first lines, and anything else is a clear file card with
 * Download. Links from Figma, Google, YouTube, Vimeo and Loom preview in a
 * frame, but only once someone asks: nothing third-party loads before that.
 */

const TEXT_LINES = 200;
const TEXT_BYTES = 256 * 1024;

/** The row under every preview: what the file is, and what you can do with it. */
function Bar({ name, meta, children }: { name: string; meta?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface px-3 py-2.5 sm:px-3.5">
      {/* On a phone the buttons go under the name rather than squeezing it. */}
      <span className="min-w-0 flex-1 basis-56">
        <span className="block truncate text-body font-medium text-ink">{name}</span>
        {meta && <span className="block truncate font-mono text-small text-mute-2">{meta}</span>}
      </span>
      {children && <span className="flex flex-none flex-wrap items-center gap-2">{children}</span>}
    </div>
  );
}

function DownloadLink({ f }: { f: FileRef }) {
  if (!f.url) return null;
  return (
    <a href={f.url} download={f.name} aria-label={`Download ${f.name}`} className={cx(LINK_BTN, FOCUS)}>
      <Download aria-hidden size={14} />Download
    </a>
  );
}

const metaOf = (f: FileRef) => [extOf(f.name), f.size].filter(Boolean).join(" · ");

/**
 * A preview of one of an asset's files, picked by its type. `asset` gives a
 * video its poster (the asset's thumbnail) and pictures their description.
 */
export function FilePreview({ file, asset, className }: { file: FileRef; asset?: Pick<Asset, "name" | "thumbnail"> | null; className?: string }) {
  // Only stored files (served by /api/files, which checks access) are shown inline; a listed entry with an outside address is a link.
  if (!file.key && file.url) return <LinkPreview url={file.url} title={file.name} className={className} />;
  const kind = file.key && file.url ? previewKind(file) : "other";
  return (
    <figure className={cx("m-0 overflow-hidden rounded-xl border border-line bg-wash", className)} data-preview={kind}>
      {kind === "image" && <ImagePreview f={file} alt={asset?.name ? `${asset.name}: ${file.name}` : file.name} />}
      {kind === "pdf" && <PdfPreview f={file} />}
      {kind === "video" && <VideoPreview f={file} poster={asset?.thumbnail?.url ?? undefined} />}
      {kind === "audio" && <AudioPreview f={file} />}
      {kind === "text" && <TextPreview f={file} />}
      {kind === "other" && <FileCard f={file} />}
    </figure>
  );
}

/* ---------------------------------------------------------------- images */

function ImagePreview({ f, alt }: { f: FileRef; alt: string }) {
  const [open, setOpen] = useState<null | { animate: boolean }>(null);
  const src = `${f.url}?inline=1`;
  // A click from the keyboard (Enter or Space) has detail 0: open at once, no motion.
  const show = (e: ReactMouseEvent) => setOpen({ animate: e.detail > 0 });
  return (
    <>
      <button type="button" onClick={show} aria-label={`View ${f.name} full size`}
        className="flex w-full cursor-zoom-in items-center justify-center bg-wash p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent sm:p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file served by /api/files */}
        <img src={src} alt={alt} loading="lazy" decoding="async" className="max-h-[420px] w-auto max-w-full rounded-sm object-contain" />
      </button>
      <Bar name={f.name} meta={metaOf(f)}>
        <Btn size="sm" onClick={show}><Maximize2 aria-hidden size={14} />Full size</Btn>
        <DownloadLink f={f} />
      </Bar>
      {open && <Lightbox src={src} alt={alt} name={f.name} animate={open.animate} onClose={() => setOpen(null)} />}
    </>
  );
}

/** The picture at full size over everything. Esc, the close button or a click outside the picture closes it. */
function Lightbox({ src, alt, name, animate, onClose }: { src: string; alt: string; name: string; animate: boolean; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Only this closes: the drawer or page behind stays as it is.
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
      // One control inside, so focus stays on it.
      if (e.key === "Tab") { e.preventDefault(); close.current?.focus(); }
    };
    window.addEventListener("keydown", keys, true);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", keys, true); document.body.style.overflow = overflow; back?.focus?.(); };
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className={cx("fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-ink/95 p-4 sm:p-8", animate && "animate-fade")}>
      <div className="absolute right-3 top-3 sm:right-4 sm:top-4">
        <IconBtn ref={close} label="Close" onClick={onClose} className="bg-surface text-ink hover:bg-surface hover:text-ink"><X /></IconBtn>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file */}
      <img src={src} alt={alt} className="max-h-[calc(100vh-112px)] max-w-full rounded-sm object-contain" />
      <p id={titleId} className="m-0 max-w-full truncate text-meta text-surface">{name}</p>
    </div>,
    document.body,
  );
}

/* ---------------------------------------------------------------- PDF */

function PdfPreview({ f }: { f: FileRef }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const src = `${f.url}?inline=1`;
  const full = () => {
    const el = frame.current;
    // Phones cannot put a frame full screen; the browser's own viewer in a new tab is the full screen there.
    if (el?.requestFullscreen && document.fullscreenEnabled) void el.requestFullscreen().catch(() => window.open(src, "_blank", "noopener"));
    else window.open(src, "_blank", "noopener");
  };
  return (
    <>
      <div className="aspect-[16/10] w-full bg-surface">
        <iframe ref={frame} src={src} title={f.name} loading="lazy" className="block h-full w-full border-0" />
      </div>
      <Bar name={f.name} meta={metaOf(f)}>
        <Btn size="sm" onClick={full}><Maximize2 aria-hidden size={14} />Open full screen</Btn>
        <DownloadLink f={f} />
      </Bar>
    </>
  );
}

/* ---------------------------------------------------------------- video and audio */

function VideoPreview({ f, poster }: { f: FileRef; poster?: string }) {
  return (
    <>
      <div className="flex justify-center bg-ink">
        <video controls preload="metadata" playsInline poster={poster} src={f.url} aria-label={f.name} className="block max-h-[480px] w-full" />
      </div>
      <Bar name={f.name} meta={metaOf(f)}><DownloadLink f={f} /></Bar>
    </>
  );
}

function AudioPreview({ f }: { f: FileRef }) {
  return (
    <>
      <div className="bg-surface px-3 py-4 sm:px-4">
        <audio controls preload="metadata" src={f.url} aria-label={f.name} className="block w-full" />
      </div>
      <Bar name={f.name} meta={metaOf(f)}><DownloadLink f={f} /></Bar>
    </>
  );
}

/* ---------------------------------------------------------------- text */

type TextState = { status: "loading" } | { status: "ready"; text: string; cut: boolean } | { status: "failed" };

/** Reads only the start of the file: enough for 200 lines, never the whole of a large export. */
async function firstLines(url: string, signal: AbortSignal): Promise<{ text: string; cut: boolean }> {
  const res = await fetch(url, { signal, credentials: "same-origin" });
  if (!res.ok || !res.body) throw new Error(String(res.status));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "", bytes = 0, more = true;
  while (more) {
    const { value, done } = await reader.read();
    if (done) { more = false; break; }
    bytes += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (bytes >= TEXT_BYTES || text.split("\n").length > TEXT_LINES) break;
  }
  if (more) await reader.cancel().catch(() => {});
  else text += decoder.decode();
  const lines = text.split("\n");
  const cut = more || lines.length > TEXT_LINES;
  return { text: lines.slice(0, TEXT_LINES).join("\n"), cut };
}

function TextPreview({ f }: { f: FileRef }) {
  const [state, setState] = useState<TextState>({ status: "loading" });
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ctl = new AbortController();
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      firstLines(f.url!, ctl.signal)
        .then((r) => setState({ status: "ready", ...r }))
        .catch(() => { if (!ctl.signal.aborted) setState({ status: "failed" }); });
    };
    // Only fetched once it is on screen.
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") go();
    else {
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: "200px" });
      io.observe(el);
      return () => { io.disconnect(); ctl.abort(); };
    }
    return () => ctl.abort();
  }, [f.url]);
  return (
    <>
      <div ref={box} className="bg-surface">
        {state.status === "loading" && <p className="m-0 px-4 py-6 text-meta text-mute-2">Loading the first lines…</p>}
        {state.status === "failed" && <p className="m-0 px-4 py-6 text-meta text-mute-2">The preview did not load. Download the file to read it.</p>}
        {state.status === "ready" && (
          <pre tabIndex={0} aria-label={`First lines of ${f.name}`} data-scroll
            className="m-0 max-h-[360px] overflow-y-auto whitespace-pre-wrap px-4 py-3 font-mono text-small leading-[1.6] text-ink-3 [overflow-wrap:anywhere] focus-visible:outline-offset-[-2px]">
            {state.text || "This file is empty."}
          </pre>
        )}
      </div>
      <Bar name={f.name} meta={[metaOf(f), state.status === "ready" && state.cut ? `First ${TEXT_LINES} lines` : ""].filter(Boolean).join(" · ")}>
        <DownloadLink f={f} />
      </Bar>
    </>
  );
}

/* ---------------------------------------------------------------- anything else */

function FileCard({ f }: { f: FileRef }) {
  return (
    <div className="flex flex-wrap items-center gap-3 bg-surface px-3 py-3 sm:px-4 sm:py-4">
      <span aria-hidden className="flex size-12 flex-none items-center justify-center rounded-lg bg-chip text-mute-3"><KindIcon name={f.name} size={22} strokeWidth={1.6} /></span>
      <span className="min-w-0 flex-1 basis-44">
        <span className="block truncate text-body font-semibold text-ink">{f.name}</span>
        <span className="block text-meta text-mute-2">
          {f.url ? <>{metaOf(f) || "File"}. No preview for this kind of file; download it to open.</> : "Listed for reference. The file itself was never uploaded here."}
        </span>
      </span>
      <DownloadLink f={f} />
    </div>
  );
}

/* ---------------------------------------------------------------- links */

/** "Copy link", saying so for two seconds once it worked. */
function CopyLink({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Btn size="sm" onClick={() => navigator.clipboard?.writeText(href).then(() => setCopied(true), () => {})}>
      {copied ? <Check aria-hidden size={14} className="text-ok" /> : <Copy aria-hidden size={14} />}
      <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
    </Btn>
  );
}

function OpenLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cx(LINK_BTN, FOCUS)}>
      <ExternalLink aria-hidden size={14} />Open
    </a>
  );
}

/**
 * A preview of a link. Figma files, Google Docs, Sheets, Slides and Drive
 * files, YouTube, Vimeo and Loom show in a frame once "Load preview" is
 * pressed; any other link is a quiet card with where it goes.
 */
export function LinkPreview({ url, title, className }: { url: string; title?: string; className?: string }) {
  const u = webUrl(url);
  if (!u) return null;
  const embed = linkEmbed(u.href);
  return embed
    ? <EmbedPreview key={u.href} href={u.href} embed={embed} title={title} className={className} />
    : <LinkCard href={u.href} title={title} className={className} />;
}

function EmbedPreview({ href, embed, title, className }: { href: string; embed: Embed; title?: string; className?: string }) {
  const [on, setOn] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const { host, path } = linkParts(new URL(href));
  const from = new URL(embed.src).hostname.replace(/^www\./, "");
  const label = title || `${embed.provider} preview`;
  useEffect(() => { if (on) frame.current?.focus(); }, [on]);
  return (
    <figure className={cx("m-0 overflow-hidden rounded-xl border border-line bg-wash", className)} data-preview="embed" data-provider={embed.provider}>
      <div className={cx("relative w-full", embed.shape === "video" ? "aspect-video" : "aspect-[16/10]")}>
        {on ? (
          <iframe ref={frame} src={embed.src} title={label} loading="lazy" allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            allow={embed.shape === "video" ? "autoplay; encrypted-media; fullscreen; picture-in-picture" : "fullscreen; clipboard-write"}
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation allow-forms"
            className="absolute inset-0 block h-full w-full border-0 bg-surface" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="eyebrow">{embed.provider}</span>
            <Btn onClick={() => setOn(true)} aria-label={`Load preview from ${from}`}>
              {embed.shape === "video" ? <Play aria-hidden size={15} /> : <Maximize2 aria-hidden size={15} />}Load preview
            </Btn>
            <p className="m-0 max-w-[40ch] text-small text-mute-2 text-pretty">Nothing loads from {from} until you ask.</p>
          </div>
        )}
      </div>
      <Bar name={title || host} meta={title ? `${host}${path}` : path || undefined}>
        <OpenLink href={href} />
        <CopyLink href={href} />
      </Bar>
    </figure>
  );
}

function LinkCard({ href, title, className }: { href: string; title?: string; className?: string }) {
  const { host, path } = linkParts(new URL(href));
  const Icon = path ? Link2 : Globe;
  return (
    <figure className={cx("m-0 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-3 py-3 sm:px-4", className)} data-preview="link">
      <span aria-hidden className="flex size-10 flex-none items-center justify-center rounded-lg bg-soft text-accent"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="min-w-0 flex-1 basis-44">
        <span className="block truncate text-body font-semibold text-ink">{title || host}</span>
        <span className="block truncate font-mono text-small text-mute-2">{title ? `${host}${path}` : path || href}</span>
      </span>
      <span className="flex flex-none items-center gap-2">
        <OpenLink href={href} />
        <CopyLink href={href} />
      </span>
    </figure>
  );
}
