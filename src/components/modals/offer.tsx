"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Brand, Offer } from "@/db/schema";
import { onColor } from "@/lib/color";
import { offerTypesOf } from "@/lib/constants";
import { href, parsePath } from "@/lib/routes";
import { saveCta, saveOffer } from "@/app/actions";
import { toDateInput } from "@/lib/time";
import { useAction, useApp } from "@/components/app/provider";
import { Btn, Field, Select, cx } from "@/components/ui";
import { Footer, Modal } from "./frame";

/** The CTA selects' last option: opens the inline "New CTA" form instead of selecting anything. */
const NEW_CTA = "__new_cta__";
type CtaSlot = "primaryCtaId" | "secondaryCtaId";
const SLOT_LABEL: Record<CtaSlot, string> = { primaryCtaId: "Primary CTA", secondaryCtaId: "Secondary CTA" };

/**
 * New and edit offer. Name, positioning, service, segment and goals up front;
 * promise, proof, CTAs, type, card label, launch date and tags wait behind
 * "More detail", because most offers start as a one-line idea.
 */
export function OfferModal({ draft }: { draft: Partial<Offer> & { brandId: string } }) {
  const { ws, close } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [run, pending] = useAction();
  const uid = useId();
  const [d, setD] = useState({
    brandId: draft.brandId,
    name: draft.name ?? "",
    short: draft.short ?? "",
    positioning: draft.positioning ?? "",
    promise: draft.promise ?? "",
    proof: draft.proof ?? "",
    serviceId: draft.serviceId ?? "",
    segment: draft.segment ?? "All segments",
    goals: draft.goals ?? [],
    offerType: draft.offerType ?? "",
    // Not shown: new offers start in Ideation, and status changes on the offer page.
    status: draft.status ?? "Ideation",
    primaryCtaId: draft.primaryCtaId ?? "",
    secondaryCtaId: draft.secondaryCtaId ?? "",
    tags: (draft.tags ?? []).join(", "),
    dueAt: toDateInput(draft.dueAt),
  });
  // Open straight away when anything behind "More detail" already has a value, so nothing is hidden.
  const [more, setMore] = useState(() => !!(draft.promise || draft.proof || draft.primaryCtaId || draft.secondaryCtaId || draft.offerType || draft.short || draft.dueAt || draft.tags?.length));
  const [ctaFor, setCtaFor] = useState<CtaSlot | null>(null);
  // CTAs made in this dialog, shown before the workspace refresh brings them in.
  const [made, setMade] = useState<{ id: string; text: string; brandId: string }[]>([]);
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));

  const b = ws.brand(d.brandId);
  const brands = ws.d.brands.filter((x) => !x.archived);
  const here = parsePath(pathname).view;
  const pickBrand = !draft.id && !draft.serviceId && !["brand", "offer", "service"].includes(here) && brands.length > 1;

  const services = [{ value: "", label: "Standalone — sits above every service" }, ...ws.servicesOf(d.brandId).filter((v) => !v.archived || v.id === d.serviceId).map((v) => ({ value: v.id, label: v.name }))];
  const segments = (b?.segments ?? []).map((x) => x.name);
  if (!segments.includes(d.segment)) segments.push(d.segment);
  const showService = services.length > 1;
  const showSegment = segments.length > 1;

  const types = offerTypesOf(b);
  const typeOptions = [
    { value: "", label: "Not decided yet" },
    ...types.map((x) => ({ value: x, label: x })),
    ...(d.offerType && !types.includes(d.offerType) ? [{ value: d.offerType, label: d.offerType }] : []),
  ];

  const known = ws.ctasOf(d.brandId);
  const ctaOptions = [
    { value: "", label: "None" },
    ...known.map((c) => ({ value: c.id, label: c.text })),
    ...made.filter((c) => c.brandId === d.brandId && !known.some((k) => k.id === c.id)).map((c) => ({ value: c.id, label: c.text })),
    ...(ws.can("edit") ? [{ value: NEW_CTA, label: "+ Create a new CTA…" }] : []),
  ];
  const ctaSelectId = (slot: CtaSlot) => `${uid}-${slot}`;
  const pickCta = (slot: CtaSlot, v: string) => {
    if (v === NEW_CTA) setCtaFor(slot);
    else set(slot, v);
  };
  const doneCta = (slot: CtaSlot, cta?: { id: string; text: string }) => {
    if (cta) {
      setMade((m) => [...m, { ...cta, brandId: d.brandId }]);
      set(slot, cta.id);
    }
    setCtaFor(null);
    requestAnimationFrame(() => document.getElementById(ctaSelectId(slot))?.focus());
  };

  const shortLen = d.short.length;
  const moreId = `${uid}-more`;

  const save = async () => {
    const r = await run(saveOffer, {
      id: draft.id, ...d,
      serviceId: d.serviceId || null,
      primaryCtaId: d.primaryCtaId || null,
      secondaryCtaId: d.secondaryCtaId || null,
      tags: d.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      dueAt: d.dueAt || null,
    });
    if (r.ok) { close(); if (!draft.id && r.id) router.push(href.offer(r.id)); }
  };

  return (
    <Modal
      title={draft.id ? "Edit offer" : "New offer"}
      sub={`In ${b?.name}.${draft.id ? "" : " Four things now. Promise, proof and CTAs can wait until you know them."}`}
      width={640}
      onSubmit={save}
      footer={
        <Footer
          saveLabel="Save offer"
          pending={pending}
          disabled={!d.name.trim()}
          left={<span className="text-[13.5px] text-mute-3">Only the name is required.{draft.id ? "" : " New offers start in Ideation."}</span>}
        />
      }
    >
      {pickBrand && (
        <Field label="Brand">
          <Select
            value={d.brandId}
            onChange={(v) => { setCtaFor(null); setD((x) => ({ ...x, brandId: v, serviceId: "", segment: "All segments", goals: [], offerType: "", primaryCtaId: "", secondaryCtaId: "" })); }}
            options={brands.map((x) => ({ value: x.id, label: x.name }))}
          />
        </Field>
      )}
      {/* aria-required rather than required: Save stays disabled until there is a name, and the footer says what is required. */}
      <Field label="Offer name" required>
        <input data-autofocus aria-required="true" className="field text-[16px]" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Google Ads Grant Growth" />
      </Field>
      <Field label={<>What is it, in one sentence? <Aside>Someone who has never heard of it should get it</Aside></>}>
        <textarea rows={2} className="field text-[16px] leading-[1.55]" value={d.positioning} onChange={(e) => set("positioning", e.target.value)} placeholder="One sentence a stranger would understand." />
      </Field>
      {(showService || showSegment) && (
        <div className={cx("grid gap-3", showService && showSegment && "sm:grid-cols-2")}>
          {showService && <Field label="Sits under"><Select value={d.serviceId} onChange={(v) => set("serviceId", v)} options={services} /></Field>}
          {showSegment && <Field label="Written for"><Select value={d.segment} onChange={(v) => set("segment", v)} options={segments.map((x) => ({ value: x, label: x }))} /></Field>}
        </div>
      )}
      <div>
        <div id={`${uid}-goals`} className="label">What should it achieve? <Aside>Pick one or more</Aside></div>
        <div role="group" aria-labelledby={`${uid}-goals`} className="flex flex-wrap gap-1.5">
          {(b?.goals ?? []).map((g) => {
            const on = d.goals.includes(g.name);
            return (
              <button key={g.name} type="button" aria-pressed={on} title={g.description} onClick={() => set("goals", on ? d.goals.filter((x) => x !== g.name) : [...d.goals, g.name])}
                className={cx("rounded-full border px-[13px] py-[5px] text-[14.5px] font-medium transition", on ? "border-accent bg-soft text-accent" : "border-line bg-white text-mute-1 hover:border-mute-4")}>
                {g.name}
              </button>
            );
          })}
          {!(b?.goals ?? []).length && <span className="text-[15px] text-mute-3">This brand has no goals yet. Add them on its Strategy tab.</span>}
        </div>
      </div>

      <div className="border-t border-line">
        <button
          type="button"
          aria-expanded={more}
          aria-controls={moreId}
          onClick={() => setMore((m) => !m)}
          className="group flex w-full items-center gap-3 rounded-lg py-3 text-left"
        >
          <span aria-hidden className="w-3 flex-none text-center text-[17px] leading-none text-mute-3">{more ? "−" : "+"}</span>
          <span className="min-w-0 flex-1 text-[15px] text-ink-3">
            <span className="font-semibold text-ink group-hover:underline">{more ? "Less detail" : "More detail"}</span>
            {!more && <span className="font-medium"> — promise, proof, CTAs, type</span>}
          </span>
          <span className="flex-none font-code text-[13px] text-mute-3">optional</span>
        </button>
        <div
          id={moreId}
          inert={!more}
          className={cx("grid transition-[grid-template-rows,opacity] duration-200 ease-out", more ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}
        >
          {/* The side padding keeps focus rings clear of the clipping edge. */}
          <div className="-mx-1 min-h-0 overflow-hidden px-1">
            <div className="flex flex-col gap-4 pb-1 pt-1.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={<>Promise <Aside>What they get</Aside></>}>
                  <textarea rows={3} className="field text-[15px] leading-[1.5]" value={d.promise} onChange={(e) => set("promise", e.target.value)} placeholder="What the reader gets, with a number." />
                </Field>
                <Field label={<>Proof <Aside>Why believe it</Aside></>}>
                  <textarea rows={3} className="field text-[15px] leading-[1.5]" value={d.proof} onChange={(e) => set("proof", e.target.value)} placeholder="Why they should believe it." />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["primaryCtaId", "secondaryCtaId"] as const).map((slot) => (
                  <Field key={slot} label={SLOT_LABEL[slot]}>
                    <Select id={ctaSelectId(slot)} value={d[slot]} onChange={(v) => pickCta(slot, v)} options={ctaOptions} />
                  </Field>
                ))}
              </div>
              {ctaFor && b && <NewCta key={ctaFor} brand={b} slot={ctaFor} onDone={(cta) => doneCta(ctaFor, cta)} />}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Offer type"><Select value={d.offerType} onChange={(v) => set("offerType", v)} options={typeOptions} /></Field>
                <Field
                  label={<>Card label<span className="sr-only"> (30 characters or fewer)</span></>}
                  hint={<span aria-hidden className="font-code text-[13px] font-medium" style={{ color: shortLen > 30 ? "#C2410C" : "#526077" }}>{shortLen}/30</span>}
                >
                  <input className="field text-[15px]" value={d.short} onChange={(e) => set("short", e.target.value)} placeholder="Shown on the offer card" />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Launch date"><input type="date" className="field" value={d.dueAt} onChange={(e) => set("dueAt", e.target.value)} /></Field>
                <Field label="Tags" hint={<span className="font-normal text-mute-4">comma separated</span>}>
                  <input className="field" value={d.tags} onChange={(e) => set("tags", e.target.value)} placeholder="grant, church, search" />
                </Field>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Quiet helper text that sits on the label line. */
function Aside({ children }: { children: string }) {
  return <span className="ml-1 font-normal text-mute-3">{children}</span>;
}

/**
 * A small CTA form inside the offer dialog, opened from a CTA select's
 * "+ Create a new CTA…". It is not a <form> (the dialog already is one), so
 * Enter and Escape are handled here and never reach the offer form.
 */
function NewCta({ brand, slot, onDone }: { brand: Brand; slot: CtaSlot; onDone: (cta?: { id: string; text: string }) => void }) {
  const [run, pending] = useAction();
  const uid = useId();
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [bg, setBg] = useState(brand.primary);
  const swatches = [brand.primary, brand.secondary, ...brand.colours.map((c) => c.hex), "#0F172A"].filter((x, i, a) => !!x && a.indexOf(x) === i).slice(0, 7);

  const add = async () => {
    const t = text.trim();
    if (!t || pending) return;
    const r = await run(saveCta, { brandId: brand.id, text: t, url: url.trim(), style: "solid", bg, fg: onColor(bg) });
    if (r.ok && r.id) onDone({ id: r.id, text: t });
  };
  const keys = (e: KeyboardEvent) => {
    // Enter in a field adds the CTA; on a button it keeps its usual meaning.
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) { e.preventDefault(); void add(); }
    if (e.key === "Escape") { e.stopPropagation(); onDone(); }
  };

  return (
    <div role="group" aria-labelledby={`${uid}-title`} onKeyDown={keys} className="animate-pop rounded-xl border border-line bg-wash-2 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div id={`${uid}-title`} className="text-[15px] font-semibold">New CTA for {SLOT_LABEL[slot]}</div>
        <span aria-hidden className="inline-block max-w-full truncate rounded-[7px] px-3.5 py-[6px] text-[14px] font-semibold" style={{ background: bg, color: onColor(bg) }}>{text.trim() || "Button text"}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Button text" required>
          <input autoFocus aria-required="true" className="field" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} placeholder="Book a Grant Audit" />
        </Field>
        <Field label="Destination">
          <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="yoursite.org/book" />
        </Field>
      </div>
      <div className="mt-3">
        <div id={`${uid}-colour`} className="label">Colour</div>
        <div role="group" aria-labelledby={`${uid}-colour`} className="flex flex-wrap gap-2">
          {swatches.map((hx) => (
            <button key={hx} type="button" aria-label={`Use ${hx}`} aria-pressed={bg === hx} onClick={() => setBg(hx)}
              className={cx("h-[30px] w-[30px] rounded-lg border", bg === hx ? "border-ink ring-1 ring-ink" : "border-line")} style={{ background: hx }} />
          ))}
        </div>
      </div>
      <div className="mt-3.5 flex justify-end gap-2">
        <Btn size="sm" onClick={() => onDone()}>Cancel</Btn>
        <Btn size="sm" variant="primary" disabled={pending || !text.trim()} onClick={add}>{pending ? "Adding…" : "Add CTA"}</Btn>
      </div>
    </div>
  );
}
