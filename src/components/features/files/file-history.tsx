"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Download, RotateCcw } from "lucide-react";
import type { FileVersion } from "@/db/schema";
import { versionsOf } from "@/lib/file-versions";
import { extOf } from "@/lib/files";
import { fmtDateTime } from "@/lib/format";
import { restoreFileVersion } from "@/app/file-actions";
import { useAction, useApp } from "@/components/app/provider";
import { Btn, cx } from "@/components/ui";
import { FOCUS } from "@/components/polish";
import { FileGlyph, LINK_BTN } from "./parts";

/*
 * The earlier versions of one file on an asset, under its row: replacing a
 * file keeps the old one, so it can be downloaded or put back. Putting one
 * back keeps the file there now as an earlier version, so nothing is lost.
 */

export function FileHistory({ assetId, fileKey, className }: { assetId: string; fileKey: string; className?: string }) {
  const { ws } = useApp();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const asset = ws.asset(assetId);
  const versions = versionsOf(ws.d.fileVersions, assetId, fileKey);
  if (!asset || !versions.length) return null;
  const canRestore = ws.canChange(asset) && ws.can("upload") && (!!asset.brandId || ws.can("library"));
  const n = versions.length;
  return (
    <div className={cx("text-meta", className)}>
      <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)}
        className={cx("inline-flex min-h-6 items-center gap-1 rounded-sm font-medium text-mute-2 transition-colors hover:text-ink", FOCUS)}>
        {n} earlier version{n === 1 ? "" : "s"}
        <ChevronDown aria-hidden size={14} className={cx("transition-transform duration-150 ease-snap", open && "rotate-180")} />
      </button>
      {open && (
        <ol id={listId} aria-label="Earlier versions, newest first" className="@container m-0 mt-2 list-none overflow-hidden rounded-lg border border-line bg-wash p-0">
          {versions.map((v) => <VersionRow key={v.id} v={v} canRestore={canRestore} />)}
        </ol>
      )}
    </div>
  );
}

function VersionRow({ v, canRestore }: { v: FileVersion; canRestore: boolean }) {
  const { ws, toast } = useApp();
  const [run, pending] = useAction();
  const [asking, setAsking] = useState(false);
  const confirm = useRef<HTMLButtonElement>(null);
  const putBack = useRef<HTMLButtonElement>(null);
  const f = v.file;
  const meta = [
    extOf(f.name), f.size,
    f.uploadedBy ? `Uploaded by ${ws.first(f.uploadedBy)}` : "",
    `Replaced ${fmtDateTime(v.replacedAt)}${v.replacedBy ? ` by ${ws.first(v.replacedBy)}` : ""}`,
  ].filter(Boolean).join(" · ");

  useEffect(() => { if (asking) confirm.current?.focus(); }, [asking]);
  const cancel = () => { setAsking(false); requestAnimationFrame(() => putBack.current?.focus()); };
  const restore = async () => {
    const r = await run(restoreFileVersion, v.id);
    if (r.ok) toast(`Put back ${f.name}`);
    else setAsking(false);
  };

  return (
    <li className="border-t border-line px-3 py-2.5 first:border-t-0" data-version={v.id}
      onKeyDown={(e) => { if (asking && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); } }}>
      {/* Side by side when there is room; in a narrow drawer the buttons sit under the name. */}
      <div className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 @lg:grid-cols-[32px_minmax(0,1fr)_auto]">
        <FileGlyph f={f} size={32} />
        <span className="min-w-0">
          <span className="block truncate text-meta font-medium text-ink">{f.name}</span>
          <span className="block text-small text-mute-2">{meta}</span>
        </span>
        {!asking && (
          <span className="col-start-2 flex flex-wrap items-center gap-2 @lg:col-start-3">
            {f.url && (
              <a href={f.url} download={f.name} aria-label={`Download this version of ${f.name}`} className={cx(LINK_BTN, FOCUS)}>
                <Download aria-hidden size={14} />Download
              </a>
            )}
            {canRestore && f.key && (
              <Btn ref={putBack} size="sm" disabled={pending} onClick={() => setAsking(true)}>
                <RotateCcw aria-hidden size={14} />Put this version back
              </Btn>
            )}
          </span>
        )}
      </div>
      {asking && (
        <div role="group" aria-label={`Put back ${f.name}`} className="ml-11 mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface px-3 py-2.5">
          <p className="m-0 min-w-0 flex-1 basis-48 text-meta text-ink-3 text-pretty">Put this version back? The file there now is kept as an earlier version.</p>
          <span className="flex flex-wrap items-center gap-2">
            <Btn size="sm" variant="ghost" disabled={pending} onClick={cancel}>Cancel</Btn>
            <Btn ref={confirm} size="sm" variant="primary" disabled={pending} onClick={restore}>{pending ? "Putting it back…" : "Put it back"}</Btn>
          </span>
        </div>
      )}
    </li>
  );
}
