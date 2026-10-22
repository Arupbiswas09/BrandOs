"use client";

import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ArrowLeft, Folder, FolderMinus, FolderPlus, ImagePlus, Link2, Pencil, Plus, Upload } from "lucide-react";
import type { Asset, AssetFolder, Offer } from "@/db/schema";
import { hexA, readable } from "@/lib/color";
import { plural } from "@/lib/ws";
import { createFolder, moveToFolder, removeFolder, renameFolder } from "@/app/folder-actions";
import { useAction, useApp } from "@/components/app/provider";
import { ASSET_DRAG, AssetCard } from "@/components/cards";
import { CardMenu, type CardMenuItem } from "@/components/card-menu";
import { FOCUS } from "@/components/polish";
import { ThumbnailPicker } from "@/components/thumbnail-picker";
import { MoreMenu } from "@/components/more-menu";
import { Btn, Empty, cx } from "@/components/ui";
import { BulkUpload } from "@/components/features/files/bulk-upload";
import { filesFromDrop } from "@/components/features/files/drop";

/*
 * The Assets tab of an offer: its assets, optionally grouped into
 * folders. A folder only groups this offer's links; the assets stay where
 * they live, and removing a folder puts its assets back at the top level.
 * Files dropped anywhere on the tab (or chosen with "Upload files") become
 * assets of this offer, filed in the open folder.
 */

/* Columns follow the space the grid actually has (it shares the row with the summary column on wide screens). */
const GRID = "grid grid-cols-1 gap-3 @sm:grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-4";
const HEAD = "m-0 text-small font-medium text-mute-2";
const QUIET = cx("flex size-8 items-center justify-center rounded-lg text-mute-2 transition-colors hover:bg-hover hover:text-ink", FOCUS);
const carriesAsset = (e: DragEvent) => e.dataTransfer.types.includes(ASSET_DRAG);
const carriesFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");

export function OfferAssets({ o }: { o: Offer }) {
  const { ws, open, toast } = useApp();
  const [run, pending] = useAction();
  const [at, setAt] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const canEdit = ws.canChange(o);
  const canThumb = canEdit && ws.can("upload");
  const canUpload = canEdit && ws.can("edit") && ws.can("upload");
  // The upload panel: open or not, the files a drop brought, and a new key per drop so it starts with them.
  const [adding, setAdding] = useState(false);
  const [dropped, setDropped] = useState<File[] | undefined>(undefined);
  const [dropKey, setDropKey] = useState(0);
  const [filesOver, setFilesOver] = useState(false);
  const uploadId = useId();
  const uploadBtn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const assets = ws.linkedAssets(o.id);
  const folders = ws.foldersOf(o.id);
  const current = folders.find((f) => f.id === at) ?? null;
  const inside = (fid: string | null) => assets.filter((a) => ws.folderOf(o.id, a.id) === fid);
  const shown = inside(current?.id ?? null);

  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name;
  const move = async (assetId: string, folderId: string | null) => {
    const from = ws.folderOf(o.id, assetId);
    if (from === folderId) return;
    const r = await run(moveToFolder, o.id, assetId, folderId);
    if (r.ok) toast(folderId ? `Moved to ${folderName(folderId)}` : `Moved out of ${folderName(from) ?? "the folder"}`);
  };
  const moveFor = (a: Asset) => canEdit && folders.length ? { folders, current: ws.folderOf(o.id, a.id), onMove: (fid: string | null) => void move(a.id, fid) } : undefined;

  /** Drop handlers for anything an asset card can be dragged onto: a folder, or "All assets" to take it out. */
  const dropOn = (key: string, folderId: string | null) => canEdit ? {
    onDragOver: (e: DragEvent) => { if (!carriesAsset(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== key) setOver(key); },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null); },
    onDrop: (e: DragEvent) => {
      if (!carriesAsset(e)) return;
      e.preventDefault();
      setOver(null);
      const id = e.dataTransfer.getData(ASSET_DRAG);
      if (id) void move(id, folderId);
    },
  } : {};

  const openUpload = (files?: File[]) => {
    setDropped(files);
    setDropKey((k) => k + 1);
    setAdding(true);
  };
  const closeUpload = () => {
    setAdding(false);
    requestAnimationFrame(() => uploadBtn.current?.focus());
  };
  /** Files from the desktop, dropped anywhere on the tab. Card drags carry no files, so the folders keep those. */
  const fileDrop = canUpload ? {
    onDragOver: (e: DragEvent) => {
      if (!carriesFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      if (!filesOver) setFilesOver(true);
    },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFilesOver(false); },
    onDrop: (e: DragEvent) => {
      setFilesOver(false);
      // The open panel takes a drop on itself; anything it leaves (say, while it is sending) is not opened by the browser either.
      if (!carriesFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      if (adding) {
        // On the panel itself it is busy sending; anywhere else, point at it.
        if (!panel.current?.contains(e.target as Node)) toast("Drop them on the upload panel to add them to its list.", "info");
        return;
      }
      // The files have to be read while the drop event is still running.
      void filesFromDrop(e.dataTransfer).then((files) => { if (files.length) openUpload(files); });
    },
  } : {};
  /** Escape closes the panel, except while it is sending files. */
  const uploadKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape" || e.currentTarget.querySelector('[data-status="sending"], [data-status="saving"]')) return;
    e.preventDefault();
    e.stopPropagation();
    closeUpload();
  };

  const remove = async (f: AssetFolder) => {
    const n = inside(f.id).length;
    const r = await run(removeFolder, f.id);
    if (!r.ok) return;
    if (at === f.id) setAt(null);
    toast(n ? `Removed ${f.name}. Its ${plural(n, "asset")} ${n === 1 ? "is" : "are"} back in All assets.` : `Removed ${f.name}`);
  };
  const folderMenu = (f: AssetFolder): CardMenuItem[] => [
    { kind: "item", label: "Rename", icon: <Pencil aria-hidden size={15} className="text-mute-4" />, onSelect: () => setRenaming(f.id) },
    ...(canThumb ? [{ kind: "item" as const, label: "Change thumbnail", icon: <ImagePlus aria-hidden size={16} className="text-mute-4" />, onSelect: () => setPicking(f.id) }] : []),
    { kind: "item", label: "Remove folder (assets stay)", icon: <FolderMinus aria-hidden size={16} />, danger: true, onSelect: () => void remove(f) },
  ];
  const cover = (f: AssetFolder) => f.thumbnail?.url ? `${f.thumbnail.url}?inline=1` : inside(f.id).map((a) => ws.previewOf(a)).find(Boolean) ?? null;
  const tint = ws.brand(o.brandId)?.primary ?? "#5E6C66";
  const folderTile = <span className="flex h-full w-full items-center justify-center" style={{ background: hexA(tint, 0.1), color: readable(tint, 0.1) }}><Folder aria-hidden size={26} strokeWidth={1.6} /></span>;
  const pickingFolder = folders.find((f) => f.id === picking);

  const newAsset = () => open({ kind: "asset", draft: { brandId: o.brandId, status: "Draft", offerIds: [o.id] }, step: 0 });
  const linkExisting = () => open({ kind: "link", offerId: o.id });
  const actions = canEdit && (
    <div className="ml-auto flex flex-wrap justify-end gap-2">
      {/* One menu for the ways of adding, instead of a row of buttons; Upload files stays out because it opens a panel here. */}
      <MoreMenu label="Add to this offer" text="Add" icon={<Plus aria-hidden size={15} />} items={[
        { label: "New asset", icon: <Plus aria-hidden size={16} className="text-mute-3" />, onSelect: newAsset },
        { label: "Link existing asset", icon: <Link2 aria-hidden size={16} className="text-mute-3" />, onSelect: linkExisting },
        { label: "New folder", icon: <FolderPlus aria-hidden size={16} className="text-mute-3" />, onSelect: () => { setAt(null); setNaming(true); } },
      ]} />
      {canUpload && (
        // In words on every screen: an upload arrow alone does not say what it does.
        <Btn ref={uploadBtn} size="sm" aria-expanded={adding} aria-controls={uploadId} onClick={() => (adding ? closeUpload() : openUpload())}>
          <Upload aria-hidden size={15} />Upload files
        </Btn>
      )}
    </div>
  );
  const empty = !current && !assets.length && !folders.length;

  return (
    <div {...fileDrop} className={cx("@container rounded-xl", filesOver && !adding && "outline-2 outline-offset-4 outline-accent outline-dashed")}>
      <div className="mb-3 flex min-h-8 flex-wrap items-center gap-x-4 gap-y-2">
        {current ? (
          <nav aria-label="Folders" className="flex min-w-0 flex-1 basis-60 flex-wrap items-center gap-x-2 gap-y-1">
            <button type="button" onClick={() => setAt(null)} {...dropOn("root", null)}
              className={cx("-ml-1.5 inline-flex h-8 items-center gap-1.5 rounded-lg px-1.5 text-body font-medium text-mute-2 transition-colors hover:text-ink", FOCUS, over === "root" && "bg-soft text-ink ring-2 ring-accent")}>
              <ArrowLeft aria-hidden size={15} />All assets
            </button>
            <span aria-hidden className="text-mute-2">/</span>
            {renaming === current.id ? (
              <NameForm label={`New name for ${current.name}`} initial={current.name} submit="Save" pending={pending} compact className="min-w-[240px] flex-1 flex-nowrap"
                onCancel={() => setRenaming(null)} onSave={async (name) => { const r = await run(renameFolder, current.id, name); if (r.ok) setRenaming(null); }} />
            ) : (
              // Name, count and the folder's own menu stay together, so the menu never wraps away from the name on a phone.
              <span className="flex min-w-0 items-center gap-2">
                <span aria-current="page" className="min-w-0 truncate text-body font-semibold text-ink">{current.name}</span>
                <span className="text-meta tabular-nums text-mute-2">{shown.length}</span>
                {canEdit && <CardMenu label={`Folder actions for ${current.name}`} items={folderMenu(current)} triggerClassName={QUIET} />}
              </span>
            )}
          </nav>
        ) : folders.length > 0 && (
          <h3 className={HEAD}>{plural(folders.length, "folder")}</h3>
        )}
        {actions}
      </div>

      {naming && (
        <NameForm
          label="Folder name"
          placeholder="Ad creatives, Emails, Round two…"
          submit="Create folder"
          pending={pending}
          onCancel={() => setNaming(false)}
          onSave={async (name) => {
            const r = await run(createFolder, o.id, name);
            if (r.ok) { setNaming(false); toast(`Created ${name.trim()}`); }
          }}
          className="mb-4 rounded-xl border border-line bg-surface p-3"
        />
      )}

      {adding && (
        <div ref={panel} id={uploadId} onKeyDown={uploadKeys} className="mb-5">
          <BulkUpload key={dropKey} brandId={o.brandId} offerId={o.id} folderId={current?.id ?? null} initialFiles={dropped} onClose={closeUpload} />
        </div>
      )}

      {current ? (
        shown.length > 0 ? (
          <div className={GRID}>{shown.map((a) => <AssetCard key={a.id} a={a} move={moveFor(a)} offerId={o.id} />)}</div>
        ) : (
          <Empty compact body={canEdit ? "Nothing in this folder yet. Drag a card onto the folder, or use Move to folder in a card's menu." : "Nothing in this folder yet."} />
        )
      ) : !empty ? (
        <>
          {folders.length > 0 && (
            <>
              <div className={cx("grid grid-cols-1 gap-2.5 @sm:grid-cols-2 @2xl:grid-cols-4", shown.length > 0 && "mb-6")}>
                {folders.map((f) => renaming === f.id ? (
                  <NameForm key={f.id} label={`New name for ${f.name}`} initial={f.name} submit="Save" pending={pending} compact
                    onCancel={() => setRenaming(null)} onSave={async (name) => { const r = await run(renameFolder, f.id, name); if (r.ok) setRenaming(null); }}
                    className="rounded-xl border border-accent bg-surface p-2.5 [&>input]:basis-full" />
                ) : (
                  <FolderTile key={f.id} f={f} count={inside(f.id).length} cover={cover(f)} tint={tint} over={over === f.id} drop={dropOn(f.id, f.id)}
                    onOpen={() => setAt(f.id)} menu={canEdit ? folderMenu(f) : []} />
                ))}
              </div>
              {shown.length > 0 && <h3 className={cx(HEAD, "mb-3")}>{plural(shown.length, "asset")}</h3>}
            </>
          )}
          {shown.length > 0 && <div className={GRID}>{shown.map((a) => <AssetCard key={a.id} a={a} move={moveFor(a)} offerId={o.id} />)}</div>}
        </>
      ) : (
        <Empty title="No assets in this offer yet" body={canEdit ? "Something in the library probably already fits: link it before you build a new one." : "Nothing is linked to this offer yet."}>
          {/* The ways forward the words point at, here rather than only inside the Add menu. */}
          {canEdit && (
            <>
              <Btn onClick={linkExisting}><Link2 aria-hidden size={15} />Link existing asset</Btn>
              <Btn onClick={newAsset}><Plus aria-hidden size={15} />New asset</Btn>
            </>
          )}
        </Empty>
      )}

      {pickingFolder && (
        <ThumbnailPicker endpoint={`/api/folders/${pickingFolder.id}/thumbnail`} subject={`Folder · ${pickingFolder.name}`} preview={cover(pickingFolder)}
          custom={!!pickingFolder.thumbnail} resetLabel="Use the first asset's picture" fallback={folderTile} onClose={() => setPicking(null)} />
      )}
    </div>
  );
}

/**
 * A folder on the offer page, as a compact tile above the assets: a small
 * picture (its own, or its first asset's) on a second sheet, the name and how
 * many assets it holds. Asset cards can be dropped on it.
 */
function FolderTile({ f, count, cover, tint, over, drop, onOpen, menu }: {
  f: AssetFolder; count: number; cover: string | null; tint: string; over: boolean;
  drop: Partial<Record<"onDragOver" | "onDragLeave" | "onDrop", (e: DragEvent) => void>>;
  onOpen: () => void; menu: CardMenuItem[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div {...drop} className={cx(
      "group relative flex items-center rounded-xl border bg-surface shadow-card transition-colors hover:border-line-strong",
      over ? "border-accent bg-soft ring-2 ring-accent" : "border-line", menuOpen && "z-20",
    )}>
      <button type="button" onClick={onOpen} className={cx("flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2.5 pl-2.5 text-left", menu.length ? "pr-12" : "pr-3", FOCUS)}>
        {/* A second sheet peeking out behind the picture, so a folder reads as a folder at a glance. */}
        <span aria-hidden className="relative ml-1 mt-1 h-10 w-10 flex-none">
          <span className="absolute -right-1 -top-1 h-10 w-10 rounded-lg border border-line bg-wash" />
          <span className="absolute inset-0 overflow-hidden rounded-lg border border-line bg-wash">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file; the folder's name sits right beside it
              <img src={cover} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center" style={{ background: hexA(tint, 0.1), color: readable(tint, 0.1) }}><Folder size={18} strokeWidth={1.8} /></span>
            )}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold leading-[1.3] text-ink">{f.name}</span>
          <span className="block text-small text-mute-3">{over ? "Drop to move here" : count ? plural(count, "asset") : "Empty"}</span>
        </span>
      </button>
      {menu.length > 0 && (
        <span className={cx("absolute right-2 top-1/2 -translate-y-1/2 transition-opacity duration-150", menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100")}>
          <CardMenu label={`More for folder ${f.name}`} items={menu} triggerClassName={QUIET} onOpenChange={setMenuOpen} />
        </span>
      )}
    </div>
  );
}

/** One text box for naming a folder: Enter saves, Escape cancels. */
function NameForm({ label, initial = "", placeholder, submit, pending, compact, onSave, onCancel, className }: {
  label: string; initial?: string; placeholder?: string; submit: string; pending: boolean; compact?: boolean;
  onSave: (name: string) => void; onCancel: () => void; className?: string;
}) {
  const [name, setName] = useState(initial);
  const ok = name.trim().length > 0 && name.trim().length <= 60;
  return (
    <form
      className={cx("flex flex-wrap items-center gap-2", className)}
      onSubmit={(e) => { e.preventDefault(); if (ok) onSave(name); }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); } }}
    >
      {!compact && <FolderPlus aria-hidden size={18} className="ml-1 flex-none text-mute-4" />}
      {/* It appears because someone just asked to name something, so the cursor goes straight there. */}
      <input autoFocus aria-label={label} value={name} maxLength={60} placeholder={placeholder} onChange={(e) => setName(e.target.value)}
        className={cx("field min-w-0 flex-1 py-2", !compact && "min-w-[180px]")} />
      <Btn type="submit" variant="primary" size={compact ? "sm" : "md"} disabled={!ok || pending}>{submit}</Btn>
      <Btn variant="ghost" size={compact ? "sm" : "md"} onClick={onCancel}>Cancel</Btn>
    </form>
  );
}
