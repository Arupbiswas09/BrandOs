"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Brand, Offer } from "@/db/schema";
import { onColor } from "@/lib/color";
import { offerTypesOf } from "@/lib/constants";
import { href, parsePath } from "@/lib/routes";
import { addTags, tagPool } from "@/lib/tags";
import { saveCta, saveOffer } from "@/app/actions";
import { toDateInput } from "@/lib/time";
import { useAction, useApp } from "@/components/app/provider";
import { TagInput } from "@/components/tag-input";
import { Btn, Field, Select, cx } from "@/components/ui";
import { Footer, Modal, MoreDetail } from "./frame";

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
    tags: draft.tags ?? [],
    dueAt: toDateInput(draft.dueAt),
  });
  // A tag half typed in the box; saving adds it too.
  const [tagText, setTagText] = useState("");
  const tagsInUse = useMemo(() => tagPool(ws.d.offers), [ws.d.offers]);
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

  const services = [{ value: "", label: "Standalone, no service" }, ...ws.servicesOf(d.brandId).filter((v) => !v.archived || v.id === d.serviceId).map((v) => ({ value: v.id, label: v.name }))];
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
  // How much is already filled in behind "More detail", said on the closed toggle.
  const filled = [d.promise, d.proof, d.primaryCtaId, d.secondaryCtaId, d.offerType, d.short, d.dueAt].filter((x) => x.trim()).length
    + (d.tags.length || tagText.trim() ? 1 : 0);

  const save = async () => {
    const r = await run(saveOffer, {
      id: draft.id, ...d,
      serviceId: d.serviceId || null,
      primaryCtaId: d.primaryCtaId || null,
      secondaryCtaId: d.secondaryCtaId || null,
      tags: addTags(d.tags, tagText, tagsInUse),
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
          left={<span className="text-meta text-mute-3">Only the name is required.{draft.id ? "" : " New offers start in Ideation."}</span>}
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
        <input data-autofocus aria-required="true" className="field text-lead" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Google Ads Grant Growth" />
      </Field>
      <Field label={<>What is it, in one sentence? <Aside>Someone who has never heard of it should get it</Aside></>}>
        <textarea rows={2} className="field text-lead leading-[1.55]" value={d.positioning} onChange={(e) => set("positioning", e.target.value)} placeholder="One sentence a stranger would understand." />
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
                className={cx("rounded-full border px-3 py-1 text-body font-medium transition", on ? "border-accent bg-soft text-accent" : "border-line bg-surface text-mute-1 hover:border-mute-4")}>
                {g.name}
              </button>
            );
          })}
          {/* Goals are set up by managers and admins; everyone else is told who can add them. */}
          {!(b?.goals ?? []).length && (
            <span className="text-body text-mute-3">
              {ws.can("structure") || ws.can("kit") ? "This brand has no goals yet. Add them on its Strategy tab." : "This brand has no goals yet. A manager or admin adds them on its Strategy tab."}
            </span>
          )}
        </div>
      </div>

      <MoreDetail open={more} onToggle={() => setMore((m) => !m)} filled={filled} hint="promise, proof, CTAs, type">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={<>Promise <Aside>What they get</Aside></>}>
              <textarea rows={3} className="field text-body leading-[1.5]" value={d.promise} onChange={(e) => set("promise", e.target.value)} placeholder="What the reader gets, with a number." />
            </Field>
            <Field label={<>Proof <Aside>Why believe it</Aside></>}>
              <textarea rows={3} className="field text-body leading-[1.5]" value={d.proof} onChange={(e) => set("proof", e.target.value)} placeholder="Why they should believe it." />
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
            <Field label="Launch date"><input type="date" className="field" value={d.dueAt} onChange={(e) => set("dueAt", e.target.value)} /></Field>
          </div>
          {/* Full width, so the label the card would use in its place has room to show. */}
          <Field
            label={<>Card label<span className="sr-only"> (30 characters or fewer)</span></>}
            hint={<span aria-hidden className="font-code text-small font-medium" style={{ color: shortLen > 30 ? "#C2410C" : "#5A6862" }}>{shortLen}/30</span>}
          >
            <input className="field text-body" value={d.short} onChange={(e) => set("short", e.target.value)} placeholder="Shown on the offer card, under the name" />
          </Field>
          {/* The last field, inside a clipped panel: suggestions open upwards. */}
          <TagInput above value={d.tags} onChange={(v) => set("tags", v)} text={tagText} onText={setTagText} pool={tagsInUse} placeholder="grant, church, search" />
      </MoreDetail>
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
  const swatches = [brand.primary, brand.secondary, ...brand.colours.map((c) => c.hex), "#101614"].filter((x, i, a) => !!x && a.indexOf(x) === i).slice(0, 7);

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
        <div id={`${uid}-title`} className="text-body font-semibold">New CTA for {SLOT_LABEL[slot]}</div>
        <span aria-hidden className="inline-block max-w-full truncate rounded-lg px-3.5 py-1.5 text-meta font-semibold" style={{ background: bg, color: onColor(bg) }}>{text.trim() || "Button text"}</span>
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
