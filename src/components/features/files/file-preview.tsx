"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, ExternalLink, Globe, Link2, LogIn, Maximize2, RotateCw, X } from "lucide-react";
import type { Asset, FileRef } from "@/db/schema";
import { linkParts, linkPreview, webUrl, type Embed } from "@/lib/embeds";
import { extOf, previewKind } from "@/lib/files";
import { useApp } from "@/components/app/provider";
import { Btn, IconBtn, cx } from "@/components/ui";
import { FOCUS } from "@/components/polish";
import { linkBtn } from "@/components/link-button";
import { KindIcon, LINK_BTN, SourceIcon } from "./parts";

/*
 * Showing a file or a link where it is, without opening anything else:
 * images fit and open full size, PDFs read inline, video and audio play,
 * text shows its first lines, and anything else is a clear file card with
 * Download. Links from Figma, Google, YouTube, Vimeo and Loom show in a
 * frame once the preview is open (opening it is the ask: nothing
 * third-party loads before that), and a PDF on another website is a card
 * that opens it.
 */

const TEXT_LINES = 200;
const TEXT_BYTES = 256 * 1024;

/** The row under every preview: what the file is, and what you can do with it. `note` is one more line under the name. */
function Bar({ name, meta, note, children }: { name: string; meta?: string; note?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface px-3 py-2.5 sm:px-3.5">
      {/* On a phone the buttons go under the name rather than squeezing it. */}
      <span className="min-w-0 flex-1 basis-56">
        <span className="block truncate text-body font-medium text-ink">{name}</span>
        {meta && <span className="block truncate font-mono text-small text-mute-2">{meta}</span>}
        {note && <span className="mt-1 block text-small text-mute-2 text-pretty">{note}</span>}
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
  const { toast } = useApp();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  // Where the browser will not copy (no clipboard, or permission refused), say so rather than doing nothing.
  const copy = async () => {
    try { await navigator.clipboard.writeText(href); setCopied(true); }
    catch { toast("The link could not be copied. Open it and copy it from the address bar.", "error"); }
  };
  return (
    <Btn size="sm" onClick={() => void copy()}>
      {copied ? <Check aria-hidden size={14} className="text-ok" /> : <Copy aria-hidden size={14} />}
      <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
    </Btn>
  );
}

function OpenLink({ href, label = "Open", primary }: { href: string; label?: string; primary?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cx(primary ? linkBtn("primary") : LINK_BTN, FOCUS)}>
      <ExternalLink aria-hidden size={14} />{label}
    </a>
  );
}

/**
 * A preview of a link. Figma files, Google Docs, Sheets, Slides, Forms and
 * Drive files and folders, YouTube, Vimeo and Loom show in a frame; a PDF on
 * any other website is a card that opens it (it cannot be framed); any other
 * link is a quiet card with where it goes. `shape` overrides the frame's
 * shape (a Drive file that is a video plays at 16:9). `bare` leaves out the
 * row of buttons, for a form that only wants to show what was pasted.
 */
export function LinkPreview({ url, title, className, shape, bare }: { url: string; title?: string; className?: string; shape?: Embed["shape"]; bare?: boolean }) {
  const u = webUrl(url);
  if (!u) return null;
  const p = linkPreview(u.href);
  if (p?.type === "embed") {
    const embed = shape && p.embed.shape !== "portrait" ? { ...p.embed, shape } : p.embed;
    return <EmbedPreview key={embed.src} href={u.href} embed={embed} title={title} className={className} bare={bare} />;
  }
  if (p?.type === "pdf") return <PdfLinkCard href={u.href} title={title} className={className} />;
  return <LinkCard href={u.href} title={title} className={className} />;
}

/*
 * When a frame cannot show what it was sent to. A private Google file sends
 * anyone not signed in on to Google's sign-in page, which this page's policy
 * does not frame: the browser refuses it and tells the page, just before the
 * frame's load event. That pairing is how a frame learns it was the one
 * turned away. Other refusals (a site that forbids framing, an account
 * without access) tell the page nothing, so the row under every preview
 * always keeps a way to open the original, and says a sign-in may be needed.
 */
let lastRefusal: { at: number; uri: string } | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("securitypolicyviolation", (e) => {
    if ((e.effectiveDirective || e.violatedDirective || "").startsWith("frame-src")) lastRefusal = { at: performance.now(), uri: e.blockedURI };
  });
}

type FrameState = "loading" | "shown" | "sign-in" | "refused";

/** "This document is private." */
const WHAT: Record<Embed["kind"], string> = {
  doc: "document", sheet: "spreadsheet", slides: "presentation", form: "form", folder: "folder", file: "file", video: "video", playlist: "playlist", design: "file",
};

const noop = () => () => {};

function EmbedPreview({ href, embed, title, className, bare }: { href: string; embed: Embed; title?: string; className?: string; bare?: boolean }) {
  // The frame is made in the browser only. Sent with the page, it could load (or be refused) before the
  // page is live, and nobody would hear about it.
  const live = useSyncExternalStore(noop, () => true, () => false);
  const [state, setState] = useState<FrameState>("loading");
  // "Try again" loads the frame afresh: after signing in to Google in another tab, say.
  const [attempt, setAttempt] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const { host, path } = linkParts(new URL(href));
  const from = new URL(embed.src).hostname.replace(/^www\./, "");
  const loaded = () => {
    const r = lastRefusal;
    if (r && performance.now() - r.at < 2000) {
      lastRefusal = null;
      setState(/^https?:\/\/accounts\.google\.com/.test(r.uri) ? "sign-in" : "refused");
    } else setState("shown");
  };
  const retry = () => { setState("loading"); setAttempt((n) => n + 1); };
  const full = () => {
    const el = frame.current;
    if (el?.requestFullscreen && document.fullscreenEnabled) void el.requestFullscreen().catch(() => window.open(href, "_blank", "noopener"));
    else window.open(href, "_blank", "noopener");
  };
  const stuck = state === "sign-in" || state === "refused";
  const box = embed.shape === "video" ? "aspect-video w-full"
    : embed.shape === "portrait" ? cx("mx-auto aspect-[9/16] max-w-full", bare ? "h-[min(420px,55vh)]" : "h-[min(560px,70vh)]")
    : "aspect-[16/10] w-full";
  const what = WHAT[embed.kind];
  const note = embed.signIn && !stuck ? "Private files show here only when you're signed in to Google with an account that can see them." : undefined;
  return (
    <figure className={cx("m-0 overflow-hidden rounded-xl border border-line bg-wash", className)} data-preview="embed" data-provider={embed.provider} data-state={state}>
      <div className={cx(embed.shape === "portrait" && "bg-ink")}>
        <div className={cx("relative", box)}>
          {/* Under the frame while it loads: the frame is see-through until the page inside paints. */}
          {state === "loading" && (
            <p aria-hidden className={cx("absolute inset-0 m-0 flex items-center justify-center px-6 text-center text-small", embed.shape === "portrait" ? "text-surface" : "text-mute-2")}>Loading from {from}…</p>
          )}
          {live && !stuck && (
            <iframe key={attempt} ref={frame} src={embed.src} title={`${embed.label} preview${title ? `: ${title}` : ""}`} allowFullScreen onLoad={loaded}
              referrerPolicy="strict-origin-when-cross-origin"
              allow={embed.shape === "page" ? "fullscreen; clipboard-write" : "autoplay; encrypted-media; fullscreen; picture-in-picture"}
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation allow-forms"
              className="absolute inset-0 block h-full w-full border-0" />
          )}
          {stuck && (
            <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 overflow-y-auto bg-surface px-5 py-4 text-center">
              <span aria-hidden className="flex size-10 flex-none items-center justify-center rounded-lg bg-chip text-mute-3">
                {state === "sign-in" ? <LogIn size={18} strokeWidth={1.8} /> : <SourceIcon kind={embed.kind} size={18} />}
              </span>
              <p className="m-0 text-body font-semibold text-ink text-balance">{state === "sign-in" ? "Sign in to Google to see it here" : "It can't be shown here"}</p>
              <p className="m-0 max-w-[46ch] text-meta text-mute-2 text-pretty">
                {state === "sign-in"
                  ? `This ${what} is private. Open it with an account that can see it, or sign in to Google in this browser and try again.`
                  : `${from} would not show it inside BrandOS. Open it in a new tab instead.`}
              </p>
              <span className="mt-1 flex flex-wrap items-center justify-center gap-2">
                <OpenLink href={href} label={embed.open} primary />
                <Btn size="sm" onClick={retry}><RotateCw aria-hidden size={14} />Try again</Btn>
              </span>
            </div>
          )}
        </div>
      </div>
      {bare ? (
        note && <p className="m-0 border-t border-line bg-surface px-3 py-2 text-small text-mute-2 text-pretty sm:px-3.5">{note}</p>
      ) : (
        <Bar name={title || embed.label} meta={`${host}${path}`} note={note}>
          {embed.shape === "page" && !stuck && <Btn size="sm" onClick={full}><Maximize2 aria-hidden size={14} />Full screen</Btn>}
          {/* When the frame is stuck, its own card above already leads with the way to open it. */}
          {!stuck && <OpenLink href={href} label={embed.open} />}
          <CopyLink href={href} />
        </Bar>
      )}
    </figure>
  );
}

/** A PDF on another website: it cannot be framed here, so the card says so and opens it. */
function PdfLinkCard({ href, title, className }: { href: string; title?: string; className?: string }) {
  const { host, path } = linkParts(new URL(href));
  const file = path.split("?")[0].split("/").filter(Boolean).pop() || "PDF";
  return (
    <figure className={cx("m-0 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-3 py-3 sm:px-4 sm:py-4", className)} data-preview="pdf-link">
      <span aria-hidden className="flex size-12 flex-none items-center justify-center rounded-lg bg-chip text-mute-3"><SourceIcon kind="pdf" size={22} strokeWidth={1.6} /></span>
      <span className="min-w-0 flex-1 basis-52">
        <span className="block truncate text-body font-semibold text-ink" title={title || file}>{title || file}</span>
        <span className="block text-meta text-mute-2 text-pretty">A PDF on {host}. It can&apos;t be shown inside BrandOS, so it opens in a new tab.</span>
      </span>
      <span className="flex flex-none flex-wrap items-center gap-2">
        <OpenLink href={href} label="Open the PDF" primary />
        <CopyLink href={href} />
      </span>
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
