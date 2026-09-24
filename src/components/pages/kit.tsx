"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { Check, CheckCircle2, Circle, Copy, Download, FileText, Pencil, Printer, Share2, X } from "lucide-react";
import type { Brand, BrandColour } from "@/db/schema";
import { cmykText, onColor, rgbText, wcag } from "@/lib/color";
import { defaultScale, kitScore } from "@/lib/kit";
import { live } from "@/lib/ws";
import { useApp } from "@/components/app/provider";
import { AssetCard } from "@/components/cards";
import { Btn, Card, cx } from "@/components/ui";
import { SpotArt } from "@/components/art";

const SECTIONS = [
  ["kit-logo", "Logo"],
  ["kit-colour", "Colour"],
  ["kit-type", "Typography"],
  ["kit-voice", "Voice"],
  ["kit-imagery", "Imagery"],
  ["kit-rules", "Do's and don'ts"],
  ["kit-files", "Files"],
] as const;

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

export function BrandKit({ b }: { b: Brand }) {
  const { ws, open, toast } = useApp();
  const all = live(ws.assetsOf(b.id));
  const logos = all.filter((a) => a.type === "Logo");
  const fontFiles = all.filter((a) => a.type === "Font" || a.type === "Guidelines");
  const templates = all.filter((a) => a.isTemplate);
  const k = b.kit ?? {};
  const score = useMemo(() => kitScore(b, ws.d.assets), [b, ws.d.assets]);
  const canEdit = ws.can("kit");
  const scale = k.typeScale?.length ? k.typeScale : defaultScale(b);
  useBrandFonts([...b.fonts.map((f) => f.name), ...scale.map((s) => s.font)]);

  const copy = (v: string, what = v) => { void navigator.clipboard?.writeText(v).catch(() => {}); toast(`${what} copied`); };
  const logoPreview = logos.map((a) => ws.previewOf(a)).find(Boolean) ?? null;
  const missing = score.checks.filter((c) => !c.done);

  return (
    <>
      {/* ---------- overview */}
      <div className="mb-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="eyebrow mb-1.5">Brand guidelines{k.version ? ` · v${k.version}` : ""}</div>
              <h2 className="m-0 text-[22px] font-semibold tracking-[-0.015em]">{b.name} Brand Kit</h2>
              <p className="mb-0 mt-1.5 max-w-[60ch] text-[15px] leading-[1.55] text-mute-2 text-pretty">{k.mission || b.description || "The rules that keep every piece of work looking and sounding like this brand."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEdit && <Btn variant="primary" onClick={() => open({ kind: "kit", brandId: b.id })}><Pencil className="h-4 w-4" />Edit kit</Btn>}
              <a href={`/guidelines/${b.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-[8px] border border-line bg-white px-[13px] py-[7px] text-[15px] font-medium text-ink-3 hover:bg-wash"><Printer className="h-4 w-4" />Guidelines PDF</a>
              {ws.can("share") && <Btn onClick={() => open({ kind: "share", brandId: b.id })}><Share2 className="h-4 w-4" />Share</Btn>}
            </div>
          </div>
          {!!k.values?.length && (
            <div className="mt-4 flex flex-wrap gap-2">
              {k.values.map((v) => <span key={v} className="rounded-full bg-soft px-3 py-1 text-[13.5px] font-medium text-accent">{v}</span>)}
            </div>
          )}
          <nav aria-label="Brand Kit sections" className="mt-5 flex flex-wrap gap-1.5 border-t border-divider pt-4">
            {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-full border border-line px-3 py-1 text-[13.5px] font-medium text-mute-1 hover:border-accent hover:text-accent">{label}</a>)}
          </nav>
        </Card>
        <Card className="px-6 py-5">
          <div className="flex items-center gap-4">
            <Ring pct={score.pct} />
            <div>
              <div className="text-[16px] font-semibold">Kit completeness</div>
              <div className="text-[14px] text-mute-2">{score.done} of {score.total} sections that professional guidelines include.</div>
            </div>
          </div>
          <ul className="m-0 mt-4 grid list-none grid-cols-2 gap-x-3 gap-y-1.5 p-0">
            {score.checks.map((c) => (
              <li key={c.key} className="flex items-center gap-1.5 text-[13.5px]" title={c.hint}>
                {c.done ? <CheckCircle2 className="h-4 w-4 flex-none text-ok" /> : <Circle className="h-4 w-4 flex-none text-mute-5" />}
                <span className={c.done ? "text-mute-1" : "text-mute-3"}>{c.label}</span>
              </li>
            ))}
          </ul>
          {canEdit && missing.length > 0 && <button type="button" onClick={() => open({ kind: "kit", brandId: b.id })} className="mt-3 text-[14px] font-medium text-accent hover:underline">Fill in {missing[0].label.toLowerCase()} →</button>}
        </Card>
      </div>

      {/* ---------- logo */}
      <Section id="kit-logo" title="Logo" sub="The master files and the rules for using them.">
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="grid grid-cols-3 gap-3">
            {[
              { bg: "#FFFFFF", label: "On white", ring: true },
              { bg: b.primary, label: "On primary" },
              { bg: "#0F172A", label: "On dark" },
            ].map((t) => (
              <div key={t.label}>
                <div className={cx("flex aspect-[4/3] items-center justify-center rounded-xl", t.ring && "border border-line")} style={{ background: t.bg }}>
                  {logoPreview && t.bg === "#FFFFFF"
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={logoPreview} alt={`${b.name} logo`} className="max-h-[60%] max-w-[70%] object-contain" />
                    : <LogoMark b={b} bg={t.bg} />}
                </div>
                <div className="mt-1.5 text-center text-[13px] text-mute-3">{t.label}</div>
              </div>
            ))}
          </div>
          <Card className="px-5 py-4">
            <ClearSpace b={b} />
            <dl className="m-0 mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
              <dt className="font-semibold text-mute-1">Clear space</dt><dd className="m-0 text-ink-3">{k.logo?.clearSpace || <Missing />}</dd>
              <dt className="font-semibold text-mute-1">Minimum, screen</dt><dd className="m-0 text-ink-3">{k.logo?.minDigital || <Missing />}</dd>
              <dt className="font-semibold text-mute-1">Minimum, print</dt><dd className="m-0 text-ink-3">{k.logo?.minPrint || <Missing />}</dd>
            </dl>
            {k.logo?.notes && <p className="mb-0 mt-3 text-[14px] leading-[1.5] text-mute-1">{k.logo.notes}</p>}
          </Card>
        </div>
        {!!k.logo?.misuse?.length && (
          <div className="mt-4">
            <div className="mb-2 text-[14px] font-semibold text-mute-1">Never</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {k.logo.misuse.map((m) => <Rule key={m} bad>{m}</Rule>)}
            </div>
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4">
          {logos.map((a) => <AssetCard key={a.id} a={a} variant="kit" />)}
          {canEdit && (
            <button type="button" onClick={() => open({ kind: "asset", draft: { brandId: b.id, type: "Logo", status: "Ready", offerIds: [] }, step: 3 })} className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-[13px] border border-dashed border-line-strong text-[14px] font-medium text-mute-2 hover:border-accent hover:text-accent">
              <span className="text-[20px]">+</span>Add a logo file
            </button>
          )}
        </div>
      </Section>

      {/* ---------- colour */}
      <Section id="kit-colour" title="Colour" sub="Screen and print values for every colour. Click any value to copy it.">
        {b.colours.length ? (
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {b.colours.map((c) => <Swatch key={c.name + c.hex} c={c} copy={copy} />)}
          </div>
        ) : <EmptyBlock art="kit" text="No colours recorded yet." />}
        {b.colours.length > 1 && <ContrastGrid colours={b.colours.slice(0, 6)} />}
      </Section>

      {/* ---------- type */}
      <Section id="kit-type" title="Typography" sub="The typefaces, and the sizes to use them at.">
        <div className="grid gap-3.5 md:grid-cols-2">
          {b.fonts.map((f) => (
            <Card key={f.name + f.role} className="flex gap-4 px-5 py-4">
              <div className="flex h-[84px] w-[84px] flex-none items-center justify-center rounded-xl bg-wash text-[40px] text-ink" style={{ fontFamily: fontStack(f.name, f.fallback) }}>Aa</div>
              <div className="min-w-0">
                <div className="text-[17px] font-semibold" style={{ fontFamily: fontStack(f.name, f.fallback) }}>{f.name}</div>
                <div className="text-[14px] text-mute-2">{f.role}</div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-mute-3">
                  {f.weights && <span>Weights {f.weights}</span>}
                  {f.fallback && <span>Fallback {f.fallback}</span>}
                  {f.source && <span>{f.source}</span>}
                  {f.files && <span>{f.files}</span>}
                </div>
              </div>
            </Card>
          ))}
          {!b.fonts.length && <EmptyBlock art="kit" text="No typefaces recorded yet." />}
        </div>
        <Card className="mt-4 overflow-hidden">
          <div className="flex items-center justify-between border-b border-divider bg-wash-2 px-5 py-2.5">
            <span className="text-[13px] font-semibold uppercase tracking-[0.05em] text-mute-2">Type scale</span>
            {!k.typeScale?.length && <span className="text-[13px] text-mute-3">Suggested — edit the kit to set your own</span>}
          </div>
          {scale.map((t) => (
            <div key={t.name} className="flex flex-col gap-1 border-b border-divider px-5 py-3 last:border-b-0 md:flex-row md:items-center md:gap-6">
              <div className="w-[170px] flex-none">
                <div className="text-[14px] font-semibold">{t.name}</div>
                <div className="font-code text-[12.5px] text-mute-3">{t.size}px / {t.lineHeight} · {t.weight}{t.tracking ? ` · ${t.tracking}em` : ""}</div>
              </div>
              <div className="min-w-0 flex-1 truncate text-ink" style={{ fontFamily: fontStack(t.font), fontSize: Math.min(t.size, 56), fontWeight: t.weight, lineHeight: t.lineHeight, letterSpacing: t.tracking ? `${t.tracking}em` : undefined }}>
                {t.sample || (t.size >= 24 ? b.tagline || b.name : "The quick brown fox jumps over the lazy dog.")}
              </div>
            </div>
          ))}
        </Card>
      </Section>

      {/* ---------- voice */}
      <Section id="kit-voice" title="Voice and tone" sub="How the brand sounds. The voice stays the same; the tone shifts with the moment.">
        <Card className="mb-4 px-5 py-4">
          <p className="m-0 text-[16px] leading-[1.6] text-ink-3 text-pretty">{b.voice || <Missing />}</p>
        </Card>
        <div className="grid gap-4 md:grid-cols-2">
          <ListCard title="We are" items={k.weAre} tone="good" />
          <ListCard title="We are not" items={k.weAreNot} tone="bad" />
          <WordCard title="Words we use" items={k.wordsUse} tone="good" />
          <WordCard title="Words we avoid" items={k.wordsAvoid} tone="bad" />
        </div>
        {!!k.voiceExamples?.length && (
          <Card className="mt-4 overflow-hidden">
            <div className="grid grid-cols-[140px_1fr_1fr] border-b border-divider bg-wash-2 px-5 py-2.5 text-[13px] font-semibold uppercase tracking-[0.05em] text-mute-2 max-md:hidden">
              <span>Where</span><span>Say this</span><span>Not this</span>
            </div>
            {k.voiceExamples.map((e, i) => (
              <div key={i} className="grid gap-2 border-b border-divider px-5 py-3 last:border-b-0 md:grid-cols-[140px_1fr_1fr] md:gap-4">
                <span className="text-[13.5px] font-semibold text-mute-1">{e.context}</span>
                <span className="flex gap-2 text-[14.5px] text-ink-3"><Check className="mt-0.5 h-4 w-4 flex-none text-ok" />{e.say}</span>
                <span className="flex gap-2 text-[14.5px] text-mute-2 line-through decoration-[#DC2626]/40"><X className="mt-0.5 h-4 w-4 flex-none text-[#DC2626]" />{e.dont}</span>
              </div>
            ))}
          </Card>
        )}
        <Card className="mt-4 px-5 py-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[14px] font-semibold text-mute-1">Boilerplate</span>
            {b.boilerplate && <button type="button" onClick={() => copy(b.boilerplate, "Boilerplate")} className="inline-flex items-center gap-1 text-[13.5px] font-medium text-accent hover:underline"><Copy className="h-3.5 w-3.5" />Copy</button>}
          </div>
          <p className="m-0 text-[15px] leading-[1.6] text-ink-3 text-pretty">{b.boilerplate || <Missing />}</p>
        </Card>
      </Section>

      {/* ---------- imagery */}
      <Section id="kit-imagery" title="Imagery" sub="What photography and illustration should look like.">
        <Card className="mb-4 px-5 py-4"><p className="m-0 text-[15px] leading-[1.6] text-ink-3 text-pretty">{k.imagery || <Missing />}</p></Card>
        <div className="grid gap-4 md:grid-cols-2">
          <ListCard title="Look for" items={k.imageryDo} tone="good" />
          <ListCard title="Avoid" items={k.imageryDont} tone="bad" />
        </div>
      </Section>

      {/* ---------- rules */}
      <Section id="kit-rules" title="Do's and don'ts" sub="The rules people break most often.">
        <div className="grid gap-4 md:grid-cols-2">
          <ListCard title="Do" items={k.dos} tone="good" />
          <ListCard title="Don't" items={k.donts} tone="bad" />
        </div>
      </Section>

      {/* ---------- files */}
      <Section id="kit-files" title="Files and templates" sub="Master files, guideline documents and reusable templates.">
        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4">
          {fontFiles.map((a) => <AssetCard key={a.id} a={a} variant="font" />)}
          {templates.map((a) => <AssetCard key={a.id} a={a} variant="kit" />)}
          {b.guidelines.map((g) => (
            <div key={g.name} className="flex items-center gap-3 rounded-[13px] border border-line bg-white px-4 py-3">
              <FileText className="h-5 w-5 flex-none text-accent" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[14.5px] font-medium">{g.name}</span><span className="block text-[13px] text-mute-3">{g.size}</span></span>
              {g.url && <a href={g.url} aria-label={`Download ${g.name}`} className="text-mute-3 hover:text-ink"><Download className="h-4 w-4" /></a>}
            </div>
          ))}
          {!fontFiles.length && !templates.length && !b.guidelines.length && <div className="col-span-full"><EmptyBlock art="folder" text="No files yet. Add fonts, guideline PDFs or templates as master files." /></div>}
        </div>
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------- pieces */

function Section({ id, title, sub, children }: { id: string; title: string; sub: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-10 scroll-mt-24">
      <h2 className="m-0 text-[20px] font-semibold tracking-[-0.015em]">{title}</h2>
      <p className="mb-4 mt-1 text-[15px] text-mute-2">{sub}</p>
      {children}
    </section>
  );
}

function Missing() {
  return <span className="text-mute-4">Not set yet</span>;
}

function EmptyBlock({ art, text }: { art: "kit" | "folder"; text: string }) {
  return (
    <div className="col-span-full flex flex-col items-center rounded-[13px] border border-dashed border-line-strong px-6 py-6 text-center">
      <SpotArt kind={art} />
      <div className="mt-1 text-[14.5px] text-mute-2">{text}</div>
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" role="img" aria-label={`${pct}% complete`} className="flex-none">
      <circle cx="34" cy="34" r={r} fill="none" stroke="#E2E8F0" strokeWidth="7" />
      <circle cx="34" cy="34" r={r} fill="none" stroke="var(--bos-accent)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 34 34)" />
      <text x="34" y="39" textAnchor="middle" fontSize="15" fontWeight="700" fill="#0F172A">{pct}%</text>
    </svg>
  );
}

function LogoMark({ b, bg }: { b: Brand; bg: string }) {
  const onPrimary = bg === b.primary;
  const fill = bg === "#FFFFFF" ? b.primary : onPrimary ? onColor(b.primary) : "#FFFFFF";
  const text = bg === "#FFFFFF" ? onColor(b.primary) : onPrimary ? b.primary : "#0F172A";
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-10 w-10 items-center justify-center rounded-[10px] text-[15px] font-bold" style={{ background: fill, color: text }}>{b.mark}</span>
      <span className="text-[15px] font-semibold max-sm:hidden" style={{ color: bg === "#FFFFFF" ? "#0F172A" : fill }}>{b.name}</span>
    </span>
  );
}

function ClearSpace({ b }: { b: Brand }) {
  return (
    <svg viewBox="0 0 240 120" className="w-full" role="img" aria-label="Clear space diagram">
      <rect x="1" y="1" width="238" height="118" rx="10" fill="#F8FAFC" stroke="#E2E8F0" />
      <rect x="50" y="22" width="140" height="76" rx="6" fill="none" stroke="#94A3B8" strokeDasharray="4 4" />
      <rect x="80" y="42" width="80" height="36" rx="6" fill={b.primary} />
      <text x="120" y="66" textAnchor="middle" fontSize="15" fontWeight="700" fill={onColor(b.primary)}>{b.mark}</text>
      {[[65, 60, "x"], [175, 60, "x"], [120, 34, "x"], [120, 92, "x"]].map(([x, y, t], i) => <text key={i} x={x} y={Number(y) + 4} textAnchor="middle" fontSize="11" fontStyle="italic" fill="#64748B">{t}</text>)}
      <text x="120" y="114" textAnchor="middle" fontSize="9.5" fill="#64748B">x = minimum clear space on every side</text>
    </svg>
  );
}

function Swatch({ c, copy }: { c: BrandColour; copy: (v: string, what?: string) => void }) {
  // Surfaces are judged by the text that sits on them; everything else as text itself.
  const surface = c.role === "Background" || c.role === "Neutral";
  const grades: [string, ReturnType<typeof wcag>][] = surface
    ? [["dark text", wcag("#0F172A", c.hex)], ["white text", wcag("#FFFFFF", c.hex)]]
    : [["on white", wcag(c.hex, "#FFFFFF")], ["on black", wcag(c.hex, "#000000")]];
  const rows: [string, string][] = [["HEX", c.hex.toUpperCase()], ["RGB", rgbText(c.hex)], ["CMYK", c.cmyk || cmykText(c.hex)], ["Pantone", c.pantone || ""]];
  return (
    <Card className="overflow-hidden">
      <div className="flex h-[104px] flex-col justify-between p-3" style={{ background: c.hex, color: onColor(c.hex) }}>
        <span className="self-start rounded-full px-2 py-0.5 text-[11.5px] font-semibold uppercase tracking-[0.05em]" style={{ background: onColor(c.hex), color: c.hex === onColor(c.hex) ? "#FFFFFF" : c.hex }}>{c.role ?? "Colour"}</span>
        <span className="text-[26px] font-semibold leading-none">Aa</span>
      </div>
      <div className="px-4 pb-3 pt-3">
        <div className="text-[15.5px] font-semibold">{c.name}</div>
        {c.usage && <div className="mb-2 mt-0.5 text-[13.5px] leading-[1.4] text-mute-2">{c.usage}</div>}
        <dl className="m-0">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between border-t border-divider py-1">
              <dt className="text-[12px] font-semibold uppercase tracking-[0.05em] text-mute-3">{k}</dt>
              <dd className="m-0">
                {v ? <button type="button" onClick={() => copy(v, `${k} ${v}`)} className="font-code text-[12.5px] text-ink-3 hover:text-accent" title={k === "CMYK" && !c.cmyk ? "Worked out from the hex — confirm with your printer" : `Copy ${k}`}>{v}{k === "CMYK" && !c.cmyk ? "*" : ""}</button> : <span className="text-[12.5px] text-mute-4">—</span>}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-2 flex gap-1.5">
          {grades.map(([label, g]) => <Grade key={label} label={label} g={g} />)}
        </div>
      </div>
    </Card>
  );
}

function Grade({ label, g }: { label: string; g: ReturnType<typeof wcag> }) {
  const ok = g.grade !== "Fail";
  return (
    <span title={`Contrast ${g.ratio.toFixed(2)}:1 ${label}`} className={cx("rounded px-1.5 py-0.5 text-[11.5px] font-semibold", ok ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#FEE4E2] text-[#B42318]")}>
      {g.grade} {label}
    </span>
  );
}

/** Which colour can sit on which: text colour down the side, background across the top. */
function ContrastGrid({ colours }: { colours: BrandColour[] }) {
  const bgs = [...colours, { name: "White", hex: "#FFFFFF", usage: "" }];
  return (
    <Card className="mt-4 overflow-hidden">
      <div className="border-b border-divider bg-wash-2 px-5 py-2.5 text-[13px] font-semibold uppercase tracking-[0.05em] text-mute-2">Accessible pairings (WCAG 2.2)</div>
      <div className="overflow-x-auto p-4" data-scroll>
        <table className="border-separate border-spacing-1.5">
          <thead>
            <tr>
              <th className="px-2 text-left text-[12px] font-semibold text-mute-3" scope="col">Text ↓ / Background →</th>
              {bgs.map((b) => <th key={b.hex + b.name} scope="col" className="px-1 text-[12px] font-semibold text-mute-2">{b.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {colours.map((fg) => (
              <tr key={fg.hex + fg.name}>
                <th scope="row" className="px-2 text-left text-[12.5px] font-semibold text-mute-1">{fg.name}</th>
                {bgs.map((bg) => {
                  if (fg.hex.toLowerCase() === bg.hex.toLowerCase()) return <td key={bg.hex + bg.name} className="h-11 w-[84px] rounded-md bg-wash" />;
                  const g = wcag(fg.hex, bg.hex);
                  return (
                    <td key={bg.hex + bg.name} data-contrast-sample className="h-11 w-[84px] rounded-md text-center" style={{ background: bg.hex, color: fg.hex, boxShadow: "inset 0 0 0 1px #E2E8F0" }} title={`${g.ratio.toFixed(2)}:1`}>
                      <span className="block text-[13px] font-bold leading-none">Aa</span>
                      <span className="mt-0.5 block text-[10.5px] font-semibold leading-none" style={{ color: onColor(bg.hex) }}>{g.grade === "Fail" ? "✕ " : ""}{g.ratio.toFixed(1)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mb-0 mt-2 text-[12.5px] text-mute-3">4.5 or more passes AA for body text; 3 or more passes for large text (24px, or 19px bold). * CMYK values worked out from the hex.</p>
      </div>
    </Card>
  );
}

function Rule({ children, bad }: { children: ReactNode; bad?: boolean }) {
  return (
    <div className={cx("flex items-start gap-2 rounded-[11px] border px-3.5 py-2.5 text-[14px]", bad ? "border-[#FECACA] bg-[#FEF2F2] text-[#7F1D1D]" : "border-[#BBF7D0] bg-[#F0FDF4] text-[#14532D]")}>
      {bad ? <X className="mt-0.5 h-4 w-4 flex-none" /> : <Check className="mt-0.5 h-4 w-4 flex-none" />}
      <span>{children}</span>
    </div>
  );
}

function ListCard({ title, items, tone }: { title: string; items?: string[]; tone: "good" | "bad" }) {
  return (
    <Card className="px-5 py-4">
      <div className={cx("mb-2 flex items-center gap-2 text-[14px] font-semibold", tone === "good" ? "text-[#166534]" : "text-[#B42318]")}>
        {tone === "good" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}{title}
      </div>
      {items?.length ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {items.map((x) => <li key={x} className="text-[14.5px] leading-[1.45] text-ink-3">{x}</li>)}
        </ul>
      ) : <Missing />}
    </Card>
  );
}

function WordCard({ title, items, tone }: { title: string; items?: string[]; tone: "good" | "bad" }) {
  return (
    <Card className="px-5 py-4">
      <div className={cx("mb-2 text-[14px] font-semibold", tone === "good" ? "text-[#166534]" : "text-[#B42318]")}>{title}</div>
      {items?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((x) => <span key={x} className={cx("rounded-md px-2 py-0.5 text-[13.5px]", tone === "good" ? "bg-[#F0FDF4] text-[#14532D]" : "bg-[#FEF2F2] text-[#7F1D1D] line-through decoration-[#DC2626]/50")}>{x}</span>)}
        </div>
      ) : <Missing />}
    </Card>
  );
}
