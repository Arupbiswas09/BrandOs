"use client";

import { useState } from "react";
import type { BrandColour, BrandFont, BrandKit, ColourRole, TypeStyle } from "@/db/schema";
import { cmykText, isHex } from "@/lib/color";
import { SEGMENT_PALETTE } from "@/lib/constants";
import { defaultScale } from "@/lib/kit";
import { saveKit } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { Btn, Chip, Field, Select, Tabs } from "@/components/ui";
import { ColourInput } from "./forms";
import { Footer, Modal } from "./frame";

const ROLES: ColourRole[] = ["Primary", "Secondary", "Accent", "Neutral", "Background", "Text"];
const TABS = [["colour", "Colour"], ["type", "Typography"], ["logo", "Logo"], ["voice", "Voice"], ["rules", "Imagery and rules"], ["segments", "Segments"]] as const;
type Tab = (typeof TABS)[number][0];

type Keyed<T> = T & { key: number };
let seq = 0;
const keyed = <T,>(x: T): Keyed<T> => ({ ...x, key: ++seq });
const strip = <T,>({ key: _k, ...x }: Keyed<T>) => x as T;

/** Lines in a textarea ↔ a list of strings. */
const toLines = (l?: string[]) => (l ?? []).join("\n");
const fromLines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);

export function KitModal({ brandId }: { brandId: string }) {
  const { ws, close } = useApp();
  const [run, pending] = useAction();
  const b = ws.brand(brandId)!;
  const k = b.kit ?? {};
  const [tab, setTab] = useState<Tab>("colour");

  const [colours, setColours] = useState(b.colours.map((c) => keyed<BrandColour>(c)));
  const [fonts, setFonts] = useState(b.fonts.map((f) => keyed<BrandFont>(f)));
  const [scale, setScale] = useState((k.typeScale?.length ? k.typeScale : defaultScale(b)).map((t) => keyed<TypeStyle>(t)));
  const [segments, setSegments] = useState(b.segments.filter((x) => x.name !== "All segments").map((x) => keyed({ name: x.name, color: x.color, orig: x.name })));
  const [voice, setVoice] = useState(b.voice);
  const [boilerplate, setBoilerplate] = useState(b.boilerplate);
  const [t, setT] = useState({
    mission: k.mission ?? "", version: k.version ?? "",
    values: toLines(k.values), weAre: toLines(k.weAre), weAreNot: toLines(k.weAreNot),
    wordsUse: (k.wordsUse ?? []).join(", "), wordsAvoid: (k.wordsAvoid ?? []).join(", "),
    clearSpace: k.logo?.clearSpace ?? "", minDigital: k.logo?.minDigital ?? "", minPrint: k.logo?.minPrint ?? "", logoNotes: k.logo?.notes ?? "", misuse: toLines(k.logo?.misuse),
    imagery: k.imagery ?? "", imageryDo: toLines(k.imageryDo), imageryDont: toLines(k.imageryDont),
    dos: toLines(k.dos), donts: toLines(k.donts),
  });
  const [examples, setExamples] = useState((k.voiceExamples ?? []).map((e) => keyed(e)));
  const set = (key: keyof typeof t) => (e: { target: { value: string } }) => setT((x) => ({ ...x, [key]: e.target.value }));

  const badColour = colours.find((c) => !c.name.trim() || !isHex(c.hex));
  const error = badColour ? `Every colour needs a name and a hex value (check "${badColour.name || badColour.hex}").` : null;

  const save = async () => {
    if (error) { setTab("colour"); return; }
    const words = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
    const kit: BrandKit = {
      mission: t.mission.trim(), version: t.version.trim(),
      values: fromLines(t.values), weAre: fromLines(t.weAre), weAreNot: fromLines(t.weAreNot),
      wordsUse: words(t.wordsUse), wordsAvoid: words(t.wordsAvoid),
      voiceExamples: examples.map(strip).filter((e) => e.say.trim() || e.dont.trim()),
      typeScale: scale.map(strip).filter((s) => s.name.trim()),
      logo: { clearSpace: t.clearSpace.trim(), minDigital: t.minDigital.trim(), minPrint: t.minPrint.trim(), notes: t.logoNotes.trim(), misuse: fromLines(t.misuse) },
      imagery: t.imagery.trim(), imageryDo: fromLines(t.imageryDo), imageryDont: fromLines(t.imageryDont),
      dos: fromLines(t.dos), donts: fromLines(t.donts),
    };
    const r = await run(saveKit, {
      brandId: b.id, voice, boilerplate, kit,
      colours: colours.map(strip).map((c) => ({ ...c, name: c.name.trim(), hex: c.hex.toUpperCase() })),
      fonts: fonts.map(strip).filter((f) => f.name.trim()),
      segments: segments.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), color: x.color })),
      segmentRenames: segments.filter((x) => x.orig && x.name.trim() && x.orig !== x.name.trim()).map((x) => [x.orig, x.name.trim()] as [string, string]),
    });
    if (r.ok) close();
  };

  const counts = (name: string) => ws.offersOf(b.id).filter((o) => o.segment === name).length;
  const fontOptions = [...new Set([...fonts.map((f) => f.name).filter(Boolean), ...scale.map((s) => s.font)])];

  return (
    <Modal title="Edit the Brand Kit" sub={`${b.name}. Changes show up everywhere this brand's kit is used, including client share pages.`} width={780} onSubmit={save}
      footer={<Footer saveLabel="Save kit" pending={pending} left={error ? <span role="alert" className="text-[13.5px] font-medium text-[#B42318]">{error}</span> : undefined} />} bodyClass="max-h-[64vh] overflow-y-auto pt-0">
      <Tabs className="sticky top-0 z-10 -mx-6 mb-1 mt-0 pt-3 border-b border-line bg-white px-5 sm:-mx-7" items={TABS.map(([key, label]) => ({ key, label, active: tab === key, onClick: () => setTab(key) }))} />

      {tab === "colour" && (
        <section className="flex flex-col gap-3">
          <p className="m-0 text-[14px] text-mute-2">HEX and RGB are for screens. Add CMYK and Pantone for print — leave CMYK empty and it is worked out from the hex.</p>
          {colours.map((c) => (
            <div key={c.key} className="rounded-[11px] border border-line p-3">
              <div className="grid gap-2 sm:grid-cols-[auto_1fr_140px_auto]">
                <ColourInput label={c.name || "Colour"} value={c.hex} onChange={(v) => setColours((l) => l.map((x) => (x.key === c.key ? { ...x, hex: v } : x)))} />
                <input required className="field" placeholder="Name, e.g. Mangrove" aria-label="Colour name" value={c.name} onChange={(e) => setColours((l) => l.map((x) => (x.key === c.key ? { ...x, name: e.target.value } : x)))} />
                <Select aria-label="Colour role" value={c.role ?? ""} onChange={(v) => setColours((l) => l.map((x) => (x.key === c.key ? { ...x, role: (v || undefined) as ColourRole | undefined } : x)))} options={[{ value: "", label: "Role…" }, ...ROLES.map((r) => ({ value: r, label: r }))]} />
                <button type="button" aria-label={`Remove ${c.name || "colour"}`} onClick={() => setColours((l) => l.filter((x) => x.key !== c.key))} className="px-2 text-mute-5 hover:text-danger">✕</button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1.6fr_1fr_1fr]">
                <input className="field" placeholder="Where it is used" aria-label="Usage" value={c.usage} onChange={(e) => setColours((l) => l.map((x) => (x.key === c.key ? { ...x, usage: e.target.value } : x)))} />
                <input className="field font-code text-[13.5px]" placeholder={isHex(c.hex) ? cmykText(c.hex) : "CMYK"} title="CMYK — leave empty to use the value worked out from the hex" aria-label="CMYK" value={c.cmyk ?? ""} onChange={(e) => setColours((l) => l.map((x) => (x.key === c.key ? { ...x, cmyk: e.target.value } : x)))} />
                <input className="field font-code text-[13.5px]" placeholder="Pantone, e.g. 7722 C" aria-label="Pantone" value={c.pantone ?? ""} onChange={(e) => setColours((l) => l.map((x) => (x.key === c.key ? { ...x, pantone: e.target.value } : x)))} />
              </div>
            </div>
          ))}
          <Btn size="sm" className="self-start" onClick={() => setColours((l) => [...l, keyed<BrandColour>({ name: "", hex: "#0F172A", usage: "" })])}>+ Add colour</Btn>
        </section>
      )}

      {tab === "type" && (
        <section className="flex flex-col gap-4">
          <div>
            <div className="label">Typefaces</div>
            <div className="flex flex-col gap-2">
              {fonts.map((f) => (
                <div key={f.key} className="rounded-[11px] border border-line p-3">
                  <div className="grid gap-2 sm:grid-cols-[1.3fr_1fr_auto]">
                    <input className="field" placeholder="Typeface, e.g. Inter" aria-label="Typeface" value={f.name} onChange={(e) => setFonts((l) => l.map((x) => (x.key === f.key ? { ...x, name: e.target.value } : x)))} />
                    <input className="field" placeholder="Role, e.g. Headings" aria-label="Role" value={f.role} onChange={(e) => setFonts((l) => l.map((x) => (x.key === f.key ? { ...x, role: e.target.value } : x)))} />
                    <button type="button" aria-label="Remove typeface" onClick={() => setFonts((l) => l.filter((x) => x.key !== f.key))} className="px-2 text-mute-5 hover:text-danger">✕</button>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <input className="field" placeholder="Weights: 400, 600" aria-label="Weights" value={f.weights ?? ""} onChange={(e) => setFonts((l) => l.map((x) => (x.key === f.key ? { ...x, weights: e.target.value } : x)))} />
                    <input className="field" placeholder="Fallback: Arial, sans-serif" aria-label="Fallback" value={f.fallback ?? ""} onChange={(e) => setFonts((l) => l.map((x) => (x.key === f.key ? { ...x, fallback: e.target.value } : x)))} />
                    <input className="field" placeholder="Source or licence" aria-label="Source" value={f.source ?? ""} onChange={(e) => setFonts((l) => l.map((x) => (x.key === f.key ? { ...x, source: e.target.value } : x)))} />
                  </div>
                </div>
              ))}
              <Btn size="sm" className="self-start" onClick={() => setFonts((l) => [...l, keyed<BrandFont>({ name: "", role: "", files: "" })])}>+ Add typeface</Btn>
            </div>
          </div>
          <div>
            <div className="label">Type scale</div>
            <div className="mb-1 hidden grid-cols-[1fr_1.2fr_70px_80px_70px_auto] gap-2 px-1 text-[12px] font-semibold text-mute-3 sm:grid"><span>Style</span><span>Typeface</span><span>Size px</span><span>Weight</span><span>Leading</span><span /></div>
            <div className="flex flex-col gap-2">
              {scale.map((s) => (
                <div key={s.key} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1.2fr_70px_80px_70px_auto]">
                  <input className="field" aria-label="Style name" value={s.name} onChange={(e) => setScale((l) => l.map((x) => (x.key === s.key ? { ...x, name: e.target.value } : x)))} />
                  <Select aria-label="Typeface" value={s.font} onChange={(v) => setScale((l) => l.map((x) => (x.key === s.key ? { ...x, font: v } : x)))} options={fontOptions.map((f) => ({ value: f, label: f }))} />
                  <input type="number" min={6} max={200} className="field" aria-label="Size in pixels" value={s.size} onChange={(e) => setScale((l) => l.map((x) => (x.key === s.key ? { ...x, size: Number(e.target.value) || 16 } : x)))} />
                  <Select aria-label="Weight" value={String(s.weight)} onChange={(v) => setScale((l) => l.map((x) => (x.key === s.key ? { ...x, weight: Number(v) } : x)))} options={[300, 400, 500, 600, 700, 800].map((w) => ({ value: String(w), label: String(w) }))} />
                  <input type="number" step={0.05} min={0.8} max={3} className="field" aria-label="Line height" value={s.lineHeight} onChange={(e) => setScale((l) => l.map((x) => (x.key === s.key ? { ...x, lineHeight: Number(e.target.value) || 1.4 } : x)))} />
                  <button type="button" aria-label={`Remove ${s.name}`} onClick={() => setScale((l) => l.filter((x) => x.key !== s.key))} className="px-2 text-mute-5 hover:text-danger">✕</button>
                </div>
              ))}
              <Btn size="sm" className="self-start" onClick={() => setScale((l) => [...l, keyed<TypeStyle>({ name: "New style", font: fontOptions[0] ?? "Inter", size: 16, weight: 400, lineHeight: 1.5 })])}>+ Add style</Btn>
            </div>
          </div>
        </section>
      )}

      {tab === "logo" && (
        <section className="flex flex-col gap-3">
          <p className="m-0 text-[14px] text-mute-2">Upload the logo files themselves on the Brand Kit page (Add a logo file). Here are the rules for using them.</p>
          <Field label="Clear space" hint={<span className="font-normal text-mute-4">empty space kept around the logo</span>}><input className="field" value={t.clearSpace} onChange={set("clearSpace")} placeholder="The height of the Q on every side" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Minimum size, screen"><input className="field" value={t.minDigital} onChange={set("minDigital")} placeholder="24 px tall" /></Field>
            <Field label="Minimum size, print"><input className="field" value={t.minPrint} onChange={set("minPrint")} placeholder="10 mm tall" /></Field>
          </div>
          <Field label="Which version where"><textarea rows={2} className="field leading-[1.55]" value={t.logoNotes} onChange={set("logoNotes")} placeholder="Full colour on white, reversed on the primary colour or photography." /></Field>
          <Field label="Never do this" hint={<span className="font-normal text-mute-4">one per line</span>}><textarea rows={4} className="field leading-[1.55]" value={t.misuse} onChange={set("misuse")} placeholder={"Stretch or squash it\nRecolour it\nAdd shadows"} /></Field>
        </section>
      )}

      {tab === "voice" && (
        <section className="flex flex-col gap-3">
          <Field label="Mission" hint={<span className="font-normal text-mute-4">one or two sentences</span>}><textarea rows={2} className="field leading-[1.55]" value={t.mission} onChange={set("mission")} /></Field>
          <Field label="Values" hint={<span className="font-normal text-mute-4">one per line</span>}><textarea rows={3} className="field leading-[1.55]" value={t.values} onChange={set("values")} /></Field>
          <Field label="Voice and tone"><textarea rows={3} className="field leading-[1.55]" value={voice} onChange={(e) => setVoice(e.target.value)} placeholder="Warm and specific. Name the number." /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="We are" hint={<span className="font-normal text-mute-4">one per line</span>}><textarea rows={4} className="field leading-[1.55]" value={t.weAre} onChange={set("weAre")} placeholder={"Warm\nSpecific"} /></Field>
            <Field label="We are not" hint={<span className="font-normal text-mute-4">one per line</span>}><textarea rows={4} className="field leading-[1.55]" value={t.weAreNot} onChange={set("weAreNot")} placeholder={"Preachy\nVague"} /></Field>
            <Field label="Words we use" hint={<span className="font-normal text-mute-4">comma separated</span>}><input className="field" value={t.wordsUse} onChange={set("wordsUse")} /></Field>
            <Field label="Words we avoid" hint={<span className="font-normal text-mute-4">comma separated</span>}><input className="field" value={t.wordsAvoid} onChange={set("wordsAvoid")} /></Field>
          </div>
          <div>
            <div className="label">Examples</div>
            <div className="flex flex-col gap-2">
              {examples.map((e) => (
                <div key={e.key} className="grid gap-2 sm:grid-cols-[120px_1fr_1fr_auto]">
                  <input className="field" placeholder="Where" aria-label="Where" value={e.context} onChange={(ev) => setExamples((l) => l.map((x) => (x.key === e.key ? { ...x, context: ev.target.value } : x)))} />
                  <input className="field" placeholder="Say this" aria-label="Say this" value={e.say} onChange={(ev) => setExamples((l) => l.map((x) => (x.key === e.key ? { ...x, say: ev.target.value } : x)))} />
                  <input className="field" placeholder="Not this" aria-label="Not this" value={e.dont} onChange={(ev) => setExamples((l) => l.map((x) => (x.key === e.key ? { ...x, dont: ev.target.value } : x)))} />
                  <button type="button" aria-label="Remove example" onClick={() => setExamples((l) => l.filter((x) => x.key !== e.key))} className="px-2 text-mute-5 hover:text-danger">✕</button>
                </div>
              ))}
              <Btn size="sm" className="self-start" onClick={() => setExamples((l) => [...l, keyed({ context: "", say: "", dont: "" })])}>+ Add example</Btn>
            </div>
          </div>
          <Field label="Boilerplate"><textarea rows={3} className="field leading-[1.55]" value={boilerplate} onChange={(e) => setBoilerplate(e.target.value)} /></Field>
        </section>
      )}

      {tab === "rules" && (
        <section className="flex flex-col gap-3">
          <Field label="Imagery style"><textarea rows={3} className="field leading-[1.55]" value={t.imagery} onChange={set("imagery")} placeholder="Real people, natural light, candid moments." /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Imagery: look for" hint={<span className="font-normal text-mute-4">one per line</span>}><textarea rows={3} className="field leading-[1.55]" value={t.imageryDo} onChange={set("imageryDo")} /></Field>
            <Field label="Imagery: avoid" hint={<span className="font-normal text-mute-4">one per line</span>}><textarea rows={3} className="field leading-[1.55]" value={t.imageryDont} onChange={set("imageryDont")} /></Field>
            <Field label="Do" hint={<span className="font-normal text-mute-4">one per line</span>}><textarea rows={4} className="field leading-[1.55]" value={t.dos} onChange={set("dos")} /></Field>
            <Field label="Don't" hint={<span className="font-normal text-mute-4">one per line</span>}><textarea rows={4} className="field leading-[1.55]" value={t.donts} onChange={set("donts")} /></Field>
          </div>
          <Field label="Guidelines version" className="max-w-[220px]"><input className="field" value={t.version} onChange={set("version")} placeholder="2026.1" /></Field>
        </section>
      )}

      {tab === "segments" && (
        <section className="flex flex-col gap-2">
          <p className="m-0 mb-1 text-[14px] text-mute-2">Who the brand talks to. Renaming a segment moves its offers with it.</p>
          {segments.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <input type="color" aria-label={`${s.name} colour`} value={s.color} onChange={(e) => setSegments((l) => l.map((x) => (x.key === s.key ? { ...x, color: e.target.value.toUpperCase() } : x)))} className="h-8 w-9 flex-none cursor-pointer rounded-md border border-line bg-white p-0.5" />
              <input className="field flex-1" value={s.name} aria-label="Segment name" onChange={(e) => setSegments((l) => l.map((x) => (x.key === s.key ? { ...x, name: e.target.value } : x)))} />
              <span className="w-[62px] flex-none text-right text-[14px] text-mute-3">{s.orig ? counts(s.orig) : 0} offers</span>
              <button type="button" aria-label="Remove segment" disabled={!!s.orig && counts(s.orig) > 0} title={s.orig && counts(s.orig) > 0 ? "Offers still use this segment" : "Remove"} onClick={() => setSegments((l) => l.filter((x) => x.key !== s.key))} className="px-1.5 text-mute-5 hover:text-danger disabled:opacity-30">✕</button>
            </div>
          ))}
          <div className="flex items-center gap-2 text-[14.5px] text-mute-3"><Chip color="#475569">All segments</Chip> is always there for offers that speak to everyone.</div>
          <Btn size="sm" className="self-start" onClick={() => setSegments((l) => [...l, keyed({ name: "", color: SEGMENT_PALETTE[l.length % SEGMENT_PALETTE.length], orig: "" })])}>+ Add segment</Btn>
        </section>
      )}
    </Modal>
  );
}
