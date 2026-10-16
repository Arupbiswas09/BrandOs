"use client";

// DEV PREVIEW — removed before release

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useApp } from "@/components/app/provider";
import { Btn, Page, PageHead, Select } from "@/components/ui";
import { BulkUpload } from "@/components/features/files/bulk-upload";
import { FileHistory } from "@/components/features/files/file-history";
import { FilePreview, LinkPreview } from "@/components/features/files/file-preview";

const SAMPLE_LINKS = [
  "https://www.figma.com/design/AbCdEf123456/Homepage?node-id=1-2",
  "docs.google.com/document/d/1a2B3c4D5e6F7g8H9i0J/edit",
  "https://docs.google.com/spreadsheets/d/1a2B3c4D5e6F7g8H9i0J/edit#gid=0",
  "https://drive.google.com/file/d/1a2B3c4D5e6F7g8H9i0J/view?usp=sharing",
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
  "https://vimeo.com/76979871",
  "https://www.loom.com/share/0123456789abcdef0123456789abcdef",
  "https://quokkaforgood.org/audit?utm_source=brandos",
];

export function FilesPreview() {
  const { ws, toast } = useApp();
  const router = useRouter();
  const offers = ws.d.offers.filter((o) => !o.archived);
  const [target, setTarget] = useState(offers[0] ? `offer:${offers[0].id}` : "library");
  const [folderId, setFolderId] = useState("");
  const [kind, id] = target.split(":");
  const offer = kind === "offer" ? ws.offer(id) : null;
  const brandId = offer ? offer.brandId : kind === "brand" ? id : null;
  const folders = offer ? ws.foldersOf(offer.id) : [];
  const linked = offer ? ws.linkedAssets(offer.id) : brandId ? ws.assetsOf(brandId) : ws.d.assets.filter((a) => !a.brandId);

  const withFiles = ws.d.assets.filter((a) => a.files.some((f) => f.key));
  const [pick, setPick] = useState("");
  const asset = ws.asset(pick) ?? withFiles[0] ?? null;
  const [link, setLink] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);

  const replace = async (key: string, f: File) => {
    if (!asset) return;
    const fd = new FormData();
    fd.append("file", f);
    fd.append("replace", key);
    const res = await fetch(`/api/assets/${asset.id}/files`, { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) toast(body.error ?? "The file could not be replaced.", "error");
    else { toast("Replaced"); router.refresh(); }
  };

  const targets = [
    ...offers.map((o) => ({ value: `offer:${o.id}`, label: `Offer: ${o.name} (${ws.brand(o.brandId)?.name ?? ""})` })),
    ...ws.d.brands.map((b) => ({ value: `brand:${b.id}`, label: `Brand assets: ${b.name}` })),
    { value: "library", label: "Global Library" },
  ];

  return (
    <Page>
      <PageHead eyebrow="Dev preview" title="Files" sub="Bulk upload, earlier versions of files, and previews for every file and link type, with real data." />

      <section aria-labelledby="bulk" className="mb-12">
        <h2 id="bulk" className="m-0 mb-3 text-title font-semibold">Bulk upload</h2>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <label className="block sm:w-96"><span className="label">Where</span>
            <Select value={target} onChange={(v) => { setTarget(v); setFolderId(""); }} options={targets} aria-label="Where" />
          </label>
          {folders.length > 0 && (
            <label className="block sm:w-60"><span className="label">Folder</span>
              <Select value={folderId} onChange={setFolderId} options={[{ value: "", label: "Top level" }, ...folders.map((f) => ({ value: f.id, label: f.name }))]} aria-label="Folder" />
            </label>
          )}
        </div>
        <BulkUpload key={`${target}/${folderId}`} brandId={brandId} offerId={offer?.id ?? null} folderId={folderId || null} />
        <h3 className="eyebrow mb-2 mt-6">Here now · {linked.length}</h3>
        <ul aria-label="Assets here now" className="m-0 grid list-none gap-1 p-0 text-meta text-ink-3 sm:grid-cols-2">
          {linked.slice(0, 40).map((a) => (
            <li key={a.id} data-asset={a.id} className="truncate">
              {a.name} <span className="text-mute-2">· {a.type} · {a.status} · {a.files.length} file{a.files.length === 1 ? "" : "s"}{offer && ws.folderOf(offer.id, a.id) ? ` · in ${folders.find((f) => f.id === ws.folderOf(offer.id, a.id))?.name}` : ""}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="files" className="mb-12">
        <h2 id="files" className="m-0 mb-3 text-title font-semibold">Files, previews and earlier versions</h2>
        {!asset ? <p className="text-body text-mute-2">No asset has an uploaded file yet. Add some above.</p> : (
          <>
            <label className="mb-4 block sm:w-96"><span className="label">Asset</span>
              <Select value={asset.id} onChange={setPick} options={withFiles.map((a) => ({ value: a.id, label: a.name }))} aria-label="Asset" />
            </label>
            <input ref={input} type="file" hidden onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (f && replacing.current) void replace(replacing.current, f); }} />
            <ul aria-label="Files on this asset" className="m-0 grid list-none items-start gap-6 p-0 lg:grid-cols-2">
              {asset.files.map((f) => (
                <li key={f.key ?? f.name} data-file={f.name}>
                  <FilePreview file={f} asset={asset} />
                  {f.key && (
                    <div className="mt-2 flex flex-col items-start gap-2">
                      <Btn size="sm" onClick={() => { replacing.current = f.key!; input.current?.click(); }}><RefreshCw aria-hidden size={14} />Replace {f.name}</Btn>
                      <FileHistory assetId={asset.id} fileKey={f.key} className="w-full" />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="links">
        <h2 id="links" className="m-0 mb-3 text-title font-semibold">Link previews</h2>
        <label className="mb-4 block sm:w-[480px]"><span className="label">Paste a link</span>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className="field" />
        </label>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {link && <LinkPreview url={link} />}
          {SAMPLE_LINKS.map((u) => <LinkPreview key={u} url={u} />)}
        </div>
      </section>
    </Page>
  );
}
