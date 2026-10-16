"use client";

import { useCallback, useEffect, useEffectEvent, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ImagePlus, RotateCcw, X } from "lucide-react";
import { checkBatch, sizeLabel } from "@/lib/upload-policy";
import { useApp } from "@/components/app/provider";
import { Btn, cx } from "@/components/ui";

/*
 * Changing the picture on an asset or folder card: paste a screenshot, drop
 * an image or choose one. The server makes the same checks again.
 */

const THUMB = /^image\/(png|jpeg|webp|gif|avif)$/;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
const ACCEPT = Object.keys(EXT).join(",");
export const THUMB_KINDS = "PNG, JPG, WebP, GIF or AVIF";

/** The first image on a clipboard or in a drop, named for what it is (pasted screenshots arrive as "image.png"). */
export function imageFrom(data: DataTransfer | null, pasted = false): File | null {
  if (!data) return null;
  const fromItems = Array.from(data.items ?? []).find((i) => i.kind === "file" && i.type.startsWith("image/"))?.getAsFile();
  const f = fromItems ?? Array.from(data.files ?? []).find((x) => x.type.startsWith("image/")) ?? null;
  if (!f || !pasted || !EXT[f.type]) return f;
  return new File([f], `Pasted image.${EXT[f.type]}`, { type: f.type });
}

/** Whether a paste landed in a text field, where it belongs to the text and not the thumbnail. */
export const intoText = (t: EventTarget | null) =>
  t instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

/** Sets or resets the thumbnail at `endpoint`, checking type and size first so nobody waits for a refusal. */
export function useThumbnail(endpoint: string) {
  const { ws, toast } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const limits = ws.d.uploads.mine;

  const call = useCallback(async (init: RequestInit, done: string, failed: string) => {
    setBusy(true);
    try {
      const res = await fetch(endpoint, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast(body.error ?? failed, "error"); return false; }
      toast(done);
      router.refresh();
      return true;
    } catch {
      toast(`${failed} Check your connection and try again.`, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }, [endpoint, toast, router]);

  const send = useCallback(async (file: File) => {
    if (!THUMB.test(file.type)) { toast(`Thumbnails can be ${THUMB_KINDS} images.`, "error"); return false; }
    const problem = checkBatch([{ name: file.name, size: file.size }], limits);
    if (problem) { toast(problem, "error"); return false; }
    const fd = new FormData();
    fd.append("file", file);
    return call({ method: "POST", body: fd }, "Thumbnail changed", "The thumbnail did not save.");
  }, [call, limits, toast]);

  const reset = useCallback(() => call({ method: "DELETE" }, "Thumbnail reset", "The thumbnail did not reset."), [call]);
  return { busy, send, reset, limits };
}

/**
 * The small "Change thumbnail" panel. While it is open, pasting an image
 * anywhere sets it; so does dropping one on the preview or choosing a file.
 */
export function ThumbnailPicker({ endpoint, subject, preview, custom, resetLabel, fallback, onClose }: {
  endpoint: string;
  /** What the thumbnail is for, under the title. */
  subject: string;
  preview: string | null;
  /** Whether a custom picture is set now, so there is something to reset. */
  custom: boolean;
  resetLabel: string;
  /** Shown when there is no picture at all. */
  fallback: ReactNode;
  onClose: () => void;
}) {
  const { busy, send, reset, limits } = useThumbnail(endpoint);
  const [drag, setDrag] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [mac] = useState(() => /Mac|iPhone|iPad/.test(navigator.userAgent));
  const imagesOk = limits.kinds.image.allowed;

  const take = async (f: File | null) => {
    if (!f || busy) return;
    if (await send(f)) onClose();
  };
  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    const f = imageFrom(e.clipboardData, true);
    if (!f) return;
    e.preventDefault();
    e.stopPropagation();
    void take(f);
  });

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const paste = (e: ClipboardEvent) => onPaste(e);
    // Capture, so the drawer behind does not also take the same paste.
    window.addEventListener("paste", paste, true);
    return () => { window.removeEventListener("paste", paste, true); back?.focus?.(); };
  }, []);

  const keys = (e: React.KeyboardEvent) => {
    // Keys stay here, so Escape closes this panel and not the drawer or page behind it.
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key !== "Tab" || !panel.current) return;
    const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 animate-fade bg-[rgba(16,22,20,.22)]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={keys}
        className="relative w-full max-w-[400px] animate-pop rounded-2xl border border-line bg-surface p-5 shadow-card outline-none"
      >
        <div className="mb-3.5 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="m-0 text-lead font-semibold tracking-[-0.01em] text-ink">Change thumbnail</h2>
            <p className="m-0 mt-0.5 truncate text-meta text-mute-2">{subject}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="-mr-1.5 -mt-1 flex h-8 w-8 flex-none items-center justify-center rounded-lg text-mute-3 transition-colors hover:bg-hover hover:text-ink">
            <X aria-hidden size={17} />
          </button>
        </div>

        <div
          onDragOver={(e) => { if (!e.dataTransfer.types.includes("Files")) return; e.preventDefault(); e.stopPropagation(); setDrag(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDrag(false); void take(imageFrom(e.dataTransfer)); }}
          className={cx("relative aspect-[16/7] overflow-hidden rounded-xl border bg-wash transition-colors", drag ? "border-accent ring-2 ring-accent" : "border-line")}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : fallback}
          {(busy || drag) && (
            <span className="absolute inset-0 flex items-center justify-center bg-surface/85 text-body font-semibold text-ink-3">
              {busy ? "Saving…" : "Drop to use this image"}
            </span>
          )}
        </div>
        <p className="m-0 mt-2.5 text-body leading-[1.5] text-ink-3">
          Paste a screenshot with <kbd className="kbd">{mac ? "⌘" : "Ctrl"}</kbd> <kbd className="kbd">V</kbd>, or drop an image on the preview.
        </p>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <Btn variant="primary" size="sm" disabled={busy || !imagesOk} onClick={() => input.current?.click()}><ImagePlus aria-hidden size={15} />Choose image</Btn>
          {custom && <Btn size="sm" disabled={busy} onClick={async () => { if (await reset()) onClose(); }}><RotateCcw aria-hidden size={14} />{resetLabel}</Btn>}
        </div>
        <p className="m-0 mt-3 text-small text-mute-3">
          {imagesOk ? `${THUMB_KINDS}, up to ${sizeLabel(limits.kinds.image.maxBytes)}.` : "Image uploads are switched off for you. Ask an admin if you need them."}
        </p>
        <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.currentTarget.files?.[0] ?? null; e.currentTarget.value = ""; void take(f); }} />
      </div>
    </div>,
    document.body,
  );
}
