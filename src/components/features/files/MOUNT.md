# Files: where to mount bulk upload, earlier versions and previews

All three are client components that read the workspace through `useApp()`,
so they work anywhere inside the app shell. Try them first at `/dev/files`
(delete `src/app/(app)/dev/files/` before release).

| Component | File | Props |
|---|---|---|
| `BulkUpload` | `bulk-upload.tsx` | `brandId: string \| null` (null = Global Library), `offerId?`, `folderId?`, `initialFiles?: File[]`, `onDone?(ids)`, `onClose?()`, `className?` |
| `FileHistory` | `file-history.tsx` | `assetId`, `fileKey`, `className?` |
| `FilePreview` | `file-preview.tsx` | `file: FileRef`, `asset?` (for the video poster and image alt), `className?` |
| `LinkPreview` | `file-preview.tsx` | `url` (scheme optional, as saved on assets), `title?`, `className?` |
| `filesFromDrop`, `capturePoster` | `drop.ts` | helpers, for a drop handled by the page itself |
| `primaryPreview(asset)` | `src/lib/files.ts` | which file or link the drawer previews first |

Each component checks permissions itself (and hides or explains what the
person cannot do); the routes and action check again on the server.

## BulkUpload

Show it only when it can be used: `ws.can("edit") && ws.can("upload")`, and
for an offer `ws.canChange(offer)`, for the library `ws.can("library")`
(the component says why otherwise, but a hidden entry point is calmer).

1. **Offer page, Assets tab** (`OfferAssets` in `src/components/folders/offer-assets.tsx`,
   "What supports this offer"): a secondary **Add files** button in the
   section's action row opens the panel inline above the grid:
   ```tsx
   <BulkUpload brandId={o.brandId} offerId={o.id} folderId={current?.id ?? null}
     onDone={() => {}} onClose={() => setAdding(false)} />
   ```
   Inside a folder, `folderId` is that folder: the new assets are filed there
   and the panel says "in the Creatives folder of …".
   Dropping files from the desktop anywhere on the tab should open the same
   panel with them already listed. The grid already handles card drags
   (`ASSET_DRAG`), so only react to drags that carry `"Files"`:
   ```tsx
   onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
   onDrop={(e) => { if (!e.dataTransfer.types.includes("Files")) return; e.preventDefault();
     void filesFromDrop(e.dataTransfer).then((files) => { setDropped(files); setAdding(true); }); }}
   ...
   {adding && <BulkUpload key={dropKey} brandId={o.brandId} offerId={o.id} folderId={current?.id ?? null} initialFiles={dropped} onClose={() => setAdding(false)} />}
   ```
   (`filesFromDrop` must be called during the drop event; give the panel a new
   `key` per drop so it starts with the new files.)
2. **Brand page, Assets tab**: the same **Add files** button opening
   `<BulkUpload brandId={brand.id} onClose={…} />` above the grid. No offer, no folder.
3. **Global Library**: next to "Add to library", for people with `library`:
   `<BulkUpload brandId={null} onClose={…} />`. Images and video start as
   "Ad creative"; PDFs and the rest as "Document" (as briefed; note that
   "Document" is not one of the Library's five kinds, so those show under All).

One primary button per area: the panel's primary is "Add N assets" (then
"Open the first"); keep the button that opens the panel secondary.

## FileHistory

**Asset drawer → files section** (`AttachedFiles` in `src/components/drawer/asset-drawer.tsx`):
under each row of a stored file (`f.key`), inside the same `<li>`. The row is
a flex line today; wrap it so the history sits below it, lined up with the
file name (glyph 36px + gap 12px):
```tsx
<li key={f.name} className="… flex-col items-stretch">
  <div className="flex items-center gap-3">{/* the row as it is now */}</div>
  {f.key && <FileHistory assetId={a.id} fileKey={f.key} className="mt-1.5 pl-12" />}
</li>
```
It renders nothing when the file has no earlier versions. After a Replace,
the old file appears here ("1 earlier version"), with Download and "Put this
version back" (asks inline, Esc cancels).

Also in the drawer: the Replace toast can now say what happens:
`Replaced ${old.name}. The earlier file is kept under its earlier versions.`
and the comment above `replace` ("The server drops the old copy…") is out of date.

## FilePreview / LinkPreview

**Asset drawer → preview area** (top of the Overview, above or in place of
the current cover image):
```tsx
const p = primaryPreview(a);          // from "@/lib/files"
const [shown, setShown] = useState<FileRef | null>(null);
{shown ? <FilePreview file={shown} asset={a} />
  : p?.kind === "file" ? <FilePreview file={p.file} asset={a} />
  : p?.kind === "link" ? <LinkPreview url={p.url} title={a.name} />
  : null}
```
Clicking a file's name or glyph in the files list can `setShown(f)` to
preview that file instead. Video uses the asset's thumbnail as its poster.
Third-party links (Figma, Google Docs/Sheets/Slides/Drive, YouTube, Vimeo,
Loom) show a "Load preview" facade: nothing loads from those sites until
the person presses it. Any other link is a quiet card with Open and Copy link.

## Server pieces this relies on (already in this branch)

- `POST /api/bulk-assets` (`src/app/api/bulk-assets/route.ts`).
- `POST /api/assets/[id]/files` with `replace=<key>` now keeps the old file as a
  `file_versions` row (so does uploading a file with the same name again).
- `/api/files/<key>` also serves earlier versions (same visibility check) and
  answers byte ranges for video and audio (206), so they seek and play in Safari.
- `restoreFileVersion(versionId)` in `src/app/file-actions.ts`.
- Storage allowances count earlier versions (`src/server/limits.ts`).
- The CSP (`src/proxy.ts`) frames exactly the six preview origins; `media-src 'self' blob:` was already there.

## Follow-ups for the lead (outside the files this feature could touch)

- **Deleting an asset** (`deleteItem` in `src/app/actions.ts`, `snapshot`/`fileKeys`
  in `src/server/trash.ts`): `file_versions` rows are neither copied into the
  recycle bin nor removed, and their stored files are not purged when the bin
  is emptied. Nothing is lost (rows stay, files stay), but restored assets lose
  their history link and emptied ones leave version files in storage. Suggest:
  add `fileVersions` to `TABLES` and `withAssets`, delete the rows with the
  asset, and include `file.key` of those rows in `fileKeys`.
- **Removing a file outright** (`removeFile` in `src/app/actions.ts`) deletes the
  stored file when no other asset lists it as current. It should also keep it
  while a `file_versions` row (of a clone) points at that key. Versions of the
  removed file itself stay stored and counted; consider removing them with it,
  or listing them as "earlier versions of removed files".
- The activity line for a library bulk upload uses `type: "library"`; the
  dashboard's activity list does not open anything for it (no link target).
