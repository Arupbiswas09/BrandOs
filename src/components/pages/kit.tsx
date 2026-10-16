"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Copy, Download, ExternalLink, FileText, Pencil, Plus, Printer, Upload, X } from "lucide-react";
import type { Asset, Brand, BrandColour, FileRef } from "@/db/schema";
import { saveAsset } from "@/app/actions";
import { cmykText, onColor, rgbText, wcag } from "@/lib/color";
import { fmtDate } from "@/lib/format";
import { defaultScale, kitScore } from "@/lib/kit";
import { checkBatch } from "@/lib/upload-policy";
import { live, plural, type WS } from "@/lib/ws";
import { useAction, useApp } from "@/components/app/provider";
import { AssetCard } from "@/components/cards";
import { kitStartsOn, type KitTab } from "@/components/modals/kit";
import { Sections, SectionsHead, SectionTitle, type SectionItem } from "@/components/section-tabs";
import { Btn, Card, CodeTile, cx } from "@/components/ui";

/* ---------------------------------------------------------------- sections */

type Key = "pdf" | "logo" | "colour" | "type" | "voice" | "imagery" | "files" | "ctas";

/** The kit's sections in reading order. The URL hash (#kit-logo) says which one is open. */
const SECTIONS: SectionItem<Key>[] = [
  { key: "pdf", label: "Guidelines PDF" },
  { key: "logo", label: "Logo" },
  { key: "colour", label: "Colour" },
  { key: "type", label: "Typography" },
  { key: "voice", label: "Voice" },
  { key: "imagery", label: "Imagery and rules" },
  { key: "files", label: "Files" },
  { key: "ctas", label: "CTAs" },
];
const KEYS = SECTIONS.map((s) => s.key);

/** Which editor tab each section opens on. */
const EDIT_TAB: Partial<Record<Key, KitTab>> = { logo: "logo", colour: "colour", type: "type", voice: "voice", imagery: "rules" };

/** Where each completeness check is filled in: a section of the page, and the editor tab (none for uploads). */
const FILL: Record<string, { section: Key; tab: KitTab | null }> = {
  logo: { section: "logo", tab: null },
  logoRules: { section: "logo", tab: "logo" },
  colours: { section: "colour", tab: "colour" },
  print: { section: "colour", tab: "colour" },
  fonts: { section: "type", tab: "type" },
  scale: { section: "type", tab: "type" },
  voice: { section: "voice", tab: "voice" },
  imagery: { section: "imagery", tab: "rules" },
  rules: { section: "imagery", tab: "rules" },
  boilerplate: { section: "voice", tab: "voice" },
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
  if (k === "rules") return "imagery"; // the old "Do's and don'ts" anchor
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
  const hasPdf = guideFiles(ws, b).some((g) => embeddable(g.file));

  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const items = ctas ? SECTIONS : SECTIONS.filter((s) => s.key !== "ctas");
  const asked = fromHash(hash);
  const active: Key = asked && items.some((s) => s.key === asked) ? asked : hasPdf ? "pdf" : "logo";
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
        {active === "pdf" && <GuidelinesPdf b={b} />}
        {active === "logo" && <LogoSection b={b} />}
        {active === "colour" && <ColourSection b={b} />}
        {active === "type" && <TypeSection b={b} />}
        {active === "voice" && <VoiceSection b={b} />}
        {active === "imagery" && <ImagerySection b={b} />}
        {active === "files" && <FilesSection b={b} />}
        {active === "ctas" && ctas}
      </Sections>
    </>
  );
}

/* ---------------------------------------------------------------- logo */

function LogoSection({ b }: { b: Brand }) {
  const { ws, open } = useApp();
  const k = b.kit ?? {};
  const logos = live(ws.assetsOf(b.id)).filter((a) => a.type === "Logo");
  const logoPreview = logos.map((a) => ws.previewOf(a)).find(Boolean) ?? null;
  const canEdit = ws.can("kit");
  const add = () => open({ kind: "asset", draft: { brandId: b.id, type: "Logo", status: "Ready", offerIds: [] }, step: 3 });
  return (
    <section aria-label="Logo">
      <SectionTitle title="Logo" sub="The master files and the rules for using them."
        actions={canEdit && <Btn size="sm" onClick={add}><Plus aria-hidden className="h-4 w-4" />Add a logo file</Btn>} />
      <div className="grid grid-cols-3 gap-3">
        {[
          { bg: "#FFFFFF", label: "On white", ring: true },
          { bg: b.primary, label: "On primary" },
          { bg: "#101614", label: "On dark" },
        ].map((t) => (
          <figure key={t.label} className="m-0">
            <div className={cx("flex aspect-[2/1] items-center justify-center rounded-xl sm:aspect-[5/2]", t.ring && "border border-line")} style={{ background: t.bg }}>
              {logoPreview && t.bg === "#FFFFFF"
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={logoPreview} alt={`${b.name} logo`} className="max-h-[60%] max-w-[70%] object-contain" />
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

      <h3 className="mb-2 mt-5 text-meta font-semibold text-ink-3">Logo files</h3>
      {logos.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {logos.map((a) => <AssetCard key={a.id} a={a} variant="kit" />)}
        </div>
      ) : <EmptyBlock text="No logo files yet. Add the master files so nobody has to ask for them." />}
    </section>
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

function VoiceSection({ b }: { b: Brand }) {
  const { toast } = useApp();
  const k = b.kit ?? {};
  const copy = () => { void navigator.clipboard?.writeText(b.boilerplate).catch(() => {}); toast("Boilerplate copied"); };
  return (
    <section aria-label="Voice">
      <SectionTitle title="Voice and tone" sub="How the brand sounds. The voice stays the same; the tone shifts with the moment." />
      <p className="m-0 max-w-[65ch] text-lead leading-[1.55] text-ink text-pretty">{b.voice || <Missing />}</p>
      {!!k.values?.length && (
        <ul aria-label="Values" className="m-0 mt-3 flex list-none flex-wrap gap-1.5 p-0">
          {k.values.map((v) => <li key={v} className="rounded-full bg-soft px-3 py-1 text-meta font-medium text-ink-3">{v}</li>)}
        </ul>
      )}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Card className="px-5 py-4">
          <ListBlock title="We are" items={k.weAre} tone="good" />
          <WordBlock title="Words we use" items={k.wordsUse} tone="good" />
        </Card>
        <Card className="px-5 py-4">
          <ListBlock title="We are not" items={k.weAreNot} tone="bad" />
          <WordBlock title="Words we avoid" items={k.wordsAvoid} tone="bad" />
        </Card>
      </div>
      {!!k.voiceExamples?.length && (
        <Card className="mt-3 overflow-hidden">
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
      <Card className="mt-3 px-5 py-4">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h3 className="m-0 text-meta font-semibold text-ink-3">Boilerplate</h3>
          {b.boilerplate && <Btn size="sm" variant="ghost" onClick={copy}><Copy aria-hidden className="h-3.5 w-3.5" />Copy</Btn>}
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

function FilesSection({ b }: { b: Brand }) {
  const { ws, openAsset } = useApp();
  const all = live(ws.assetsOf(b.id));
  // Guideline documents have their own section; this is everything else people come to download.
  const files = [...all.filter((a) => a.type === "Font"), ...all.filter((a) => a.isTemplate && a.type !== "Font")];
  return (
    <section aria-label="Files">
      <SectionTitle title="Files and templates" sub="Font files and the reusable templates for this brand." />
      {files.length ? (
        <Card className="overflow-hidden">
          {files.map((a) => <FileRow key={a.id} a={a} onOpen={() => openAsset(a.id)} />)}
        </Card>
      ) : <EmptyBlock text="Font files and templates added as master files show up here." />}
    </section>
  );
}

function FileRow({ a, onOpen }: { a: Asset; onOpen: () => void }) {
  const { ws } = useApp();
  const preview = ws.previewOf(a);
  const count = a.files.length;
  return (
    <button type="button" onClick={onOpen} className="focus-inset flex w-full items-center gap-3 border-t border-divider px-4 py-2.5 text-left transition-colors duration-150 first:border-t-0 hover:bg-hover">
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

/* ---------------------------------------------------------------- guidelines PDF */

type GuideFile = { file: FileRef; asset: Asset | null };

const isPdf = (f: Pick<FileRef, "name" | "type">) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
/** Only files BrandOS stores can show inline: the page may frame its own origin and nothing else. */
const embeddable = (f: FileRef) => !!f.url?.startsWith("/api/files/") && isPdf(f);

/** The brand's live Guidelines assets, most recently changed first. */
const guideAssets = (ws: WS, b: Brand) =>
  live(ws.assetsOf(b.id)).filter((a) => a.type === "Guidelines").sort((x, y) => +new Date(y.updatedAt) - +new Date(x.updatedAt));

/**
 * Every guidelines file a brand has: the files on its Guidelines assets
 * (newest asset first, newest upload first), then the files kept on the
 * brand itself.
 */
function guideFiles(ws: WS, b: Brand): GuideFile[] {
  return [
    ...guideAssets(ws, b).flatMap((a) => [...a.files].reverse().map((file) => ({ file, asset: a }))),
    ...b.guidelines.map((file) => ({ file, asset: null })),
  ];
}

/**
 * The brand's guidelines PDF, readable on the page: the newest PDF BrandOS
 * holds for it. People who can upload add one, or a newer version, to the
 * brand's Guidelines asset, which is made for them if there is none yet.
 */
function GuidelinesPdf({ b }: { b: Brand }) {
  const { ws, toast } = useApp();
  const [run] = useAction();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<string | null>(null);

  const files = guideFiles(ws, b);
  const pdfs = files.filter((g) => embeddable(g.file));
  const shown = pdfs.find((g) => g.file.key === pick) ?? pdfs[0] ?? null;
  const others = files.filter((g) => g !== shown);
  // New uploads go to the newest Guidelines asset, so they sit with the files already there.
  const target = guideAssets(ws, b)[0] ?? null;
  const canUpload = ws.d.uploadsEnabled && ws.can("upload") && (target ? ws.canChange(target) : ws.can("edit"));

  const upload = async (f: File) => {
    if (!isPdf({ name: f.name, type: f.type })) { toast("Pick a PDF file.", "error"); return; }
    const problem = checkBatch([{ name: f.name, size: f.size }], ws.d.uploads.mine);
    if (problem) { toast(problem, "error"); return; }
    setBusy(true);
    try {
      let id = target?.id;
      if (!id) {
        const r = await run(saveAsset, { brandId: b.id, name: "Brand guidelines", type: "Guidelines", channel: "Owned", status: "Ready", offerIds: [] });
        if (!r.ok || !r.id) return;
        id = r.id;
      }
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`/api/assets/${id}/files`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast(body.error ?? "The PDF did not upload. Try again.", "error"); return; }
      setPick(null);
      toast(`${f.name} is up`);
      router.refresh();
    } catch {
      toast("The PDF did not upload. Check your connection and try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const uploadBtn = (label: string, primary = false) => (
    <Btn size="sm" variant={primary ? "primary" : "secondary"} disabled={busy} onClick={() => input.current?.click()}>
      <Upload aria-hidden className="h-3.5 w-3.5" />{busy ? "Uploading…" : label}
    </Btn>
  );
  // The guidelines' own version when the kit records one, otherwise the asset's.
  const version = b.kit?.version ? `v${b.kit.version}` : shown?.asset ? `v${shown.asset.version}` : "";
  // With a PDF on show, older versions and other files wait behind one line.
  const wrapOthers = (list: ReactNode) => shown ? (
    <details className="group mt-4">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 text-body font-medium text-ink-3 hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="h-4 w-4 text-mute-2 transition-transform duration-150 ease-snap group-open:rotate-90 motion-reduce:transition-none" />
        {plural(others.length, "other guideline file")}
      </summary>
      <div className="mt-2">{list}</div>
    </details>
  ) : list;
  const smallLink = "inline-flex h-8 flex-none items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-surface px-3 text-meta font-medium text-ink-3 transition-colors duration-150 hover:border-line-strong hover:bg-wash";

  return (
    <section aria-label="Guidelines PDF">
      <SectionTitle title="Guidelines PDF" sub="The full guidelines document, readable here without downloading it."
        actions={shown && canUpload && uploadBtn("Upload a new version")} />
      {canUpload && (
        <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" tabIndex={-1} aria-hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
      )}
      {shown ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-divider px-4 py-3 sm:px-5">
            <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-soft text-accent"><FileText aria-hidden className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-semibold">{shown.asset?.name ?? shown.file.name.replace(/\.pdf$/i, "")}</span>
              <span className="block truncate text-small text-mute-2" suppressHydrationWarning>
                {[version, shown.asset && `Updated ${fmtDate(shown.asset.updatedAt)}`, shown.file.name, shown.file.size].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="flex flex-wrap gap-2">
              <a href={`${shown.file.url}?inline=1`} target="_blank" rel="noopener" className={smallLink}><ExternalLink aria-hidden className="h-3.5 w-3.5" />Open full screen<span className="sr-only"> (opens in a new tab)</span></a>
              <a href={shown.file.url} download={shown.file.name} className={smallLink}><Download aria-hidden className="h-3.5 w-3.5" />Download</a>
            </span>
          </div>
          <iframe key={shown.file.key} src={`${shown.file.url}?inline=1`} title={`${b.name} guidelines: ${shown.file.name}`} className="block h-[520px] w-full border-0 bg-wash sm:h-[60vh]" />
        </Card>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong px-6 py-8 text-center">
          <p className="m-0 max-w-[52ch] text-body text-mute-1 text-pretty">There is no guidelines PDF for {b.name} yet{canUpload ? "" : ". Someone who can upload files can add it"}.</p>
          {canUpload && uploadBtn("Upload the guidelines PDF", true)}
        </div>
      )}
      {others.length > 0 && !shown && <h3 className="mb-2 mt-5 text-meta font-semibold text-ink-3">Guideline files</h3>}
      {others.length > 0 && wrapOthers(
          <div className="rounded-xl border border-line bg-surface">
            {others.map((g, i) => (
              <div key={`${g.asset?.id ?? "brand"}-${g.file.key ?? g.file.name}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-divider px-4 py-2.5 first:border-t-0 sm:px-5">
                <FileText aria-hidden className="h-4 w-4 flex-none text-mute-2" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium">{g.file.name}</span>
                  <span className="block truncate text-small text-mute-2">{[g.asset?.name ?? "Kept on the brand", g.file.size].filter(Boolean).join(" · ")}</span>
                </span>
                {!g.file.url ? (
                  <span className="text-small text-mute-2">Not uploaded yet</span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    {embeddable(g.file) && <Btn size="sm" variant="ghost" onClick={() => { setPick(g.file.key ?? null); window.scrollTo({ top: 0 }); }}>Show here</Btn>}
                    <a href={g.file.url} download={g.file.name} aria-label={`Download ${g.file.name}`} className="inline-flex size-8 items-center justify-center rounded-lg text-mute-2 hover:bg-hover hover:text-ink"><Download aria-hidden className="h-4 w-4" /></a>
                  </span>
                )}
              </div>
            ))}
          </div>,
      )}
    </section>
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

function LogoMark({ b, bg }: { b: Brand; bg: string }) {
  const onPrimary = bg === b.primary;
  const fill = bg === "#FFFFFF" ? b.primary : onPrimary ? onColor(b.primary) : "#FFFFFF";
  const text = bg === "#FFFFFF" ? onColor(b.primary) : onPrimary ? b.primary : "#101614";
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-10 items-center justify-center rounded-xl text-body font-bold" style={{ background: fill, color: text }}>{b.mark}</span>
      <span className="text-body font-semibold max-sm:hidden" style={{ color: bg === "#FFFFFF" ? "#101614" : fill }}>{b.name}</span>
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
