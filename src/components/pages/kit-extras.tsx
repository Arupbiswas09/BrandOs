"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Cookie, Copy, Download, ExternalLink, Eye, FileText, Globe, Link2, Maximize2, Pencil, Play, Plus, Presentation, Scale, ShieldCheck, Upload, X } from "lucide-react";
import type { Asset, Brand, FileRef, KitLegal, KitLink, LegalSlot, LogoVariant, SocialNetwork } from "@/db/schema";
import { removeFile, saveAsset, saveKitPart } from "@/app/actions";
import { linkEmbed, linkParts, webUrl, type Embed } from "@/lib/embeds";
import { tidyName } from "@/lib/files";
import { fmtDate } from "@/lib/format";
import {
  LEGAL_SLOTS, LOGO_VARIANTS, SOCIAL_NETWORKS, cleanAddress, guideLinkProblem, legalEntry, legalLinkProblem, legalTitle,
  logoFiles, networkOf, socialAddress, socialHandle, socialName, videoProblem,
} from "@/lib/kit";
import { checkBatch, checkPlace, placeAccept, placeLimit } from "@/lib/upload-policy";
import { live, plural, type WS } from "@/lib/ws";
import { useAction, useApp } from "@/components/app/provider";
import { FileHistory } from "@/components/features/files/file-history";
import { LinkPreview } from "@/components/features/files/file-preview";
import { FileGlyph, LINK_BTN } from "@/components/features/files/parts";
import { Footer, Modal } from "@/components/modals/frame";
import { MoreMenu, type MoreItem } from "@/components/more-menu";
import { FOCUS } from "@/components/polish";
import { SectionTitle } from "@/components/section-tabs";
import { Btn, Card, CodeTile, Field, Select, cx } from "@/components/ui";

/*
 * The parts of the Brand Kit added on the page itself rather than in the kit
 * editor: guidelines in any form, videos, social links and legal pages, plus
 * the dialogs for logo labels and kit files. Kit editors (managers and admins)
 * change the links and labels; files go up through the asset upload, so the
 * people who may upload to an asset may upload here.
 */

/* ---------------------------------------------------------------- shared */

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));

type Sent = { ok: true } | { ok: false; error: string };

/**
 * Sends one or more files to an asset through the upload route, which checks
 * the person and the limits again. With `replace`, the one file swaps the
 * stored file with that key and the earlier one is kept as a version.
 */
export async function sendFiles(assetId: string, files: File[], replace?: string): Promise<Sent> {
  const fd = new FormData();
  files.forEach((f) => fd.append("file", f));
  if (replace) fd.append("replace", replace);
  try {
    const res = await fetch(`/api/assets/${assetId}/files`, { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: body.error ?? "The file did not upload. Try again." };
  } catch {
    return { ok: false, error: "The file did not upload. Check your connection and try again." };
  }
}

/** A hidden file input that any button can open, each time with its own types and its own next step. */
export function usePicker() {
  const ref = useRef<HTMLInputElement>(null);
  const then = useRef<((files: File[]) => void) | null>(null);
  const pick = (accept: string, multiple: boolean, next: (files: File[]) => void) => {
    const el = ref.current;
    if (!el) return;
    el.accept = accept;
    el.multiple = multiple;
    then.current = next;
    el.click();
  };
  const input = (
    <input ref={ref} type="file" className="hidden" tabIndex={-1} aria-hidden
      onChange={(e) => { const list = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ""; const next = then.current; then.current = null; if (list.length && next) next(list); }} />
  );
  return [pick, input] as const;
}

/** The newest stored file on an asset: the one a kit entry shows. */
const newestStored = (a: Asset | null | undefined): FileRef | null => [...(a?.files ?? [])].reverse().find((f) => f.key && f.url) ?? null;
const isPdf = (f: Pick<FileRef, "name" | "type">) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
/** Only files BrandOS stores can show inline: the page may frame its own origin and the six embed origins, nothing else. */
const storedPdf = (f: FileRef) => !!f.key && !!f.url?.startsWith("/api/files/") && isPdf(f);
const isDeck = (f: Pick<FileRef, "name">) => /\.(pptx?|key|odp)$/i.test(f.name);

/** An empty section in one line, with its add button for the people who may add. `quiet` is for readers. */
export function EmptyLine({ text, children, quiet }: { text: ReactNode; children?: ReactNode; quiet?: boolean }) {
  if (quiet) return <p className="m-0 text-body text-mute-2">{text}</p>;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-dashed border-line-strong px-4 py-3.5 sm:px-5">
      <p className="m-0 min-w-0 flex-1 basis-60 text-body text-mute-2 text-pretty">{text}</p>
      {children && <span className="flex flex-none flex-wrap gap-2">{children}</span>}
    </div>
  );
}

function OpenLink({ href, what, label = "Open" }: { href: string; what: string; label?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cx(LINK_BTN, FOCUS)}>
      <ExternalLink aria-hidden size={14} />{label}<span className="sr-only"> {what} (opens in a new tab)</span>
    </a>
  );
}

function DownloadLink({ f }: { f: FileRef }) {
  if (!f.url) return null;
  return <a href={f.url} download={f.name} className={cx(LINK_BTN, FOCUS)}><Download aria-hidden size={14} />Download<span className="sr-only"> {f.name}</span></a>;
}

function CopyBtn({ text, what }: { text: string; what: string }) {
  const { toast } = useApp();
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast(`${what.charAt(0).toUpperCase()}${what.slice(1)} copied`); }
    catch { toast("That could not be copied. Open it and copy it from the address bar.", "error"); }
  };
  return <Btn size="sm" onClick={() => void copy()}><Copy aria-hidden size={14} />Copy<span className="sr-only"> {what}</span></Btn>;
}

/** Where a link goes, in one short line: "docs.google.com/presentation/d/…". */
function where(url: string) {
  const u = webUrl(url);
  if (!u) return url;
  const { host, path } = linkParts(u);
  return host + (path.length > 40 ? `${path.slice(0, 39)}…` : path);
}

/**
 * A link's preview (Google Docs, Slides, Drive, Figma, YouTube, Vimeo, Loom).
 * A kit can hold many, so nothing loads from the other site until someone
 * asks; then it is the same preview as everywhere else in BrandOS, with its
 * sign-in card for private Google files and its Open button.
 */
function EmbedFrame({ embed, url, title }: { embed: Embed; url: string; title: string }) {
  const [on, setOn] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const from = new URL(embed.src).hostname.replace(/^www\./, "");
  const video = embed.shape === "video";
  const verb = video ? "Play here" : "Load preview";
  useEffect(() => { if (on) box.current?.focus(); }, [on]);
  if (on) return <div ref={box} tabIndex={-1} className="outline-none" data-embed={embed.provider}><LinkPreview url={url} title={title} bare /></div>;
  return (
    <div className={cx("relative w-full bg-wash", video ? "aspect-video" : "aspect-[4/3] sm:aspect-[16/10]")} data-embed={embed.provider}>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="eyebrow">{embed.provider}</span>
        <Btn onClick={() => setOn(true)} aria-label={`${verb}: ${title}, from ${from}`}>
          {video ? <Play aria-hidden size={15} /> : <Maximize2 aria-hidden size={15} />}{verb}
        </Btn>
        <p className="m-0 max-w-[40ch] text-small text-mute-2 text-pretty">Nothing loads from {from} until you ask.</p>
      </div>
    </div>
  );
}

function PdfFrame({ f, title }: { f: FileRef; title: string }) {
  return (
    <div className="aspect-[4/3] w-full bg-wash sm:aspect-[16/10]">
      <iframe key={f.key} src={`${f.url}?inline=1`} title={title} loading="lazy" className="block h-full w-full border-0" />
    </div>
  );
}

/** The Card look, for cards that carry data attributes. */
const CARD = "overflow-hidden rounded-xl border border-line bg-surface shadow-card theme-fade";

/** One item with its name and actions on top, and its preview under that. */
function ItemCard({ icon, name, meta, actions, under, children, ...rest }: {
  icon: ReactNode; name: ReactNode; meta?: ReactNode; actions?: ReactNode; under?: ReactNode; children?: ReactNode; [data: `data-${string}`]: string | undefined;
}) {
  return (
    <div className={CARD} {...rest}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-5">
        <span aria-hidden className="flex size-9 flex-none items-center justify-center rounded-lg bg-soft text-accent">{icon}</span>
        <span className="min-w-0 flex-1 basis-48">
          <span className="block truncate text-body font-semibold text-ink">{name}</span>
          {meta && <span className="block truncate text-small text-mute-2" suppressHydrationWarning>{meta}</span>}
        </span>
        {actions && <span className="flex flex-wrap items-center gap-2 max-sm:pl-[52px]">{actions}</span>}
        {under && <div className="basis-full pl-[52px]">{under}</div>}
      </div>
      {children && <div className="border-t border-divider">{children}</div>}
    </div>
  );
}

/** A title and an address, checked before it is saved. Used for guidelines links, videos and legal pages. */
function LinkDialog({ heading, sub, urlLabel, urlPlaceholder, titleLabel, titlePlaceholder, titleRequired, initial, problem, saveLabel, onSave, onClose }: {
  heading: string; sub?: string; urlLabel: string; urlPlaceholder: string; titleLabel?: string; titlePlaceholder?: string; titleRequired?: boolean;
  initial?: { title?: string; url?: string }; problem: (url: string) => string | null; saveLabel: string;
  onSave: (v: { title: string; url: string }) => Promise<boolean>; onClose: () => void;
}) {
  const [url, setUrl] = useState(initial?.url ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const p = problem(url);
    if (p) { setError(p); return; }
    setBusy(true);
    const done = await onSave({ title: title.trim(), url: cleanAddress(url) });
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Modal title={heading} sub={sub} onClose={onClose} onSubmit={() => void submit()}
      footer={<Footer saveLabel={saveLabel} pending={busy} onCancel={onClose} />}>
      <Field label={urlLabel} required error={error}>
        <input className="field" inputMode="url" autoComplete="off" spellCheck={false} required value={url} placeholder={urlPlaceholder}
          aria-invalid={!!error} onChange={(e) => { setUrl(e.target.value); setError(null); }} />
      </Field>
      {titleLabel && (
        <Field label={titleLabel} required={titleRequired} hint={titleRequired ? undefined : <span className="font-normal text-mute-2">optional</span>}>
          <input className="field" value={title} maxLength={120} required={titleRequired} placeholder={titlePlaceholder} onChange={(e) => setTitle(e.target.value)} />
        </Field>
      )}
    </Modal>
  );
}

/** "Remove X?" for files, which come off their asset (its History can put them back). */
function ConfirmRemove({ name, from, onConfirm, onClose }: { name: string; from: string; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Remove ${name}?`} sub={`It comes off ${from}. The asset's History can put it back.`} width={460} onClose={onClose}
      onSubmit={async () => { setBusy(true); await onConfirm(); setBusy(false); onClose(); }}
      footer={<Footer saveLabel="Remove" saveVariant="danger-solid" pending={busy} onCancel={onClose} />} />
  );
}

/* ---------------------------------------------------------------- guidelines */

type GuideItem =
  | { kind: "file"; key: string; file: FileRef; asset: Asset | null }
  | { kind: "link"; key: string; link: KitLink; embed: Embed | null };

/** The brand's live Guidelines assets, most recently changed first. */
export const guideAssets = (ws: WS, b: Brand) =>
  live(ws.assetsOf(b.id)).filter((a) => a.type === "Guidelines").sort((x, y) => +new Date(y.updatedAt) - +new Date(x.updatedAt));

/**
 * Every form the brand's guidelines take: the files on its Guidelines assets
 * (newest asset first, newest upload first), the links kept in the kit, then
 * the files listed on the brand itself.
 */
export function guideItems(ws: WS, b: Brand): GuideItem[] {
  return [
    ...guideAssets(ws, b).flatMap((a) => [...a.files].reverse().map((file, i): GuideItem => ({ kind: "file", key: `f-${a.id}-${file.key ?? i}`, file, asset: a }))),
    ...(b.kit?.guideLinks ?? []).map((link): GuideItem => ({ kind: "link", key: `l-${link.id}`, link, embed: linkEmbed(link.url) })),
    ...b.guidelines.map((file, i): GuideItem => ({ kind: "file", key: `b-${i}`, file, asset: null })),
  ];
}

/** Whether the kit can show this one on the page: a stored PDF, or a link it can frame. */
export const guidePreviewable = (g: GuideItem) => (g.kind === "link" ? !!g.embed : storedPdf(g.file));

const guideName = (g: GuideItem) => g.kind === "link"
  ? g.link.title || g.embed?.provider || where(g.link.url)
  : g.asset && g.asset.files.filter((f) => f.key).length <= 1 ? g.asset.name : g.file.name;

/**
 * The brand's guidelines, readable on the page where the browser can: a PDF
 * BrandOS holds, or a Google Docs, Slides or Drive link. A slide deck file
 * cannot be shown in a browser, so it is a file card with Download.
 */
export function GuidelinesSection({ b }: { b: Brand }) {
  const { ws, toast } = useApp();
  const [run] = useAction();
  const router = useRouter();
  const [pick, input] = usePicker();
  const [busy, setBusy] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [linkEdit, setLinkEdit] = useState<KitLink | "new" | null>(null);
  const [removing, setRemoving] = useState<Extract<GuideItem, { kind: "file" }> | null>(null);

  const items = guideItems(ws, b);
  const shown = items.find((g) => g.key === chosen)
    ?? items.find(guidePreviewable)
    ?? items.find((g) => g.kind === "file" && !!g.file.url && !!g.asset)
    ?? items.find((g) => g.kind === "link")
    ?? null;
  const others = items.filter((g) => g !== shown);
  const links = b.kit?.guideLinks ?? [];
  // New uploads go to the newest Guidelines asset, so they sit with the files already there.
  const target = guideAssets(ws, b)[0] ?? null;
  const limits = ws.d.uploads.mine;
  const canUpload = ws.d.uploadsEnabled && ws.can("upload") && (target ? ws.canChange(target) : ws.can("edit"));
  const canLink = ws.can("kit");
  const fileTools = (a: Asset | null) => !!a && ws.d.uploadsEnabled && ws.can("upload") && ws.canChange(a);

  const upload = async (f: File) => {
    const problem = checkPlace("guidelines", { name: f.name, size: f.size }, limits);
    if (problem) { toast(problem, "error"); return; }
    setBusy("upload");
    try {
      let id = target?.id;
      if (!id) {
        const r = await run(saveAsset, { brandId: b.id, name: "Brand guidelines", type: "Guidelines", channel: "Owned", status: "Ready", offerIds: [] });
        if (!r.ok || !r.id) return;
        id = r.id;
      }
      const r = await sendFiles(id, [f]);
      if (!r.ok) { toast(r.error, "error"); return; }
      setChosen(null);
      toast(`${f.name} is up`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const replace = (g: Extract<GuideItem, { kind: "file" }>) => pick(placeAccept("guidelines"), false, async ([f]) => {
    if (!g.asset || !g.file.key) return;
    const problem = checkPlace("guidelines", { name: f.name, size: f.size }, limits);
    if (problem) { toast(problem, "error"); return; }
    setBusy(g.key);
    const r = await sendFiles(g.asset.id, [f], g.file.key);
    setBusy(null);
    if (!r.ok) { toast(r.error, "error"); return; }
    setChosen(null);
    toast(`Replaced ${g.file.name}. The earlier file is kept under its earlier versions.`);
    router.refresh();
  });

  const saveLinks = async (next: KitLink[]) => (await run(saveKitPart, { brandId: b.id, guideLinks: next })).ok;
  const removeLink = async (l: KitLink) => {
    if (!(await saveLinks(links.filter((x) => x.id !== l.id)))) return;
    toast(`Removed ${l.title || "the link"}`, "ok", { action: { label: "Undo", onClick: () => void saveLinks(links) } });
  };

  const addMenu: MoreItem[] = [
    ...(canUpload ? [{ label: "Upload a PDF or slide deck", icon: <Upload aria-hidden size={15} />, onSelect: () => pick(placeAccept("guidelines"), false, ([f]) => void upload(f)) }] : []),
    ...(canLink ? [{ label: "Add a Google Docs or Slides link", icon: <Link2 aria-hidden size={15} />, onSelect: () => setLinkEdit("new") }] : []),
  ];
  const addButtons = (primary: boolean) => addMenu.length > 1
    ? <MoreMenu text={busy === "upload" ? "Uploading…" : "Add"} icon={<Plus aria-hidden size={15} />} label="Add guidelines" items={addMenu} />
    : addMenu.map((m) => <Btn key={m.label} size="sm" variant={primary ? "primary" : "secondary"} disabled={busy === "upload"} onClick={m.onSelect}>{m.icon}{busy === "upload" ? "Uploading…" : m.label}</Btn>);

  /** What can be done to one item: Replace or Remove a file, Edit or Remove a link. */
  const menuFor = (g: GuideItem): MoreItem[] => g.kind === "link"
    ? canLink ? [
      { label: "Edit the link", icon: <Pencil aria-hidden size={15} />, onSelect: () => setLinkEdit(g.link) },
      { label: "Remove from the kit", icon: <X aria-hidden size={15} />, onSelect: () => void removeLink(g.link), danger: true },
    ] : []
    : fileTools(g.asset) && g.file.key ? [
      { label: "Replace the file", icon: <Upload aria-hidden size={15} />, onSelect: () => replace(g) },
      { label: "Remove", icon: <X aria-hidden size={15} />, onSelect: () => setRemoving(g), danger: true },
    ] : [];
  const menu = (g: GuideItem) => <MoreMenu items={menuFor(g)} label={`More for ${guideName(g)}`} />;

  const fileMeta = (g: Extract<GuideItem, { kind: "file" }>) => {
    const version = b.kit?.version ? `v${b.kit.version}` : g.asset ? `v${g.asset.version}` : "";
    return [version, g.asset && `Updated ${fmtDate(g.asset.updatedAt)}`, g.file.name, g.file.size].filter(Boolean).join(" · ");
  };

  const showCard = (g: GuideItem) => {
    if (g.kind === "link") {
      const title = guideName(g);
      return (
        <ItemCard data-guide="link" icon={g.embed?.provider === "Google Slides" ? <Presentation size={18} /> : <Link2 size={18} />}
          name={title} meta={[g.embed?.provider, where(g.link.url)].filter(Boolean).join(" · ")}
          actions={<><OpenLink href={g.link.url} what={title} /><CopyBtn text={g.link.url} what="the link" />{menu(g)}</>}>
          {g.embed
            ? <EmbedFrame key={g.link.url} embed={g.embed} url={g.link.url} title={`${b.name} guidelines: ${title}`} />
            : <p className="m-0 px-4 py-3 text-meta text-mute-2 sm:px-5">This site does not show inside BrandOS. Open it to read the guidelines.</p>}
        </ItemCard>
      );
    }
    const pdf = storedPdf(g.file);
    return (
      <ItemCard data-guide={pdf ? "pdf" : "file"} icon={isDeck(g.file) ? <Presentation size={18} /> : <FileText size={18} />}
        name={guideName(g)} meta={fileMeta(g)}
        under={g.asset && g.file.key && <FileHistory assetId={g.asset.id} fileKey={g.file.key} />}
        actions={<>
          {pdf && <OpenLink href={`${g.file.url}?inline=1`} what={g.file.name} label="Open full screen" />}
          <DownloadLink f={g.file} />
          {menu(g)}
        </>}>
        {pdf ? <PdfFrame f={g.file} title={`${b.name} guidelines: ${g.file.name}`} /> : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 bg-wash px-4 py-4 sm:px-5">
            <p className="m-0 min-w-0 flex-1 basis-64 text-body text-mute-1 text-pretty">
              {isDeck(g.file) ? "Slide decks can't be shown in a browser." : "This kind of file can't be shown in a browser."} Download it to open it
              {canLink ? ", or add a Google Slides link to read it here." : "."}
            </p>
            {canLink && <Btn size="sm" onClick={() => setLinkEdit("new")}><Link2 aria-hidden size={14} />Add a Google Slides link</Btn>}
          </div>
        )}
      </ItemCard>
    );
  };

  // With guidelines on show, the rest wait behind one line.
  const wrapOthers = (list: ReactNode) => shown ? (
    <details className="group mt-4">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 text-body font-medium text-ink-3 hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="h-4 w-4 text-mute-2 transition-transform duration-150 ease-snap group-open:rotate-90 motion-reduce:transition-none" />
        {plural(others.length, "other file or link", "other files and links")}
      </summary>
      <div className="mt-2">{list}</div>
    </details>
  ) : list;

  return (
    <section aria-label="Guidelines">
      <SectionTitle title="Guidelines" sub="The full guidelines, readable here: a PDF, a slide deck or a Google Docs or Slides link."
        actions={shown && addMenu.length > 0 && addButtons(false)} />
      {input}
      {shown ? showCard(shown) : (
        <EmptyLine quiet={!addMenu.length}
          text={addMenu.length ? `No guidelines for ${b.name} yet. A PDF or a slide deck up to ${placeLimit(limits)}, or a Google link.` : `No guidelines for ${b.name} here yet.`}>
          {addButtons(true)}
        </EmptyLine>
      )}

      {others.length > 0 && !shown && <h3 className="mb-2 mt-5 text-meta font-semibold text-ink-3">Guideline files</h3>}
      {others.length > 0 && wrapOthers(
          <ul aria-label="Other guidelines" className="m-0 list-none overflow-hidden rounded-xl border border-line bg-surface p-0">
            {others.map((g) => {
              const name = g.kind === "link" ? guideName(g) : g.file.name;
              return (
                <li key={g.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-divider px-4 py-2.5 first:border-t-0 sm:px-5">
                  {g.kind === "link"
                    ? <span aria-hidden className="flex size-9 flex-none items-center justify-center rounded-lg bg-chip text-mute-3"><Link2 size={16} /></span>
                    : <FileGlyph f={g.file} />}
                  <span className="min-w-0 flex-1 basis-44">
                    <span className="block truncate text-body font-medium">{name}</span>
                    <span className="block truncate text-small text-mute-2">
                      {g.kind === "link" ? [g.embed?.provider, where(g.link.url)].filter(Boolean).join(" · ") : [g.asset?.name ?? "Listed on the brand", g.file.size].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {g.kind === "file" && !g.file.url ? <span className="text-small text-mute-2">Not uploaded yet</span> : (
                    <span className="flex flex-wrap items-center gap-2 max-sm:pl-12">
                      {(guidePreviewable(g) || (g.kind === "file" && !!g.asset)) && <Btn size="sm" onClick={() => { setChosen(g.key); window.scrollTo({ top: 0 }); }}><Eye aria-hidden size={14} />Show here<span className="sr-only">: {name}</span></Btn>}
                      {g.kind === "link" ? <OpenLink href={g.link.url} what={name} /> : <DownloadLink f={g.file} />}
                      {busy === g.key ? <span className="text-small text-mute-2">Uploading…</span> : menu(g)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>,
      )}

      {linkEdit && (
        <LinkDialog heading={linkEdit === "new" ? "Add a guidelines link" : "Edit the guidelines link"}
          sub="A Google Docs, Slides or Drive link previews here. Anyone opening it still needs access in Google."
          urlLabel="Link" urlPlaceholder="docs.google.com/presentation/d/…" titleLabel="Name" titlePlaceholder="Brand guidelines 2026"
          initial={linkEdit === "new" ? undefined : linkEdit} problem={guideLinkProblem} saveLabel={linkEdit === "new" ? "Add link" : "Save link"}
          onClose={() => setLinkEdit(null)}
          onSave={async ({ title, url }) => {
            const next = linkEdit === "new" ? [...links, { id: newId(), title, url }] : links.map((l) => (l.id === linkEdit.id ? { ...l, title, url } : l));
            const done = await saveLinks(next);
            if (done) { setChosen(null); toast(linkEdit === "new" ? "Link added" : "Link saved"); }
            return done;
          }} />
      )}
      {removing && removing.asset && (
        <ConfirmRemove name={removing.file.name} from={removing.asset.name} onClose={() => setRemoving(null)}
          onConfirm={async () => {
            const r = await run(removeFile, removing.asset!.id, removing.file.name);
            if (r.ok) { setChosen(null); toast(`Removed ${removing.file.name}. To put it back, restore the version before in the asset's History.`); }
          }} />
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- videos */

/** Brand films and explainers, each playing in the kit once asked. */
export function VideosSection({ b }: { b: Brand }) {
  const { ws, toast } = useApp();
  const [run] = useAction();
  const [edit, setEdit] = useState<KitLink | "new" | null>(null);
  const videos = b.kit?.videos ?? [];
  const can = ws.can("kit");
  const save = async (next: KitLink[]) => (await run(saveKitPart, { brandId: b.id, videos: next })).ok;
  const remove = async (v: KitLink) => {
    if (!(await save(videos.filter((x) => x.id !== v.id)))) return;
    toast(`Removed ${v.title || "the video"}`, "ok", { action: { label: "Undo", onClick: () => void save(videos) } });
  };
  const addBtn = <Btn size="sm" onClick={() => setEdit("new")}><Plus aria-hidden size={15} />Add a video</Btn>;
  return (
    <section aria-label="Videos">
      <SectionTitle title="Videos" sub="Brand films and explainers, played here." actions={can && videos.length > 0 && addBtn} />
      {videos.length ? (
        <ul aria-label="Brand videos" className="m-0 grid list-none gap-4 p-0 lg:grid-cols-2">
          {videos.map((v) => {
            const embed = linkEmbed(v.url);
            const title = v.title || embed?.provider || where(v.url);
            return (
              <li key={v.id} className="min-w-0">
                <div className={CARD} data-video={v.id}>
                  {embed && <EmbedFrame embed={embed} url={v.url} title={title} />}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-divider px-3.5 py-2.5 first:border-t-0">
                    <span className="min-w-0 flex-1 basis-44">
                      <span className="block truncate text-body font-semibold text-ink">{title}</span>
                      <span className="block truncate text-small text-mute-2">{[embed?.provider, where(v.url)].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <OpenLink href={v.url} what={title} />
                      <CopyBtn text={v.url} what="the video link" />
                      {can && <MoreMenu label={`More for ${title}`} items={[
                        { label: "Edit", icon: <Pencil aria-hidden size={15} />, onSelect: () => setEdit(v) },
                        { label: "Remove from the kit", icon: <X aria-hidden size={15} />, onSelect: () => void remove(v), danger: true },
                      ]} />}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyLine quiet={!can} text={can ? "No videos yet. YouTube, Vimeo, Loom and Drive links play here." : "No brand videos yet."}>{can && addBtn}</EmptyLine>
      )}
      {edit && (
        <LinkDialog heading={edit === "new" ? "Add a video" : "Edit the video"} sub="A YouTube, Vimeo, Loom or Google Drive link. It plays here once someone asks."
          urlLabel="Video link" urlPlaceholder="youtube.com/watch?v=…" titleLabel="Title" titlePlaceholder="Brand film 2026" titleRequired
          initial={edit === "new" ? undefined : edit} problem={videoProblem} saveLabel={edit === "new" ? "Add video" : "Save video"}
          onClose={() => setEdit(null)}
          onSave={async ({ title, url }) => {
            const next = edit === "new" ? [...videos, { id: newId(), title, url }] : videos.map((v) => (v.id === edit.id ? { ...v, title, url } : v));
            const done = await save(next);
            if (done) toast(edit === "new" ? "Video added" : "Video saved");
            return done;
          }} />
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- social links */

/** Small monochrome marks for the networks (drawn here: the icon set has no brand logos). */
const NET_PATHS: Partial<Record<SocialNetwork, ReactNode>> = {
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></>,
  facebook: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />,
  linkedin: <><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" /></>,
  x: <><path d="M4 4l11.7 16H20L8.3 4z" /><path d="M4 20l6.8-6.8" /><path d="M20 4l-6.8 6.8" /></>,
  youtube: <><path d="M2.5 17a24 24 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.6 49.6 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24 24 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.6 49.6 0 0 1-16.2 0A2 2 0 0 1 2.5 17" /><path d="m10 15 5-3-5-3z" /></>,
  tiktok: <path d="M21 7.9v4a10 10 0 0 1-5-1.9v4.5a6.5 6.5 0 1 1-8-6.3v4.3a2.5 2.5 0 1 0 4 2V3h4.1A6 6 0 0 0 21 7.9z" />,
};

export function NetIcon({ network, size = 18 }: { network: SocialNetwork; size?: number }) {
  if (network === "website") return <Globe aria-hidden size={size} strokeWidth={1.8} />;
  const path = NET_PATHS[network];
  if (!path) return <Link2 aria-hidden size={size} strokeWidth={1.8} />;
  return <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{path}</svg>;
}

/** The brand's own website and profiles, each one click from opening or copying. */
export function SocialSection({ b }: { b: Brand }) {
  const { ws } = useApp();
  const [editing, setEditing] = useState(false);
  const items = b.kit?.social ?? [];
  const can = ws.can("kit");
  const editBtn = (label: string) => <Btn size="sm" onClick={() => setEditing(true)}>{items.length ? <Pencil aria-hidden size={14} /> : <Plus aria-hidden size={15} />}{label}</Btn>;
  return (
    <section aria-label="Social links">
      <SectionTitle title="Social links" sub="The brand's own website and profiles." actions={can && items.length > 0 && editBtn("Edit links")} />
      {items.length ? (
        <Card className="overflow-hidden">
          <ul aria-label="Social links" className="m-0 list-none p-0">
            {items.map((s) => {
              const name = socialName(s);
              return (
                <li key={s.id} data-network={s.network} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-divider px-4 py-2.5 first:border-t-0 sm:px-5">
                  <span aria-hidden className="flex size-9 flex-none items-center justify-center rounded-lg bg-soft text-accent"><NetIcon network={s.network} /></span>
                  <span className="min-w-0 flex-1 basis-44">
                    <span className="block truncate text-body font-semibold text-ink">{name}</span>
                    <span className="block truncate font-mono text-small text-mute-2">{socialHandle(s)}</span>
                  </span>
                  <span className="flex items-center gap-2 max-sm:pl-12">
                    <OpenLink href={s.url} what={name} />
                    <CopyBtn text={s.url} what={`the ${name} link`} />
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <EmptyLine quiet={!can} text={can ? "No social links yet. Add the website and the brand's profiles." : "No social links yet."}>{can && editBtn("Add social links")}</EmptyLine>
      )}
      {editing && <SocialDialog b={b} onClose={() => setEditing(false)} />}
    </section>
  );
}

type SocialRow = { key: string; id: string; network: SocialNetwork; url: string; label: string };

function SocialDialog({ b, onClose }: { b: Brand; onClose: () => void }) {
  const { toast } = useApp();
  const [run, pending] = useAction();
  const items = b.kit?.social ?? [];
  const known = SOCIAL_NETWORKS.filter((n) => n.network !== "custom");
  // One field per network, filled from what is there; anything beyond that (a second site, a custom profile) is listed under it.
  const [fixed, setFixed] = useState<SocialRow[]>(() => known.map((n) => {
    const s = items.find((x) => x.network === n.network);
    return { key: n.network, id: s?.id ?? newId(), network: n.network, url: s?.url ?? "", label: "" };
  }));
  const [extra, setExtra] = useState<SocialRow[]>(() => items
    .filter((s) => items.find((x) => x.network === s.network) !== s || s.network === "custom")
    .map((s) => ({ key: s.id, id: s.id, network: s.network, url: s.url, label: s.label ?? "" })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const form = useRef<HTMLDivElement>(null);

  const setRow = (list: "fixed" | "extra", key: string, patch: Partial<SocialRow>) => {
    (list === "fixed" ? setFixed : setExtra)((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setErrors((e) => { const { [key]: _gone, ...rest } = e; return rest; });
  };

  const save = async () => {
    const rows = [...fixed, ...extra].filter((r) => r.url.trim());
    const bad: Record<string, string> = {};
    const out = rows.flatMap((r) => {
      const a = socialAddress(r.network, r.url);
      if (!a.ok) { bad[r.key] = a.error; return []; }
      return [{ id: r.id, network: r.network, url: a.url, ...(r.network === "custom" && r.label.trim() && { label: r.label.trim() }) }];
    });
    if (Object.keys(bad).length) {
      setErrors(bad);
      requestAnimationFrame(() => form.current?.querySelector<HTMLInputElement>("[aria-invalid=true]")?.focus());
      return;
    }
    const r = await run(saveKitPart, { brandId: b.id, social: out });
    if (r.ok) { toast("Social links saved"); onClose(); }
  };

  const urlInput = (r: SocialRow, list: "fixed" | "extra", label: string) => (
    <>
      <input className="field" inputMode="url" autoComplete="off" spellCheck={false} value={r.url} aria-label={`${label} address`} aria-invalid={!!errors[r.key]}
        aria-describedby={errors[r.key] ? `err-${r.key}` : undefined}
        placeholder={networkOf(r.network).example} onChange={(e) => setRow(list, r.key, { url: e.target.value })} />
      {errors[r.key] && <span id={`err-${r.key}`} role="alert" className="mt-1.5 block text-meta font-medium text-[#B42318]">{errors[r.key]}</span>}
    </>
  );

  return (
    <Modal title="Social links" sub={`${b.name}'s own website and profiles. Paste each address, or a handle such as @${b.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.`} width={620}
      onClose={onClose} onSubmit={() => void save()} footer={<Footer saveLabel="Save links" pending={pending} onCancel={onClose} />}>
      <div ref={form} className="flex flex-col gap-3">
        {fixed.map((r) => {
          const n = networkOf(r.network);
          return (
            <div key={r.key} className="grid items-start gap-x-3 gap-y-1.5 sm:grid-cols-[140px_minmax(0,1fr)]">
              <span className="flex h-9 items-center gap-2 text-body font-medium text-ink-3"><span className="text-mute-2"><NetIcon network={r.network} size={16} /></span>{n.label}</span>
              <span className="min-w-0">{urlInput(r, "fixed", n.label)}</span>
            </div>
          );
        })}
        {extra.length > 0 && <div className="label mb-0 mt-2">More profiles</div>}
        {extra.map((r) => (
          <div key={r.key} className="grid items-start gap-2 rounded-xl border border-line p-3 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
            <Select aria-label="Network" value={r.network} onChange={(v) => setRow("extra", r.key, { network: v as SocialNetwork })}
              options={SOCIAL_NETWORKS.map((n) => ({ value: n.network, label: n.label }))} />
            <span className="flex min-w-0 flex-col gap-2">
              {r.network === "custom" && <input className="field" value={r.label} maxLength={60} aria-label="What it is" placeholder="What it is, for example Threads" onChange={(e) => setRow("extra", r.key, { label: e.target.value })} />}
              <span>{urlInput(r, "extra", r.network === "custom" ? r.label || "Profile" : networkOf(r.network).label)}</span>
            </span>
            <button type="button" aria-label="Remove this profile" onClick={() => setExtra((rows) => rows.filter((x) => x.key !== r.key))}
              className="inline-flex size-9 items-center justify-center rounded-lg text-mute-2 hover:bg-hover hover:text-danger"><X aria-hidden size={16} /></button>
          </div>
        ))}
        <Btn size="sm" className="self-start" onClick={() => { const id = newId(); setExtra((rows) => [...rows, { key: id, id, network: "custom", url: "", label: "" }]); }}>
          <Plus aria-hidden size={15} />Add another profile
        </Btn>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- legal */

const LEGAL_ICON: Record<LegalSlot, ReactNode> = { privacy: <ShieldCheck size={18} />, terms: <Scale size={18} />, extra: <Cookie size={18} /> };

/** A legal page as it is shown: its link, or the newest file on its asset. */
function legalShown(ws: WS, l: KitLegal | null) {
  if (!l) return null;
  if (l.url) return { kind: "link" as const, url: l.url, embed: linkEmbed(l.url) };
  const asset = l.assetId ? ws.asset(l.assetId) : null;
  const file = asset && !asset.archived ? newestStored(asset) : null;
  return { kind: "file" as const, asset: asset && !asset.archived ? asset : null, file };
}

/** The privacy policy, the terms and one more page, each a link or a file, with Open and a preview where it can show. */
export function LegalSection({ b }: { b: Brand }) {
  const { ws, toast } = useApp();
  const [run] = useAction();
  const router = useRouter();
  const [pick, input] = usePicker();
  const [dialog, setDialog] = useState<{ slot: LegalSlot; mode: "link" | "file" | "rename" } | null>(null);
  const [preview, setPreview] = useState<LegalSlot | null>(null);
  const [busy, setBusy] = useState<LegalSlot | null>(null);
  const can = ws.can("kit");
  const uploads = can && ws.d.uploadsEnabled && ws.can("upload") && ws.can("edit");
  const entries = b.kit?.legal ?? [];
  const limits = ws.d.uploads.mine;
  const rows = LEGAL_SLOTS.map((s) => ({ ...s, entry: legalEntry(b, s.slot) })).map((r) => ({ ...r, shown: legalShown(ws, r.entry), title: legalTitle(r.entry ?? { slot: r.slot }) }));
  // Readers see only pages that open: a link, or a file still on a live asset (a deleted one comes back with its asset).
  const filled = rows.filter((r) => r.shown && (r.shown.kind === "link" || r.shown.file));

  const save = async (next: KitLegal[]) => (await run(saveKitPart, { brandId: b.id, legal: next })).ok;
  const others = (slot: LegalSlot) => entries.filter((e) => e.slot !== slot);

  /** Puts a file on the slot's own asset (made the first time), so a newer file keeps the earlier one in its history. */
  const putFile = async (slot: LegalSlot, f: File, title?: string): Promise<string | null> => {
    const problem = checkPlace("legal", { name: f.name, size: f.size }, limits);
    if (problem) return problem;
    const entry = legalEntry(b, slot);
    const had = entry?.assetId ? ws.asset(entry.assetId) : null;
    const asset = had && !had.archived && ws.canChange(had) ? had : null;
    let id = asset?.id;
    if (!id) {
      const r = await run(saveAsset, { brandId: b.id, name: legalTitle({ slot, title }), type: "Document", channel: "Owned", status: "Ready", short: "Legal page, kept in the Brand Kit", offerIds: [] });
      if (!r.ok || !r.id) return r.ok ? "The file did not upload. Try again." : r.error;
      id = r.id;
    }
    // The kit points at the asset first: if the upload then fails, the row says so and offers it again.
    if (!asset || entry?.url || entry?.assetId !== id) {
      if (!(await save([...others(slot), { slot, ...(slot === "extra" && title && { title }), assetId: id }]))) return "The kit did not save. Try again.";
    }
    const r = await sendFiles(id, [f], newestStored(asset)?.key);
    router.refresh();
    return r.ok ? null : r.error;
  };

  const replace = (slot: LegalSlot) => pick(placeAccept("legal"), false, async ([f]) => {
    setBusy(slot);
    const problem = await putFile(slot, f, legalEntry(b, slot)?.title);
    setBusy(null);
    if (problem) toast(problem, "error");
    else toast(`${f.name} is up. The earlier file is kept in the asset's history.`);
  });

  const remove = async (slot: LegalSlot, title: string, wasFile: boolean) => {
    if (!(await save(others(slot)))) return;
    setPreview(null);
    toast(`Removed ${title} from the kit.${wasFile ? " The file stays in the brand's assets." : ""}`, "ok", { action: { label: "Undo", onClick: () => void save(entries) } });
  };

  if (!can && !filled.length) {
    return (
      <section aria-label="Legal">
        <SectionTitle title="Legal" sub="The brand's privacy policy and terms." />
        <EmptyLine quiet text="No privacy policy or terms here yet." />
      </section>
    );
  }

  return (
    <section aria-label="Legal">
      <SectionTitle title="Legal" sub="The brand's privacy policy and terms, as links or files." />
      {input}
      <Card className="overflow-hidden">
        <ul aria-label="Legal pages" className="m-0 list-none p-0">
          {(can ? rows : filled).map((r) => {
            const s = r.shown;
            const canPreview = !!s && (s.kind === "link" ? !!s.embed : !!s.file && storedPdf(s.file));
            const open = preview === r.slot && canPreview;
            const items: MoreItem[] = !can || !r.entry ? [] : [
              ...(s?.kind === "link" ? [{ label: "Change the link", icon: <Pencil aria-hidden size={15} />, onSelect: () => setDialog({ slot: r.slot, mode: "link" }) }] : []),
              ...(uploads ? [{ label: s?.kind === "file" ? "Replace the file" : "Upload a file instead", icon: <Upload aria-hidden size={15} />, onSelect: () => (s?.kind === "file" ? replace(r.slot) : setDialog({ slot: r.slot, mode: "file" })) }] : []),
              ...(s?.kind === "file" ? [{ label: "Use a link instead", icon: <Link2 aria-hidden size={15} />, onSelect: () => setDialog({ slot: r.slot, mode: "link" }) }] : []),
              ...(r.slot === "extra" ? [{ label: "Rename", icon: <Pencil aria-hidden size={15} />, onSelect: () => setDialog({ slot: r.slot, mode: "rename" }) }] : []),
              { label: "Remove from the kit", icon: <X aria-hidden size={15} />, onSelect: () => void remove(r.slot, r.title, s?.kind === "file"), danger: true },
            ];
            const meta = !s ? "Not added yet"
              : s.kind === "link" ? where(s.url)
              : s.file ? [s.file.name, s.file.size, s.asset && `Updated ${fmtDate(s.asset.updatedAt)}`].filter(Boolean).join(" · ")
              : s.asset ? "The file is not uploaded yet." : "The file is no longer in the brand's assets. Upload it again.";
            return (
              <li key={r.slot} data-legal={r.slot} className="border-t border-divider first:border-t-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
                  <span aria-hidden className={cx("flex size-9 flex-none items-center justify-center rounded-lg", r.entry ? "bg-soft text-accent" : "bg-chip text-mute-3")}>{LEGAL_ICON[r.slot]}</span>
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="block truncate text-body font-semibold text-ink">{r.title}</span>
                    <span className="block truncate text-small text-mute-2" suppressHydrationWarning>{busy === r.slot ? "Uploading…" : meta}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 max-sm:pl-12">
                    {s?.kind === "link" && <OpenLink href={s.url} what={r.title} />}
                    {s?.kind === "file" && s.file && (storedPdf(s.file) ? <OpenLink href={`${s.file.url}?inline=1`} what={r.title} /> : <DownloadLink f={s.file} />)}
                    {canPreview && (
                      <Btn size="sm" aria-expanded={open} onClick={() => setPreview(open ? null : r.slot)}>
                        <Eye aria-hidden size={14} />{open ? "Hide preview" : "Preview"}<span className="sr-only"> {r.title}</span>
                      </Btn>
                    )}
                    {can && !r.entry && <>
                      <Btn size="sm" onClick={() => setDialog({ slot: r.slot, mode: "link" })}><Link2 aria-hidden size={14} />Add a link<span className="sr-only"> to the {r.title.toLowerCase()}</span></Btn>
                      {uploads && <Btn size="sm" onClick={() => setDialog({ slot: r.slot, mode: "file" })}><Upload aria-hidden size={14} />Upload a file<span className="sr-only"> for the {r.title.toLowerCase()}</span></Btn>}
                    </>}
                    {can && r.entry && s?.kind === "file" && !s.file && uploads && <Btn size="sm" onClick={() => replace(r.slot)}><Upload aria-hidden size={14} />Upload it<span className="sr-only"> for the {r.title.toLowerCase()}</span></Btn>}
                    {items.length > 0 && <MoreMenu label={`More for the ${r.title.toLowerCase()}`} items={items} />}
                  </span>
                </div>
                {s?.kind === "file" && s.asset && s.file?.key && <FileHistory assetId={s.asset.id} fileKey={s.file.key} className="-mt-1.5 px-4 pb-2.5 sm:px-5 sm:pl-[68px]" />}
                {open && s && (
                  <div className="border-t border-divider">
                    {s.kind === "link" ? s.embed && <EmbedFrame embed={s.embed} url={s.url} title={`${b.name}: ${r.title}`} /> : s.file && <PdfFrame f={s.file} title={`${b.name}: ${r.title}`} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      {dialog && (
        <LegalDialog b={b} slot={dialog.slot} mode={dialog.mode} onClose={() => setDialog(null)} limit={placeLimit(limits)}
          onLink={async (title, url) => {
            const done = await save([...others(dialog.slot), { slot: dialog.slot, ...(title && { title }), url }]);
            if (done) toast(`${legalTitle({ slot: dialog.slot, title })} saved`);
            return done;
          }}
          onRename={async (title) => {
            const cur = legalEntry(b, dialog.slot);
            if (!cur) return true;
            return save([...others(dialog.slot), { ...cur, title: title || undefined }]);
          }}
          onFile={async (title, f) => {
            const problem = await putFile(dialog.slot, f, title);
            if (!problem) toast(`${f.name} is up`);
            return problem;
          }} />
      )}
    </section>
  );
}

function LegalDialog({ b, slot, mode, limit, onLink, onFile, onRename, onClose }: {
  b: Brand; slot: LegalSlot; mode: "link" | "file" | "rename"; limit: string;
  onLink: (title: string, url: string) => Promise<boolean>; onFile: (title: string, f: File) => Promise<string | null>; onRename: (title: string) => Promise<boolean>; onClose: () => void;
}) {
  const entry = legalEntry(b, slot);
  const base = LEGAL_SLOTS.find((s) => s.slot === slot)!.title;
  const [title, setTitle] = useState(entry?.title ?? "");
  const [url, setUrl] = useState(entry?.url ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = legalTitle({ slot, title });
  const submit = async () => {
    setError(null);
    const t = slot === "extra" ? title.trim() : "";
    if (mode === "link") {
      const p = legalLinkProblem(url);
      if (p) { setError(p); return; }
      setBusy(true);
      const done = await onLink(t, cleanAddress(url));
      setBusy(false);
      if (done) onClose();
      return;
    }
    if (mode === "rename") {
      setBusy(true);
      const done = await onRename(t);
      setBusy(false);
      if (done) onClose();
      return;
    }
    if (!file) { setError("Choose the file."); return; }
    setBusy(true);
    const problem = await onFile(t, file);
    setBusy(false);
    if (problem) setError(problem);
    else onClose();
  };
  return (
    <Modal title={mode === "rename" ? "Rename the page" : mode === "link" ? `Link to the ${name.toLowerCase()}` : `Upload the ${name.toLowerCase()}`}
      sub={mode === "file" ? `A PDF or a Word document, up to ${limit}. It is kept as an asset of ${b.name}, so a newer file keeps the earlier one in its history.` : mode === "link" ? "The page where it is published." : undefined}
      onClose={onClose} onSubmit={() => void submit()} width={500}
      footer={<Footer saveLabel={mode === "file" ? "Upload" : "Save"} pending={busy} onCancel={onClose} />}>
      {mode === "link" && (
        <Field label="Link" required error={error}>
          <input className="field" inputMode="url" autoComplete="off" spellCheck={false} required value={url} placeholder="yourbrand.org/privacy" aria-invalid={!!error}
            onChange={(e) => { setUrl(e.target.value); setError(null); }} />
        </Field>
      )}
      {mode === "file" && (
        <Field label="File" required error={error}>
          <input type="file" className="field h-auto py-1.5" accept={placeAccept("legal")} required aria-invalid={!!error}
            onChange={(e) => { setFile(e.currentTarget.files?.[0] ?? null); setError(null); }} />
        </Field>
      )}
      {slot === "extra" && (
        <Field label="Name" hint={<span className="font-normal text-mute-2">{mode === "rename" ? "" : "optional"}</span>}>
          <input className="field" value={title} maxLength={80} placeholder={base} onChange={(e) => setTitle(e.target.value)} />
        </Field>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------- logo variations */

/** Says what each logo file is. Labels are kept in the kit by asset id. */
export function LogoVariantsDialog({ b, onClose }: { b: Brand; onClose: () => void }) {
  const { ws, toast } = useApp();
  const [run, pending] = useAction();
  const logos = logoFiles(b, ws.d.assets);
  const [labels, setLabels] = useState<Record<string, LogoVariant | "">>(() => Object.fromEntries(logos.map((l) => [l.asset.id, l.variant ?? ""])));
  const save = async () => {
    const r = await run(saveKitPart, { brandId: b.id, logoVariants: labels });
    if (r.ok) { toast("Logo variations saved"); onClose(); }
  };
  return (
    <Modal title="Logo variations" sub="Say what each logo file is. A logo for dark backgrounds is shown on dark." width={560}
      onClose={onClose} onSubmit={() => void save()} footer={<Footer saveLabel="Save" pending={pending} onCancel={onClose} />}>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {logos.map(({ asset }) => {
          const preview = ws.previewOf(asset);
          return (
            <li key={asset.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_200px]">
              {preview
                // eslint-disable-next-line @next/next/no-img-element -- a private, auth-checked file
                ? <img src={preview} alt="" className="size-10 flex-none rounded-lg border border-divider bg-wash object-contain p-1" />
                : <CodeTile code={ws.codeOf(asset)} color={ws.colorOf(asset)} size={40} />}
              <span className="min-w-0">
                <span className="block truncate text-body font-medium text-ink">{asset.name}</span>
                <span className="block truncate text-small text-mute-2">{asset.files.map((f) => f.name).join(", ") || "No file yet"}</span>
              </span>
              <Select aria-label={`What ${asset.name} is`} value={labels[asset.id] ?? ""} className="col-span-2 sm:col-span-1"
                onChange={(v) => setLabels((l) => ({ ...l, [asset.id]: v as LogoVariant | "" }))}
                options={[{ value: "", label: "Not labelled" }, ...LOGO_VARIANTS.map((v) => ({ value: v.v, label: v.label }))]} />
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

/* ---------------------------------------------------------------- kit files */

type UploadKind = "Font" | "Template";

/**
 * Upload font files or templates to the kit: as a new master asset, or added
 * to one that is already here. The files go up through the asset upload,
 * which checks the person and the limits again.
 */
export function KitUploadDialog({ b, into, onClose }: { b: Brand; into?: string; onClose: () => void }) {
  const { ws, toast } = useApp();
  const [run] = useAction();
  const router = useRouter();
  const existing = live(ws.assetsOf(b.id)).filter((a) => (a.type === "Font" || a.isTemplate) && ws.canChange(a));
  const [target, setTarget] = useState<string>(into ?? "new-font");
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const limits = ws.d.uploads.mine;
  const fresh = target === "new-font" || target === "new-template";
  const kind: UploadKind = target === "new-template" ? "Template" : "Font";

  const submit = async () => {
    setError(null);
    if (!files.length) { setError("Choose the files."); return; }
    const problem = checkBatch(files.map((f) => ({ name: f.name, size: f.size })), limits);
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      let id = fresh ? null : target;
      if (!id) {
        const r = await run(saveAsset, {
          brandId: b.id, name: name.trim() || tidyName(files[0].name), type: kind, channel: "Owned", status: "Ready", offerIds: [],
          ...(kind === "Template" && { isTemplate: true }),
        });
        if (!r.ok || !r.id) return;
        id = r.id;
      }
      const r = await sendFiles(id, files);
      if (!r.ok) { setError(r.error); router.refresh(); return; }
      toast(`${plural(files.length, "file")} added`);
      router.refresh();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Upload to the Brand Kit" sub="Font files and templates, kept as master files of this brand." width={540}
      onClose={onClose} onSubmit={() => void submit()} footer={<Footer saveLabel="Upload" pending={busy} onCancel={onClose} />}>
      <Field label="Add them to">
        <Select value={target} onChange={setTarget} options={[
          { value: "new-font", label: "A new font asset" },
          { value: "new-template", label: "A new template" },
          ...existing.map((a) => ({ value: a.id, label: `${a.name} (${a.isTemplate ? "template" : "font"})` })),
        ]} />
      </Field>
      {fresh && (
        <Field label="Name" hint={<span className="font-normal text-mute-2">optional</span>}>
          <input className="field" value={name} maxLength={200} placeholder={files[0] ? tidyName(files[0].name) : kind === "Font" ? "Brand typeface files" : "Social post template"} onChange={(e) => setName(e.target.value)} />
        </Field>
      )}
      <Field label="Files" required error={error}>
        <input type="file" multiple className="field h-auto py-1.5" required aria-invalid={!!error}
          accept={kind === "Font" && fresh ? ".woff,.woff2,.ttf,.otf,.zip" : undefined}
          onChange={(e) => { setFiles(Array.from(e.currentTarget.files ?? [])); setError(null); }} />
      </Field>
      <p className="m-0 text-small text-mute-2">Same name as a file already there? The new one takes its place and the earlier one is kept as a version.</p>
    </Modal>
  );
}
