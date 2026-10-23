"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Copy, Download, Pencil, Plus, Printer, Tag, Upload, X } from "lucide-react";
import type { Asset, Brand, BrandColour, FileRef, LogoVariant } from "@/db/schema";
import { cmykText, onColor, rgbText, wcag } from "@/lib/color";
import { GROUND_HEX, defaultScale, kitScore, logoFiles, logoGround, variantLabel } from "@/lib/kit";
import { checkBatch } from "@/lib/upload-policy";
import { live, plural } from "@/lib/ws";
import { useApp } from "@/components/app/provider";
import { kitStartsOn, type KitTab } from "@/components/modals/kit";
import { Sections, SectionsHead, SectionTitle, type SectionItem } from "@/components/section-tabs";
import { Btn, Card, CodeTile, cx } from "@/components/ui";
import { FileHistory } from "@/components/features/files/file-history";
import {
  EmptyLine, GuidelinesSection, KitUploadDialog, LegalSection, LogoVariantsDialog, SocialSection, VideosSection,
  guideItems, guidePreviewable, sendFiles, usePicker,
} from "./kit-extras";

/* ---------------------------------------------------------------- sections */

type Key = "guidelines" | "logo" | "colour" | "type" | "tone" | "imagery" | "videos" | "social" | "legal" | "files" | "ctas";

/** The kit's sections in reading order. The URL hash (#kit-logo) says which one is open. */
const SECTIONS: SectionItem<Key>[] = [
  { key: "guidelines", label: "Guidelines" },
  { key: "logo", label: "Logo" },
  { key: "colour", label: "Colour" },
  { key: "type", label: "Typography" },
  { key: "tone", label: "Brand tone" },
  { key: "imagery", label: "Imagery and rules" },
  { key: "videos", label: "Videos" },
  { key: "social", label: "Social links" },
  { key: "legal", label: "Legal" },
  { key: "files", label: "Files" },
  { key: "ctas", label: "CTAs" },
];
const KEYS = SECTIONS.map((s) => s.key);
/** Older anchors, so links saved before a section was renamed still land on it. */
const OLD_KEYS: Record<string, Key> = { rules: "imagery", voice: "tone", pdf: "guidelines" };

/** Which editor tab each section opens on. */
const EDIT_TAB: Partial<Record<Key, KitTab>> = { logo: "logo", colour: "colour", type: "type", tone: "tone", imagery: "rules" };

/** Where each completeness check is filled in: a section of the page, and the editor tab (none for uploads). */
const FILL: Record<string, { section: Key; tab: KitTab | null }> = {
  logo: { section: "logo", tab: null },
  logoRules: { section: "logo", tab: "logo" },
  colours: { section: "colour", tab: "colour" },
  print: { section: "colour", tab: "colour" },
  fonts: { section: "type", tab: "type" },
  scale: { section: "type", tab: "type" },
  voice: { section: "tone", tab: "tone" },
  imagery: { section: "imagery", tab: "rules" },
  rules: { section: "imagery", tab: "rules" },
  boilerplate: { section: "tone", tab: "tone" },
};

/*
 * The open section lives in the URL hash, so links (#kit-ctas) and the back
 * button land on it. Next's router changes the hash with history.pushState,
 * which fires no event of its own, so the Navigation API is watched too.
 */
const HASH_EVENT = "bos:hash";
function subscribeHash(cb: () => void) {
  const nav = (window as Window & { navigation?: EventTarget }).navigation;
  window.addEventListener("hashchange", cb);
  window.addEventListener("popstate", cb);
  window.addEventListener(HASH_EVENT, cb);
  nav?.addEventListener("currententrychange", cb);
  return () => {
    window.removeEventListener("hashchange", cb);
    window.removeEventListener("popstate", cb);
    window.removeEventListener(HASH_EVENT, cb);
    nav?.removeEventListener("currententrychange", cb);
  };
}

function fromHash(hash: string): Key | null {
  const k = /^#kit-([a-z]+)$/.exec(hash)?.[1];
  if (k && OLD_KEYS[k]) return OLD_KEYS[k];
  return KEYS.includes(k as Key) ? (k as Key) : null;
}

/** Loads the brand's typefaces from Google Fonts so the specimens show the real thing. */
export function useBrandFonts(names: string[]) {
  const key = names.filter(Boolean).join("|");
  useEffect(() => {
    for (const name of key.split("|").filter(Boolean)) {
      const id = "gf-" + name.replace(/\W+/g, "-").toLowerCase();
      if (document.getElementById(id)) continue;
      const l = document.createElement("link");
      l.id = id;
      l.rel = "stylesheet";
      l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
      document.head.appendChild(l);
    }
  }, [key]);
}

export function fontStack(name: string, fallback?: string) {
  return `"${name}", ${fallback || "system-ui, sans-serif"}`;
}

const linkBtn = "inline-flex h-9 flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-surface px-3.5 text-body font-medium text-ink-3 transition-[background-color,border-color,transform] duration-150 ease-snap hover:border-line-strong hover:bg-wash active:scale-[0.97] [&>svg]:size-4";

/**
 * A brand's guidelines, one section at a time. `ctas` is the brand's CTA
 * library, shown as the last section when it is passed in.
 */
export function BrandKit({ b, ctas }: { b: Brand; ctas?: ReactNode }) {
  const { ws, open } = useApp();
  const k = b.kit ?? {};
  const score = useMemo(() => kitScore(b, ws.d.assets), [b, ws.d.assets]);
  const canEdit = ws.can("kit");
  // The kit opens on its guidelines when there is something to read there.
  const hasGuide = guideItems(ws, b).some(guidePreviewable);

  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const items = ctas ? SECTIONS : SECTIONS.filter((s) => s.key !== "ctas");
  const asked = fromHash(hash);
  const active: Key = asked && items.some((s) => s.key === asked) ? asked : hasGuide ? "guidelines" : "logo";
  const go = useCallback((key: Key) => {
    window.history.replaceState(null, "", `#kit-${key}`);
    window.dispatchEvent(new Event(HASH_EVENT));
  }, []);

  const edit = (tab: KitTab | null | undefined) => { kitStartsOn(tab ?? null); open({ kind: "kit", brandId: b.id }); };
  const missing = score.checks.filter((c) => !c.done);
  const first = missing[0] && FILL[missing[0].key];

  return (
    <>
      <SectionsHead at="xl" flush={!b.archived}
        eyebrow={`Brand kit${k.version ? ` · v${k.version}` : ""}`}
        title={b.name}
        sub={k.mission || b.description || undefined}
        meta={missing.length > 0 && (
          <p className="m-0 text-meta text-mute-2">
            {plural(missing.length, "section")} missing: {missing.map((c) => c.label).join(", ")}.
            {first && (first.tab === null || canEdit) && (
              <button type="button" onClick={() => (first.tab ? edit(first.tab) : go(first.section))} className="ml-2 inline-flex min-h-6 items-center font-medium text-accent hover:underline">
                Add {missing[0].label.toLowerCase()}<ChevronRight aria-hidden className="h-3.5 w-3.5" />
              </button>
            )}
          </p>
        )}
        actions={<>
          {canEdit && <Btn variant="primary" onClick={() => edit(EDIT_TAB[active])}><Pencil aria-hidden className="h-4 w-4" />Edit kit</Btn>}
          <a href={`/guidelines/${b.id}`} target="_blank" rel="noreferrer" className={linkBtn}><Printer aria-hidden />Export brand kit</a>
        </>}
      />
      <Sections at="xl" idBase="kit" label="Brand kit sections" items={items} active={active} onChange={go}>
        {active === "guidelines" && <GuidelinesSection b={b} />}
        {active === "logo" && <LogoSection b={b} />}
        {active === "colour" && <ColourSection b={b} />}
        {active === "type" && <TypeSection b={b} />}
        {active === "tone" && <ToneSection b={b} onEdit={canEdit ? () => edit("tone") : undefined} />}
        {active === "imagery" && <ImagerySection b={b} />}
        {active === "videos" && <VideosSection b={b} />}
        {active === "social" && <SocialSection b={b} />}
        {active === "legal" && <LegalSection b={b} />}
        {active === "files" && <FilesSection b={b} />}
        {active === "ctas" && ctas}
      </Sections>
    </>
  );
}

/* ---------------------------------------------------------------- logo */

function LogoSection({ b }: { b: Brand }) {
  const { ws, open } = useApp();
  const [labelling, setLabelling] = useState(false);
  const k = b.kit ?? {};
  const logos = logoFiles(b, ws.d.assets);
  // A logo file is an asset, so anyone who creates assets can add one; saying what each one is belongs to the kit's editors.
  const canAdd = ws.can("edit");
  const canLabel = ws.can("kit") && logos.length > 0;
  const add = () => open({ kind: "asset", draft: { brandId: b.id, type: "Logo", status: "Ready", offerIds: [] }, step: 3 });
  /** The picture of the first logo with one of these labels (or of any logo, last). */
  const pictureOf = (...want: (LogoVariant | null)[]) => {
    for (const v of want) {
      const hit = logos.find((l) => (v === null || l.variant === v) && ws.previewOf(l.asset));
      if (hit) return ws.previewOf(hit.asset);
    }
    return null;
  };
  const light = pictureOf("On light", "Primary", null);
  const reversed = pictureOf("On dark");
  // A reversed logo also sits on the primary colour when that colour is dark enough for white.
  const tiles = [
    { bg: "#FFFFFF", label: "On white", ring: true, src: light },
    { bg: b.primary, label: "On primary", src: onColor(b.primary) === "#FFFFFF" ? reversed : light },
    { bg: GROUND_HEX.dark, label: "On dark", src: reversed },
  ];
  return (
    <section aria-label="Logo">
      <SectionTitle title="Logo" sub="The master files, what each one is for, and the rules for using them."
        actions={(canAdd || canLabel) && <>
          {canLabel && <Btn size="sm" onClick={() => setLabelling(true)}><Tag aria-hidden className="h-4 w-4" />Label variations</Btn>}
          {canAdd && <Btn size="sm" onClick={add}><Plus aria-hidden className="h-4 w-4" />Add a logo file</Btn>}
        </>} />
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((t) => (
          <figure key={t.label} className="m-0">
            <div className={cx("flex aspect-[2/1] items-center justify-center rounded-xl sm:aspect-[5/2]", t.ring && "border border-line")} style={{ background: t.bg }}>
              {t.src
                // eslint-disable-next-line @next/next/no-img-element -- a private, auth-checked file
                ? <img src={t.src} alt={`${b.name} logo ${t.label.toLowerCase()}`} className="max-h-[60%] max-w-[70%] object-contain" />
                : <LogoMark b={b} bg={t.bg} />}
            </div>
            <figcaption className="mt-1.5 text-center text-small text-mute-2">{t.label}</figcaption>
          </figure>
        ))}
      </div>

      <Card className="mt-4 grid items-center gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-[208px_minmax(0,1fr)]">
        <ClearSpace b={b} />
        <div className="min-w-0">
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-meta">
            <dt className="font-semibold text-mute-1">Clear space</dt><dd className="m-0 text-ink-3">{k.logo?.clearSpace || <Missing />}</dd>
            <dt className="font-semibold text-mute-1">Smallest on screen</dt><dd className="m-0 text-ink-3">{k.logo?.minDigital || <Missing />}</dd>
            <dt className="font-semibold text-mute-1">Smallest in print</dt><dd className="m-0 text-ink-3">{k.logo?.minPrint || <Missing />}</dd>
          </dl>
          {k.logo?.notes && <p className="mb-0 mt-2.5 text-meta leading-[1.5] text-mute-2 text-pretty">{k.logo.notes}</p>}
        </div>
      </Card>

      {!!k.logo?.misuse?.length && (
        <>
          <h3 className="mb-2 mt-5 text-meta font-semibold text-ink-3">Never</h3>
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {k.logo.misuse.map((m) => <RuleItem key={m} bad>{m}</RuleItem>)}
          </ul>
        </>
      )}

      <h3 className="mb-2 mt-5 text-meta font-semibold text-ink-3">Variations</h3>
      {logos.length ? (
        <ul aria-label="Logo variations" className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4">
          {logos.map(({ asset, variant }) => <li key={asset.id}><LogoTile b={b} a={asset} variant={variant} /></li>)}
        </ul>
      ) : <EmptyBlock text="No logo files yet. Add the master files so nobody has to ask for them." />}
      {labelling && <LogoVariantsDialog b={b} onClose={() => setLabelling(false)} />}
    </section>
  );
}

/** One logo file on the ground it is made for, with what it is. Opens the file's asset. */
function LogoTile({ b, a, variant }: { b: Brand; a: Asset; variant: LogoVariant | null }) {
  const { ws, openAsset } = useApp();
  // "Not labelled" nudges the people who can label; everyone else just sees a logo file.
  const unlabelled = ws.can("kit") ? "Not labelled" : "Logo file";
  const ground = logoGround(variant);
  const bg = GROUND_HEX[ground];
  const preview = ws.previewOf(a);
  const files = a.files.length;
  return (
    <button type="button" onClick={() => openAsset(a.id)} data-variant={variant ?? ""} data-ground={ground}
      className="group flex w-full flex-col overflow-hidden rounded-xl border border-line bg-surface text-left shadow-card transition hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
      <span aria-hidden className={cx("flex aspect-[4/3] w-full items-center justify-center border-b border-divider p-5", ground === "white" && "bg-surface")} style={ground === "white" ? undefined : { background: bg }}>
        {preview
          // eslint-disable-next-line @next/next/no-img-element -- a private, auth-checked file; the name follows in words
          ? <img src={preview} alt="" loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
          : <LogoMark b={b} bg={ground === "dark" ? GROUND_HEX.dark : "#FFFFFF"} compact />}
      </span>
      <span className="block min-w-0 px-3.5 pb-3 pt-2.5">
        <span className="block text-micro font-semibold uppercase tracking-[0.05em] text-mute-2">{variant ? variantLabel(variant) : unlabelled}</span>
        <span className="mt-0.5 block truncate text-body font-semibold text-ink">{a.name}</span>
        <span className="block truncate text-small text-mute-2">{files ? `${a.files.map((f) => f.name.split(".").pop()?.toUpperCase()).filter(Boolean).join(", ")} · ${plural(files, "file")}` : "No file yet"}</span>
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------- colour */

function ColourSection({ b }: { b: Brand }) {
  const { toast } = useApp();
  const copy = (v: string, what = v) => { void navigator.clipboard?.writeText(v).catch(() => {}); toast(`${what} copied`); };
  return (
    <section aria-label="Colour">
      <SectionTitle title="Colour" sub="Every colour with its screen values. Click a value to copy it." />
      {b.colours.length ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {b.colours.map((c) => <Swatch key={c.name + c.hex} c={c} copy={copy} />)}
        </div>
      ) : <EmptyBlock text="No colours recorded yet." />}
      {b.colours.length > 1 && (
        <details className="group mt-5">
          <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg text-body font-medium text-ink-3 hover:text-ink [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden className="h-4 w-4 text-mute-2 transition-transform duration-150 ease-snap group-open:rotate-90 motion-reduce:transition-none" />
            Check contrast pairings
          </summary>
          <ContrastGrid colours={b.colours.slice(0, 6)} />
        </details>
      )}
    </section>
  );
}

function Swatch({ c, copy }: { c: BrandColour; copy: (v: string, what?: string) => void }) {
  // Surfaces are judged by the text that sits on them; everything else as text itself.
  const surface = c.role === "Background" || c.role === "Neutral";
  const grades: [string, ReturnType<typeof wcag>][] = surface
    ? [["dark text", wcag("#101614", c.hex)], ["white text", wcag("#FFFFFF", c.hex)]]
    : [["on white", wcag(c.hex, "#FFFFFF")], ["on black", wcag(c.hex, "#000000")]];
  const screen: [string, string][] = [["HEX", c.hex.toUpperCase()], ["RGB", rgbText(c.hex)]];
  const print: [string, string, string?][] = [
    ["CMYK", c.cmyk || cmykText(c.hex), c.cmyk ? undefined : "Worked out from the hex. Confirm with your printer."],
    ["Pantone", c.pantone || ""],
  ];
  const row = (k: string, v: string, note?: string) => (
    <div key={k} className="flex items-center justify-between gap-2 border-t border-divider py-0.5">
      <dt className="text-micro font-semibold uppercase tracking-[0.05em] text-mute-2">{k}</dt>
      <dd className="m-0 min-w-0">
        {v ? (
          <button type="button" onClick={() => copy(v, `${k} ${v}`)} title={note ?? `Copy ${k}`} className="min-h-6 truncate font-code text-small text-ink-3 hover:text-accent">
            {v}{note ? "*" : ""}
          </button>
        ) : <span className="text-small text-mute-2">Not set</span>}
      </dd>
    </div>
  );
  return (
    <Card className="overflow-hidden">
      <div className="flex h-20 items-end justify-between gap-2 p-3" style={{ background: c.hex, color: onColor(c.hex) }}>
        <span className="text-heading font-semibold leading-none">Aa</span>
        <span className="rounded-full px-2 py-0.5 text-micro font-semibold uppercase tracking-[0.05em]" style={{ background: onColor(c.hex), color: c.hex === onColor(c.hex) ? "#FFFFFF" : c.hex }}>{c.role ?? "Colour"}</span>
      </div>
      <div className="px-3.5 pb-3 pt-2.5">
        <div className="truncate text-body font-semibold">{c.name}</div>
        {c.usage && <div className="mt-0.5 line-clamp-2 text-meta leading-[1.4] text-mute-2">{c.usage}</div>}
        <dl className="m-0 mt-2">{screen.map(([k, v]) => row(k, v))}</dl>
        <details className="group/print border-t border-divider">
          <summary className="flex min-h-7 cursor-pointer list-none items-center gap-1 text-meta font-medium text-mute-2 hover:text-ink [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden className="h-3.5 w-3.5 transition-transform duration-150 ease-snap group-open/print:rotate-90 motion-reduce:transition-none" />
            Print values
          </summary>
          <dl className="m-0 pb-1">{print.map(([k, v, note]) => row(k, v, note))}</dl>
        </details>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {grades.map(([label, g]) => <Grade key={label} label={label} g={g} />)}
        </div>
      </div>
    </Card>
  );
}

function Grade({ label, g }: { label: string; g: ReturnType<typeof wcag> }) {
  const ok = g.grade !== "Fail";
  return (
    <span title={`Contrast ${g.ratio.toFixed(2)}:1 ${label}`} className={cx("inline-flex items-center gap-1 rounded-sm bg-chip px-1.5 py-0.5 text-micro font-semibold", ok ? "text-ok" : "text-mute-2")}>
      {ok ? <Check aria-hidden className="h-3 w-3" /> : <X aria-hidden className="h-3 w-3" />}
      {g.grade} {label}
    </span>
  );
}

/** Which colour can sit on which: text colour down the side, background across the top. */
function ContrastGrid({ colours }: { colours: BrandColour[] }) {
  const bgs = [...colours, { name: "White", hex: "#FFFFFF", usage: "" }];
  return (
    <Card className="mt-3 overflow-hidden">
      <div className="overflow-x-auto p-4" data-scroll>
        <table className="border-separate border-spacing-1.5">
          <caption className="sr-only">Contrast of each brand colour as text on each background</caption>
          <thead>
            <tr>
              <th className="px-2 text-left text-micro font-semibold text-mute-2" scope="col">Text, then background</th>
              {bgs.map((b) => <th key={b.hex + b.name} scope="col" className="px-1 text-micro font-semibold text-mute-2">{b.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {colours.map((fg) => (
              <tr key={fg.hex + fg.name}>
                <th scope="row" className="px-2 text-left text-small font-semibold text-mute-1">{fg.name}</th>
                {bgs.map((bg) => {
                  if (fg.hex.toLowerCase() === bg.hex.toLowerCase()) return <td key={bg.hex + bg.name} className="h-11 w-20 rounded-lg bg-wash" />;
                  const g = wcag(fg.hex, bg.hex);
                  return (
                    <td key={bg.hex + bg.name} data-contrast-sample className="h-11 w-20 rounded-lg text-center" style={{ background: bg.hex, color: fg.hex, boxShadow: "inset 0 0 0 1px var(--bos-border)" }} title={`${g.ratio.toFixed(2)}:1`}>
                      <span className="block text-small font-bold leading-none">Aa</span>
                      <span className="mt-0.5 block text-micro font-semibold leading-none" style={{ color: onColor(bg.hex) }}>{g.grade === "Fail" ? "✕ " : ""}{g.ratio.toFixed(1)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mb-0 mt-2 text-small text-mute-2">4.5 or more passes AA for body text; 3 or more passes for large text (24px, or 19px bold).</p>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- type */

function TypeSection({ b }: { b: Brand }) {
  const k = b.kit ?? {};
  const scale = k.typeScale?.length ? k.typeScale : defaultScale(b);
  useBrandFonts([...b.fonts.map((f) => f.name), ...scale.map((s) => s.font)]);
  return (
    <section aria-label="Typography">
      <SectionTitle title="Typography" sub="The typefaces, and the sizes to use them at." />
      <div className="grid gap-3 md:grid-cols-2">
        {b.fonts.map((f) => (
          <Card key={f.name + f.role} className="flex items-center gap-4 px-4 py-3.5">
            <div className="flex size-16 flex-none items-center justify-center rounded-lg bg-wash text-display text-ink" style={{ fontFamily: fontStack(f.name, f.fallback) }}>Aa</div>
            <div className="min-w-0">
              <div className="truncate text-lead font-semibold" style={{ fontFamily: fontStack(f.name, f.fallback) }}>{f.name}</div>
              <div className="text-meta text-mute-2">{f.role}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-small text-mute-2">
                {f.weights && <span>Weights {f.weights}</span>}
                {f.fallback && <span>Fallback {f.fallback}</span>}
                {f.source && <span>{f.source}</span>}
              </div>
            </div>
          </Card>
        ))}
        {!b.fonts.length && <EmptyBlock text="No typefaces recorded yet." />}
      </div>
      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-3 border-b border-divider px-5 py-2.5">
          <h3 className="m-0 text-meta font-semibold text-ink-3">Type scale</h3>
          {!k.typeScale?.length && <span className="text-small text-mute-2">Suggested. Edit the kit to set your own.</span>}
        </div>
        {scale.map((t) => (
          <div key={t.name} className="flex flex-col gap-1 border-b border-divider px-5 py-2.5 last:border-b-0 md:flex-row md:items-center md:gap-6">
            <div className="w-44 flex-none">
              <div className="text-meta font-semibold">{t.name}</div>
              <div className="font-code text-small text-mute-2">{t.size}px / {t.lineHeight} · {t.weight}{t.tracking ? ` · ${t.tracking}em` : ""}</div>
            </div>
            <div className="min-w-0 flex-1 truncate text-ink" style={{ fontFamily: fontStack(t.font), fontSize: Math.min(t.size, 48), fontWeight: t.weight, lineHeight: t.lineHeight, letterSpacing: t.tracking ? `${t.tracking}em` : undefined }}>
              {t.sample || (t.size >= 24 ? b.tagline || b.name : "The quick brown fox jumps over the lazy dog.")}
            </div>
          </div>
        ))}
      </Card>
    </section>
  );
}

/* ---------------------------------------------------------------- voice */

/**
 * How the brand sounds: the voice in a sentence or two, the tone words (we
 * are, we are not), the words to use and avoid, example lines and the
 * boilerplate. All of it is edited in the kit editor's Brand tone tab.
 */
function ToneSection({ b, onEdit }: { b: Brand; onEdit?: () => void }) {
  const { toast } = useApp();
  const k = b.kit ?? {};
  const copy = () => { void navigator.clipboard?.writeText(b.boilerplate).catch(() => {}); toast("Boilerplate copied"); };
  const any = !!(b.voice || b.boilerplate || k.values?.length || k.weAre?.length || k.weAreNot?.length || k.wordsUse?.length || k.wordsAvoid?.length || k.voiceExamples?.length);
  const sub = "How the brand sounds. The voice stays the same; the tone shifts with the moment.";
  if (!any) {
    return (
      <section aria-label="Brand tone">
        <SectionTitle title="Brand tone" sub={sub} />
        <EmptyLine quiet={!onEdit} text={onEdit ? "No brand tone yet. Describe the voice, the tone words and the words to avoid." : "No brand tone written down yet."}>
          {onEdit && <Btn size="sm" onClick={onEdit}><Pencil aria-hidden className="h-3.5 w-3.5" />Write the brand tone</Btn>}
        </EmptyLine>
      </section>
    );
  }
  return (
    <section aria-label="Brand tone">
      <SectionTitle title="Brand tone" sub={sub} />
      <p className="m-0 max-w-[65ch] text-lead leading-[1.55] text-ink text-pretty">{b.voice || <Missing />}</p>
      {!!k.values?.length && (
        <ul aria-label="Values" className="m-0 mt-3 flex list-none flex-wrap gap-1.5 p-0">
          {k.values.map((v) => <li key={v} className="rounded-full bg-soft px-3 py-1 text-meta font-medium text-ink-3">{v}</li>)}
        </ul>
      )}
      <h3 className="mb-2 mt-6 text-meta font-semibold text-ink-3">Tone and words</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="px-5 py-4">
          <ListBlock title="We are" items={k.weAre} tone="good" />
          <WordBlock title="Words we use" items={k.wordsUse} tone="good" />
        </Card>
        <Card className="px-5 py-4">
          <ListBlock title="We are not" items={k.weAreNot} tone="bad" />
          <WordBlock title="Words we avoid" items={k.wordsAvoid} tone="bad" />
        </Card>
      </div>
      {!!k.voiceExamples?.length && <h3 className="mb-2 mt-6 text-meta font-semibold text-ink-3">Example lines</h3>}
      {!!k.voiceExamples?.length && (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[120px_1fr_1fr] gap-4 border-b border-divider px-5 py-2 text-small font-semibold text-mute-2 max-md:hidden">
            <span>Where</span><span>Say this</span><span>Not this</span>
          </div>
          {k.voiceExamples.map((e, i) => (
            <div key={i} className="grid gap-1.5 border-b border-divider px-5 py-2.5 last:border-b-0 md:grid-cols-[120px_1fr_1fr] md:gap-4">
              <span className="text-meta font-semibold text-mute-1">{e.context}</span>
              <span className="flex gap-2 text-body text-ink-3"><Check aria-hidden className="mt-1 h-4 w-4 flex-none text-ok" /><span><span className="sr-only">Say: </span>{e.say}</span></span>
              <span className="flex gap-2 text-body text-mute-2"><X aria-hidden className="mt-1 h-4 w-4 flex-none text-mute-2" /><span><span className="sr-only">Not: </span>{e.dont}</span></span>
            </div>
          ))}
        </Card>
      )}
      <Card className="mt-6 px-5 py-4">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h3 className="m-0 text-meta font-semibold text-ink-3">Boilerplate</h3>
          {b.boilerplate && <Btn size="sm" onClick={copy}><Copy aria-hidden className="h-3.5 w-3.5" />Copy<span className="sr-only"> the boilerplate</span></Btn>}
        </div>
        <p className="m-0 max-w-[75ch] text-body leading-[1.6] text-ink-3 text-pretty">{b.boilerplate || <Missing />}</p>
      </Card>
    </section>
  );
}

/* ---------------------------------------------------------------- imagery and rules */

function ImagerySection({ b }: { b: Brand }) {
  const k = b.kit ?? {};
  return (
    <section aria-label="Imagery and rules">
      <SectionTitle title="Imagery and rules" sub="What photography should look like, and the rules people break most often." />
      <h3 className="mb-1.5 mt-0 text-meta font-semibold text-ink-3">Imagery</h3>
      <p className="m-0 max-w-[65ch] text-body leading-[1.6] text-ink-3 text-pretty">{k.imagery || <Missing />}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Card className="px-5 py-4"><ListBlock title="Look for" items={k.imageryDo} tone="good" /></Card>
        <Card className="px-5 py-4"><ListBlock title="Avoid" items={k.imageryDont} tone="bad" /></Card>
      </div>
      <h3 className="mb-1.5 mt-6 text-meta font-semibold text-ink-3">Do&apos;s and don&apos;ts</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="px-5 py-4"><ListBlock title="Do" items={k.dos} tone="good" /></Card>
        <Card className="px-5 py-4"><ListBlock title="Don't" items={k.donts} tone="bad" /></Card>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- files */

/**
 * Font files and the brand's templates, to download. People who may upload
 * add new ones (as new master assets, or onto one already here) and replace a
 * file in place: the upload route keeps the earlier one as a version.
 */
function FilesSection({ b }: { b: Brand }) {
  const { ws, openAsset, toast } = useApp();
  const router = useRouter();
  const [pick, input] = usePicker();
  const [adding, setAdding] = useState<string | true | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const all = live(ws.assetsOf(b.id));
  // Guideline documents and logos have their own sections; this is everything else people come to download.
  const files = [...all.filter((a) => a.type === "Font"), ...all.filter((a) => a.isTemplate && a.type !== "Font")];
  const uploads = ws.d.uploadsEnabled && ws.can("upload");
  const canAdd = uploads && ws.can("edit");
  const canSwap = (a: Asset) => uploads && ws.canChange(a);

  const replace = (a: Asset, f: FileRef) => pick("", false, async ([next]) => {
    const problem = checkBatch([{ name: next.name, size: next.size }], ws.d.uploads.mine);
    if (problem) { toast(problem, "error"); return; }
    setBusy(f.key ?? null);
    const r = await sendFiles(a.id, [next], f.key);
    setBusy(null);
    if (!r.ok) { toast(r.error, "error"); return; }
    toast(`Replaced ${f.name}. The earlier file is kept under its earlier versions.`);
    router.refresh();
  });

  return (
    <section aria-label="Files">
      <SectionTitle title="Files" sub="Font files and the reusable templates for this brand."
        actions={canAdd && files.length > 0 && <Btn size="sm" onClick={() => setAdding(true)}><Upload aria-hidden className="h-4 w-4" />Upload files</Btn>} />
      {input}
      {files.length ? (
        <Card className="overflow-hidden">
          <ul aria-label="Kit files" className="m-0 list-none p-0">
            {files.map((a) => (
              <li key={a.id} className="border-t border-divider first:border-t-0" data-asset={a.id}>
                <FileRow a={a} onOpen={() => openAsset(a.id)} />
                {a.files.length > 0 && (
                  <ul aria-label={`Files in ${a.name}`} className="m-0 list-none px-4 pb-2.5 pl-16 pt-0 sm:px-5 sm:pl-[68px]">
                    {a.files.map((f) => (
                      <li key={f.key ?? f.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-divider py-1.5 first:border-t-0">
                        <span className="min-w-0 flex-1 basis-40">
                          <span className="block truncate text-meta text-ink-3">{f.name}</span>
                          <span className="block text-small text-mute-2">{f.url ? f.size : "Listed only. The file was never uploaded here."}</span>
                          {f.key && <FileHistory assetId={a.id} fileKey={f.key} className="mt-0.5" />}
                        </span>
                        {f.url && (
                          <span className="flex items-center gap-1.5">
                            {busy === f.key ? <span className="text-small text-mute-2">Uploading…</span> : canSwap(a) && f.key && (
                              <Btn size="sm" onClick={() => replace(a, f)}><Upload aria-hidden className="h-3.5 w-3.5" />Replace<span className="sr-only"> {f.name}</span></Btn>
                            )}
                            <a href={f.url} download={f.name} aria-label={`Download ${f.name}`} title={`Download ${f.name}`} className="inline-flex size-8 items-center justify-center rounded-lg text-mute-2 hover:bg-hover hover:text-ink"><Download aria-hidden className="h-4 w-4" /></a>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {canSwap(a) && !a.files.some((f) => f.url) && (
                  <div className="px-4 pb-2.5 pl-16 sm:px-5 sm:pl-[68px]">
                    <Btn size="sm" onClick={() => setAdding(a.id)}><Upload aria-hidden className="h-3.5 w-3.5" />Upload the files<span className="sr-only"> for {a.name}</span></Btn>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyLine quiet={!canAdd} text={canAdd ? "No font files or templates yet. Upload them so nobody has to ask." : "No font files or templates here yet."}>
          {canAdd && <Btn size="sm" onClick={() => setAdding(true)}><Upload aria-hidden className="h-4 w-4" />Upload files</Btn>}
        </EmptyLine>
      )}
      {adding && <KitUploadDialog b={b} into={adding === true ? undefined : adding} onClose={() => setAdding(null)} />}
    </section>
  );
}

function FileRow({ a, onOpen }: { a: Asset; onOpen: () => void }) {
  const { ws } = useApp();
  const preview = ws.previewOf(a);
  const count = a.files.length;
  return (
    <button type="button" onClick={onOpen} className="focus-inset flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-hover sm:px-5">
      {preview
        // eslint-disable-next-line @next/next/no-img-element -- a private, auth-checked file
        ? <img src={preview} alt="" className="size-9 flex-none rounded-lg border border-divider bg-wash object-contain" />
        : <CodeTile code={ws.codeOf(a)} color={ws.colorOf(a)} size={36} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-ink">{a.name}</span>
        <span className="block truncate text-meta text-mute-2">{a.short || (a.isTemplate ? "Template" : a.type)}</span>
      </span>
      <span className="hidden flex-none text-meta text-mute-2 sm:block">{a.isTemplate ? "Template" : a.type}{count > 0 && ` · ${plural(count, "file")}`}</span>
      <ChevronRight aria-hidden className="h-4 w-4 flex-none text-mute-2" />
    </button>
  );
}

/* ---------------------------------------------------------------- pieces */

function Missing() {
  return <span className="text-mute-2">Not set yet</span>;
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="col-span-full rounded-xl border border-dashed border-line-strong px-6 py-6 text-center text-body text-mute-2">{text}</div>
  );
}

/** The brand's mark drawn for a background, where no logo picture is uploaded. `compact` leaves the name out. */
function LogoMark({ b, bg, compact }: { b: Brand; bg: string; compact?: boolean }) {
  const onPrimary = bg === b.primary;
  const fill = bg === "#FFFFFF" ? b.primary : onPrimary ? onColor(b.primary) : "#FFFFFF";
  const text = bg === "#FFFFFF" ? onColor(b.primary) : onPrimary ? b.primary : "#101614";
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-10 items-center justify-center rounded-xl text-body font-bold" style={{ background: fill, color: text }}>{b.mark}</span>
      {!compact && <span className="text-body font-semibold max-sm:hidden" style={{ color: bg === "#FFFFFF" ? "#101614" : fill }}>{b.name}</span>}
    </span>
  );
}

function ClearSpace({ b }: { b: Brand }) {
  return (
    <svg viewBox="0 0 240 120" className="w-full max-w-[240px]" role="img" aria-label="Clear space diagram: x is the minimum clear space on every side">
      <rect x="1" y="1" width="238" height="118" rx="10" fill="#F7F9F8" stroke="#E1E7E4" />
      <rect x="50" y="22" width="140" height="76" rx="6" fill="none" stroke="#93A09A" strokeDasharray="4 4" />
      <rect x="80" y="42" width="80" height="36" rx="6" fill={b.primary} />
      <text x="120" y="66" textAnchor="middle" fontSize="16" fontWeight="600" fill={onColor(b.primary)}>{b.mark}</text>
      {[[65, 60, "x"], [175, 60, "x"], [120, 34, "x"], [120, 92, "x"]].map(([x, y, t], i) => <text key={i} x={x} y={Number(y) + 4} textAnchor="middle" fontSize="11" fontStyle="italic" fill="#5E6C66">{t}</text>)}
      <text x="120" y="115" textAnchor="middle" fontSize="12" fill="#56645E">x = clear space on every side</text>
    </svg>
  );
}

/** One logo rule on a plain row; only the small mark carries the meaning. */
function RuleItem({ children, bad }: { children: ReactNode; bad?: boolean }) {
  return (
    <li className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-meta text-ink-3">
      {bad ? <X aria-hidden className="mt-0.5 h-4 w-4 flex-none text-mute-2" /> : <Check aria-hidden className="mt-0.5 h-4 w-4 flex-none text-ok" />}
      <span>{children}</span>
    </li>
  );
}

function ListBlock({ title, items, tone }: { title: string; items?: string[]; tone: "good" | "bad" }) {
  return (
    <div>
      <h3 className="m-0 mb-1.5 flex items-center gap-1.5 text-meta font-semibold text-ink-3">
        {tone === "good" ? <Check aria-hidden className="h-4 w-4 text-ok" /> : <X aria-hidden className="h-4 w-4 text-mute-2" />}{title}
      </h3>
      {items?.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {items.map((x) => <li key={x} className="text-body leading-[1.45] text-ink-3">{x}</li>)}
        </ul>
      ) : <Missing />}
    </div>
  );
}

function WordBlock({ title, items, tone }: { title: string; items?: string[]; tone: "good" | "bad" }) {
  return (
    <div className="mt-4 border-t border-divider pt-3">
      <h3 className="m-0 mb-2 text-meta font-semibold text-ink-3">{title}</h3>
      {items?.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {items.map((x) => <li key={x} className={cx("rounded-sm px-2 py-0.5 text-meta", tone === "good" ? "bg-soft text-ink-3" : "bg-chip text-mute-2 line-through")}>{x}</li>)}
        </ul>
      ) : <Missing />}
    </div>
  );
}
