"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createBrandFromDraft, scanWebsite } from "@/app/onboarding-actions";
import type { SiteDraft } from "@/lib/site-draft";
import { colourName } from "@/lib/site-draft";
import { isHex } from "@/lib/color";
import { freshBrandPair } from "@/lib/constants";
import { href } from "@/lib/routes";
import { useApp } from "@/components/app/provider";
import { Btn, Card, Empty, Field, IconBtn, Select, cx } from "@/components/ui";
import { Choice, StepTitle, plural } from "./parts";

/*
 * "Start a brand from its website": paste an address, BrandOS reads the site
 * and drafts the kit, the person checks every field, then Create brand.
 * One page, no modal. Logo previews arrive inside the scan as data: URLs, so
 * nothing is loaded from the other site in the browser.
 */

type Role = "Primary" | "Secondary" | "Extra";
type ColourRow = { key: string; hex: string; text: string; role: Role; from?: string };
type FontRow = { key: string; name: string; role: string; weights: string; source: string; fallback: string };
type ServiceRow = { key: string; on: boolean; name: string; short: string };

type Form = {
  name: string; tagline: string; description: string; voice: string;
  colours: ColourRow[]; fonts: FontRow[]; logo: string | null; services: ServiceRow[]; segments: string[];
  clientMode: "existing" | "new"; clientId: string; newClientName: string;
};

let seq = 0;
const k = () => `r${++seq}`;
const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Where a colour came from, in plain words. */
function fromText(from: string) {
  if (from === "theme colour") return "the site's theme colour";
  if (from.startsWith("--")) return "a brand colour in its styles";
  if (from === "styles") return "used across its styles";
  if (from === "page") return "used on the page";
  if (from === "logo") return "in its logo";
  if (from === "a fresh pair") return "a starting colour, nothing stood out";
  return "added by you";
}

const FONT_ROLES = ["Headings", "Body", "Headings and body", "All type", "Accent"];

const STEPS = ["Reading the home page", "Reading its styles and its services page", "Picking out the logo, colours and fonts"];

function formFrom(d: SiteDraft, clients: { id: string; name: string }[], brands: { primary: string; archived?: boolean }[], preset?: string): Form {
  const [p, q] = freshBrandPair(brands);
  const primary = d.primary ?? p;
  const secondary = d.secondary ?? q;
  const others = d.colours.filter((c) => c.hex !== primary && c.hex !== secondary);
  const match = clients.find((c) => c.id === preset) ?? clients.find((c) => loose(c.name) === loose(d.name) || loose(c.name) === loose(d.host.split(".")[0]));
  return {
    name: d.name, tagline: d.tagline, description: d.description, voice: d.voice,
    colours: [
      { key: k(), hex: primary, text: primary, role: "Primary", from: d.colours.find((c) => c.hex === primary)?.from ?? "a fresh pair" },
      { key: k(), hex: secondary, text: secondary, role: "Secondary", from: d.colours.find((c) => c.hex === secondary)?.from ?? "a fresh pair" },
      ...others.map((c): ColourRow => ({ key: k(), hex: c.hex, text: c.hex, role: "Extra", from: c.from })),
    ],
    fonts: d.fonts.map((f) => ({ key: k(), ...f })),
    logo: d.logos.find((l) => l.kind === "logo")?.url ?? d.logos[0]?.url ?? null,
    services: d.services.map((s) => ({ key: k(), on: true, name: s.name, short: s.oneLine })),
    segments: d.segments,
    clientMode: match ? "existing" : "new",
    clientId: match?.id ?? clients[0]?.id ?? "",
    newClientName: d.name,
  };
}

/** Loads Google Fonts for the font rows, so each name shows in its own face. */
function useGoogleFonts(names: string[]) {
  const key = names.join("|");
  useEffect(() => {
    for (const name of key.split("|").filter(Boolean)) {
      const id = "gf-" + name.replace(/\W+/g, "-").toLowerCase();
      if (document.getElementById(id)) continue;
      const l = document.createElement("link");
      l.id = id;
      l.rel = "stylesheet";
      l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}:wght@400;600&display=swap`;
      document.head.appendChild(l);
    }
  }, [key]);
}

export function FromWebsite({ clientId, initialUrl = "" }: {
  /** Pre-picks this client (from a client page, say). */
  clientId?: string;
  /** Pre-fills the address field; the scan still waits for the button. */
  initialUrl?: string;
}) {
  const { ws, toast } = useApp();
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [scanning, setScanning] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SiteDraft | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const reviewRef = useRef<HTMLHeadingElement>(null);
  const clients = useMemo(() => ws.d.clients.filter((c) => !c.archived), [ws]);

  // The progress line moves on while the scan runs; the scan itself is one request.
  useEffect(() => {
    if (!scanning) return;
    const steps = ws.d.aiEnabled ? [...STEPS, "Tidying the wording"] : STEPS;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 2600);
    return () => clearInterval(t);
  }, [scanning, ws.d.aiEnabled]);

  if (!ws.can("structure")) {
    return <Empty title="Only managers and admins add brands" body="Setting up clients and brands is a manager's job. Ask one to start this brand, or to change your role." />;
  }

  const scan = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!url.trim() || scanning) return;
    setError(null);
    setStep(0);
    setScanning(true);
    try {
      const r = await scanWebsite(url.trim());
      if (!r.ok) { setError(r.error); return; }
      setDraft(r.draft);
      setForm(formFrom(r.draft, clients, ws.d.brands, clientId));
      setProblem(null);
      requestAnimationFrame(() => reviewRef.current?.focus());
    } catch {
      setError("The scan did not finish. Try again in a moment.");
    } finally {
      setScanning(false);
    }
  };

  const steps = ws.d.aiEnabled ? [...STEPS, "Tidying the wording"] : STEPS;

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        {!draft || scanning ? (
          <form onSubmit={scan} noValidate>
            <StepTitle n={1} sub="BrandOS reads the home page, its stylesheets and a page about its services, and drafts the logo, colours, fonts, tagline and services. Nothing is saved until you create the brand.">
              The brand&apos;s website
            </StepTitle>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Website address" className="min-w-0 flex-1" error={error ?? undefined}>
                <input className="field h-10 py-2" inputMode="url" autoComplete="url" spellCheck={false} placeholder="harbourandpine.co.uk"
                  value={url} onChange={(e) => setUrl(e.target.value)} disabled={scanning} aria-invalid={!!error} />
              </Field>
              <Btn type="submit" variant="primary" size="lg" disabled={!url.trim() || scanning}>{scanning ? "Scanning" : "Scan the website"}</Btn>
            </div>
            <p role="status" aria-live="polite" className="mb-0 mt-3 min-h-5 text-meta text-mute-2">
              {scanning && <><span aria-hidden className="mr-2 inline-block size-1.5 animate-shimmer rounded-full bg-accent align-middle motion-reduce:animate-none" />{steps[step]}</>}
            </p>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="eyebrow mb-1">Draft from</div>
              <div className="truncate text-body font-semibold text-ink">{draft.host}</div>
            </div>
            <Btn variant="secondary" size="sm" onClick={() => { setDraft(null); setForm(null); }}>Scan another site</Btn>
          </div>
        )}
      </Card>

      {draft && form && !scanning && (
        <Review draft={draft} form={form} setForm={setForm} reviewRef={reviewRef} clients={clients} saving={saving} problem={problem}
          onCreate={async () => {
            const f = form;
            const primary = f.colours.find((c) => c.role === "Primary");
            const secondary = f.colours.find((c) => c.role === "Secondary");
            if (!f.name.trim()) return setProblem("Give the brand a name.");
            if (!primary || !secondary) return setProblem("Pick a primary and a secondary colour.");
            const bad = f.colours.find((c) => !isHex(c.hex));
            if (bad) return setProblem(`${bad.text || "One colour"} is not a hex colour like #1F6F5C.`);
            if (f.clientMode === "existing" && !f.clientId) return setProblem("Pick the client this brand belongs to.");
            if (f.clientMode === "new" && !f.newClientName.trim()) return setProblem("Name the new client.");
            setProblem(null);
            setSaving(true);
            try {
              const r = await createBrandFromDraft({
                clientId: f.clientMode === "existing" ? f.clientId : null,
                newClientName: f.clientMode === "new" ? f.newClientName.trim() : undefined,
                name: f.name.trim(), tagline: f.tagline, description: f.description, voice: f.voice,
                primary: primary.hex, secondary: secondary.hex,
                colours: f.colours.filter((c) => c.role === "Extra").map((c) => ({ hex: c.hex })),
                fonts: f.fonts.filter((x) => x.name.trim()).map(({ name, role, weights, source, fallback }) => ({ name: name.trim(), role, weights, source, fallback })),
                logoUrl: f.logo,
                services: f.services.filter((s) => s.on && s.name.trim()).map((s) => ({ name: s.name.trim(), short: s.short.trim() })),
                segments: f.segments,
                website: draft.url,
              });
              if (!r.ok) { setProblem(r.error); return; }
              toast(`${f.name.trim()} is set up`);
              for (const n of r.notes) toast(n, "info");
              router.push(href.brand(r.id));
            } catch {
              setProblem("The brand was not created. Try again in a moment.");
            } finally {
              setSaving(false);
            }
          }} />
      )}
    </div>
  );
}

function Review({ draft, form, setForm, reviewRef, clients, saving, problem, onCreate }: {
  draft: SiteDraft; form: Form; setForm: (f: Form) => void; reviewRef: RefObject<HTMLHeadingElement | null>;
  clients: { id: string; name: string }[]; saving: boolean; problem: string | null; onCreate: () => void;
}) {
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  useGoogleFonts(form.fonts.filter((f) => /google/i.test(f.source)).map((f) => f.name));
  const kept = form.services.filter((s) => s.on && s.name.trim()).length;

  const setRole = (key: string, role: Role) => {
    let colours = form.colours.map((c) => (c.key === key ? { ...c, role } : c.role === role && role !== "Extra" ? { ...c, role: "Extra" as Role } : c));
    // There is always a primary and a secondary while there are two colours to choose from.
    for (const need of ["Primary", "Secondary"] as Role[]) {
      if (!colours.some((c) => c.role === need)) {
        const spare = colours.find((c) => c.role === "Extra" && c.key !== key);
        if (spare) colours = colours.map((c) => (c.key === spare.key ? { ...c, role: need } : c));
      }
    }
    set({ colours });
  };
  const removeColour = (key: string) => {
    const gone = form.colours.find((c) => c.key === key);
    let colours = form.colours.filter((c) => c.key !== key);
    if (gone && gone.role !== "Extra") {
      const spare = colours.find((c) => c.role === "Extra");
      if (spare) colours = colours.map((c) => (c.key === spare.key ? { ...c, role: gone.role } : c));
    }
    set({ colours });
  };

  return (
    <>
      <Card className="p-5 sm:p-6">
        <h2 ref={reviewRef} tabIndex={-1} className="m-0 text-lead font-semibold text-ink outline-none">Check the draft</h2>
        <p className="mb-0 mt-1 max-w-[64ch] text-meta text-mute-2 text-pretty">Everything here is editable. Change what is wrong, untick what does not belong, then create the brand.</p>
        {draft.notes.length > 0 && (
          <div className="mt-4 rounded-lg bg-wash px-4 py-3">
            <div className="eyebrow mb-1.5">What BrandOS noticed</div>
            <ul className="m-0 list-disc space-y-1 pl-4 text-meta leading-[1.5] text-ink-3 marker:text-mute-2">
              {draft.notes.map((n, i) => <li key={i} className="text-pretty">{n}</li>)}
            </ul>
          </div>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <StepTitle n={2}>Name and words</StepTitle>
        <div className="grid gap-4">
          <Field label="Brand name" required><input className="field" value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={200} /></Field>
          <Field label="Tagline" hint={<span className="font-normal text-mute-2">{form.tagline.length}/200</span>}>
            <input className="field" value={form.tagline} onChange={(e) => set({ tagline: e.target.value })} maxLength={200} />
          </Field>
          <Field label="What the brand is"><textarea rows={3} className="field leading-[1.55]" value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={5000} /></Field>
          <Field label="Voice and tone" hint={<span className="font-normal text-mute-2">how it should sound</span>}>
            <textarea rows={3} className="field leading-[1.55]" value={form.voice} onChange={(e) => set({ voice: e.target.value })} maxLength={5000} />
          </Field>
          {form.segments.length > 0 && (
            <div>
              <div className="label">Audiences it speaks to</div>
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {form.segments.map((s) => (
                  <li key={s} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-0.5 pl-3 pr-0.5 text-meta text-ink-3">
                    {s}
                    <IconBtn size="sm" label={`Remove ${s}`} onClick={() => set({ segments: form.segments.filter((x) => x !== s) })}><X aria-hidden /></IconBtn>
                  </li>
                ))}
              </ul>
              <p className="mb-0 mt-1.5 text-small text-mute-2">These become the brand&apos;s segments.</p>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <StepTitle n={3} sub="Most used on the site first. Choose which is primary and which secondary; the rest stay in the kit as extra colours.">Colours</StepTitle>
        <ul className="m-0 list-none space-y-2 p-0">
          {form.colours.map((c) => (
            <li key={c.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-2 py-2 sm:flex-nowrap sm:gap-3">
              <input type="color" aria-label={`Pick ${c.role.toLowerCase()} colour`} value={isHex(c.hex) && c.hex.length === 7 ? c.hex : "#000000"}
                onChange={(e) => set({ colours: form.colours.map((x) => (x.key === c.key ? { ...x, hex: e.target.value.toUpperCase(), text: e.target.value.toUpperCase(), from: "picked" } : x)) })}
                className="h-9 w-10 flex-none cursor-pointer rounded-md border border-line bg-surface p-0.5" />
              <input aria-label="Hex value" value={c.text} spellCheck={false} maxLength={7}
                aria-invalid={!isHex(c.text)}
                onChange={(e) => {
                  const text = e.target.value.trim();
                  const t = text.startsWith("#") ? text : `#${text}`;
                  set({ colours: form.colours.map((x) => (x.key === c.key ? { ...x, text: e.target.value, ...(isHex(t) && { hex: t.toUpperCase(), from: "typed" }) } : x)) });
                }}
                className="field h-9 w-[104px] flex-none py-1 font-mono text-meta uppercase" />
              <span className="hidden min-w-0 flex-1 truncate text-meta text-mute-2 sm:block">{isHex(c.hex) ? colourName(c.hex) : ""}{c.from ? ` · ${fromText(c.from)}` : ""}</span>
              <span className="ml-auto flex items-center gap-1 sm:ml-0">
                <Choice label={`Role of ${c.hex}`} value={c.role} onChange={(r) => setRole(c.key, r)}
                  options={[{ value: "Primary", label: "Primary" }, { value: "Secondary", label: "Secondary" }, { value: "Extra", label: "Extra" }]} />
                <IconBtn label={`Remove ${c.hex}`} disabled={form.colours.length <= 2} onClick={() => removeColour(c.key)}><X aria-hidden /></IconBtn>
              </span>
            </li>
          ))}
        </ul>
        <Btn variant="ghost" size="sm" className="mt-2 px-1" disabled={form.colours.length >= 12}
          onClick={() => set({ colours: [...form.colours, { key: k(), hex: "#5E6C66", text: "#5E6C66", role: "Extra", from: "added" }] })}>
          <Plus aria-hidden className="size-4" />Add a colour
        </Btn>
      </Card>

      <Card className="p-5 sm:p-6">
        <StepTitle n={4} sub={form.fonts.length ? "Each name shows in its own face when it comes from Google Fonts." : "No web fonts were found. Add the brand's fonts if you know them."}>Fonts</StepTitle>
        {form.fonts.length > 0 && (
          <ul className="m-0 mb-2 list-none space-y-2 p-0">
            {form.fonts.map((f) => (
              <li key={f.key} className="grid grid-cols-[1fr_auto] items-start gap-2 rounded-lg border border-line px-3 py-2.5 sm:grid-cols-[1fr_200px_auto] sm:items-center sm:gap-3">
                <div className="min-w-0">
                  <input aria-label="Font name" value={f.name} maxLength={80} onChange={(e) => set({ fonts: form.fonts.map((x) => (x.key === f.key ? { ...x, name: e.target.value } : x)) })}
                    className="field h-9 py-1 text-lead" style={{ fontFamily: `"${f.name}", ${f.fallback || "system-ui, sans-serif"}` }} />
                  {(f.source || f.weights) && <div className="mt-1 truncate text-small text-mute-2">{[f.source, f.weights && `weights ${f.weights}`].filter(Boolean).join(" · ")}</div>}
                </div>
                <IconBtn className="sm:order-3" label={`Remove ${f.name || "font"}`} onClick={() => set({ fonts: form.fonts.filter((x) => x.key !== f.key) })}><X aria-hidden /></IconBtn>
                <Select aria-label={`What ${f.name || "this font"} is for`} value={f.role} onChange={(v) => set({ fonts: form.fonts.map((x) => (x.key === f.key ? { ...x, role: v } : x)) })}
                  className="col-span-2 h-9 py-1 text-meta sm:order-2 sm:col-span-1"
                  options={[{ value: "", label: "Not sure yet" }, ...FONT_ROLES.map((r) => ({ value: r, label: r })), ...(f.role && !FONT_ROLES.includes(f.role) ? [{ value: f.role, label: f.role }] : [])]} />
              </li>
            ))}
          </ul>
        )}
        <Btn variant="ghost" size="sm" className="px-1" disabled={form.fonts.length >= 8}
          onClick={() => set({ fonts: [...form.fonts, { key: k(), name: "", role: "", weights: "", source: "", fallback: "" }] })}>
          <Plus aria-hidden className="size-4" />Add a font
        </Btn>
      </Card>

      <Card className="p-5 sm:p-6">
        <StepTitle n={5} sub="The one you pick is saved as a Logo asset on the brand.">Logo</StepTitle>
        <fieldset className="m-0 border-0 p-0">
          <legend className="sr-only">Logo</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {draft.logos.map((l) => (
              <label key={l.url} className="block cursor-pointer">
                <input type="radio" name="logo" className="peer sr-only" checked={form.logo === l.url} onChange={() => set({ logo: l.url })} />
                <span className="flex h-full flex-col rounded-lg border border-line bg-surface p-2 transition-colors duration-150 hover:border-line-strong peer-checked:border-accent peer-checked:bg-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                  <span className="flex h-20 items-center justify-center rounded-sm bg-wash p-2">
                    {/* A data: URL made on the server from the downloaded file; nothing loads from the other site. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={l.preview} alt="" className="max-h-full max-w-full object-contain" />
                  </span>
                  <span className="mt-2 block text-small font-medium text-ink">{l.label}</span>
                  <span className="block text-micro text-mute-2">{[l.type.replace("image/", "").replace("+xml", "").replace("x-icon", "ico").toUpperCase(), l.width && l.height ? `${l.width} × ${l.height}` : ""].filter(Boolean).join(" · ")}</span>
                </span>
              </label>
            ))}
            <label className="block cursor-pointer">
              <input type="radio" name="logo" className="peer sr-only" checked={form.logo === null} onChange={() => set({ logo: null })} />
              <span className="flex h-full min-h-[132px] flex-col items-center justify-center rounded-lg border border-dashed border-line-strong p-2 text-center transition-colors duration-150 hover:border-mute-2 peer-checked:border-accent peer-checked:bg-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                <span className="text-small font-medium text-ink">No logo</span>
                <span className="text-micro text-mute-2">add one later</span>
              </span>
            </label>
          </div>
        </fieldset>
      </Card>

      <Card className="p-5 sm:p-6">
        <StepTitle n={6} sub="Ticked services are added to the brand. Rename them to how the team talks about them.">Services</StepTitle>
        {form.services.length > 0 && (
          <ul className="m-0 mb-2 list-none space-y-2 p-0">
            {form.services.map((s) => (
              <li key={s.key} className={cx("flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-150", s.on ? "border-line" : "border-dashed border-line bg-wash")}>
                <input type="checkbox" checked={s.on} aria-label={`Add ${s.name || "this service"}`} onChange={(e) => set({ services: form.services.map((x) => (x.key === s.key ? { ...x, on: e.target.checked } : x)) })}
                  className="mt-2.5 size-4 flex-none cursor-pointer accent-accent" />
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  <input aria-label="Service name" className="field h-9 py-1 font-medium" value={s.name} maxLength={200} disabled={!s.on}
                    onChange={(e) => set({ services: form.services.map((x) => (x.key === s.key ? { ...x, name: e.target.value } : x)) })} />
                  <input aria-label={`One line on ${s.name || "this service"}`} className="field h-9 py-1 text-meta" placeholder="One line on what it is" value={s.short} maxLength={200} disabled={!s.on}
                    onChange={(e) => set({ services: form.services.map((x) => (x.key === s.key ? { ...x, short: e.target.value } : x)) })} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <Btn variant="ghost" size="sm" className="px-1" disabled={form.services.length >= 12}
          onClick={() => set({ services: [...form.services, { key: k(), on: true, name: "", short: "" }] })}>
          <Plus aria-hidden className="size-4" />Add a service
        </Btn>
      </Card>

      <Card className="p-5 sm:p-6">
        <StepTitle n={7}>Who it is for</StepTitle>
        <div className="grid gap-4">
          <div><Choice label="Client" value={form.clientMode} onChange={(v) => set({ clientMode: v })}
            options={[{ value: "existing", label: "An existing client" }, { value: "new", label: "A new client" }]} /></div>
          {form.clientMode === "existing" ? (
            clients.length ? (
              <Field label="Client"><Select value={form.clientId} onChange={(v) => set({ clientId: v })} options={clients.map((c) => ({ value: c.id, label: c.name }))} /></Field>
            ) : <p className="m-0 text-meta text-mute-2">There are no clients yet. Choose a new client instead.</p>
          ) : (
            <Field label="New client's name" required><input className="field" value={form.newClientName} maxLength={200} onChange={(e) => set({ newClientName: e.target.value })} /></Field>
          )}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-divider pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 text-meta text-mute-2 text-pretty">
            Creates {form.name.trim() || "the brand"} with {plural(form.colours.length, "colour")}, {plural(form.fonts.filter((f) => f.name.trim()).length, "font")}{kept ? `, ${plural(kept, "service")}` : ""}{form.logo ? " and its logo" : ""}.
          </p>
          <Btn variant="primary" size="lg" disabled={saving} onClick={onCreate}>{saving ? "Creating" : "Create brand"}</Btn>
        </div>
        {problem && <p role="alert" className="mb-0 mt-3 text-meta font-medium text-danger">{problem}</p>}
      </Card>
    </>
  );
}
