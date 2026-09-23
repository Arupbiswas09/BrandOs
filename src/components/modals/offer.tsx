"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Offer } from "@/db/schema";
import { OFFER_STATUS, OFFER_TYPES } from "@/lib/constants";
import { href } from "@/lib/routes";
import { saveOffer } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { Field, Select, cx } from "@/components/ui";
import { Footer, Modal } from "./frame";

export function OfferModal({ draft }: { draft: Partial<Offer> & { brandId: string } }) {
  const { ws, close } = useApp();
  const router = useRouter();
  const [run, pending] = useAction();
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
    offerType: draft.offerType || "Paid engagement",
    status: draft.status ?? "Ideation",
    primaryCtaId: draft.primaryCtaId ?? "",
    secondaryCtaId: draft.secondaryCtaId ?? "",
    tags: (draft.tags ?? []).join(", "),
  });
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  const b = ws.brand(d.brandId);
  const segments = (b?.segments ?? []).map((x) => x.name);
  if (!segments.includes(d.segment)) segments.push(d.segment);
  const ctas = [{ value: "", label: "None" }, ...ws.ctasOf(d.brandId).map((c) => ({ value: c.id, label: c.text }))];
  const shortLen = d.short.length;

  const save = async () => {
    const r = await run(saveOffer, {
      id: draft.id, ...d,
      serviceId: d.serviceId || null,
      primaryCtaId: d.primaryCtaId || null,
      secondaryCtaId: d.secondaryCtaId || null,
      tags: d.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
    });
    if (r.ok) { close(); if (!draft.id && r.id) router.push(href.offer(r.id)); }
  };

  return (
    <Modal
      title={draft.id ? "Edit offer" : "New offer"}
      sub={`In ${b?.name}. ${draft.id ? "" : "Positioning first. You can pull existing assets in once the room exists."}`}
      width={640}
      onSubmit={save}
      footer={<Footer saveLabel="Save offer" pending={pending} disabled={!d.name.trim()} />}
    >
      {!draft.id && ws.d.brands.filter((x) => !x.archived).length > 1 && (
        <Field label="Brand">
          <Select value={d.brandId} onChange={(v) => setD((x) => ({ ...x, brandId: v, serviceId: "", segment: "All segments", goals: [], primaryCtaId: "", secondaryCtaId: "" }))} options={ws.d.brands.filter((x) => !x.archived).map((x) => ({ value: x.id, label: x.name }))} />
        </Field>
      )}
      <Field label="Offer name"><input className="field text-[16px]" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Google Ads Grant Growth" /></Field>
      <Field label="Short description" hint={<span className="font-medium" style={{ color: shortLen > 30 ? "#C2410C" : "#62706A" }}>{shortLen}/30</span>}>
        <input className="field text-[16px]" value={d.short} onChange={(e) => set("short", e.target.value)} placeholder="Grow grant-funded traffic" />
      </Field>
      <Field label="Positioning statement"><textarea rows={3} className="field text-[16px] leading-[1.55]" value={d.positioning} onChange={(e) => set("positioning", e.target.value)} placeholder="One sentence a stranger would understand." /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Promise"><textarea rows={3} className="field text-[15px] leading-[1.5]" value={d.promise} onChange={(e) => set("promise", e.target.value)} placeholder="What the reader gets, with a number." /></Field>
        <Field label="Proof"><textarea rows={3} className="field text-[15px] leading-[1.5]" value={d.proof} onChange={(e) => set("proof", e.target.value)} placeholder="Why they should believe it." /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Service">
          <Select value={d.serviceId} onChange={(v) => set("serviceId", v)} options={[{ value: "", label: "Standalone — sits above every service" }, ...ws.servicesOf(d.brandId).filter((v) => !v.archived || v.id === d.serviceId).map((v) => ({ value: v.id, label: v.name }))]} />
        </Field>
        <Field label="Segment"><Select value={d.segment} onChange={(v) => set("segment", v)} options={segments.map((x) => ({ value: x, label: x }))} /></Field>
      </div>
      <div>
        <div className="label">Goals this offer chases</div>
        <div className="flex flex-wrap gap-1.5">
          {(b?.goals ?? []).map((g) => {
            const on = d.goals.includes(g.name);
            return (
              <button key={g.name} type="button" aria-pressed={on} title={g.description} onClick={() => set("goals", on ? d.goals.filter((x) => x !== g.name) : [...d.goals, g.name])}
                className={cx("rounded-full border px-[13px] py-[5px] text-[14.5px] font-medium transition", on ? "border-accent bg-soft text-accent" : "border-line bg-white text-mute-1 hover:border-mute-4")}>
                {g.name}
              </button>
            );
          })}
          {!(b?.goals ?? []).length && <span className="text-[15px] text-mute-3">This brand has no goals yet. Add some in the Brand Kit.</span>}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Offer type"><Select value={d.offerType} onChange={(v) => set("offerType", v)} options={OFFER_TYPES.map((x) => ({ value: x, label: x }))} /></Field>
        <Field label="Status"><Select value={d.status} onChange={(v) => set("status", v as Offer["status"])} options={Object.keys(OFFER_STATUS).map((x) => ({ value: x, label: x }))} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Primary CTA"><Select value={d.primaryCtaId} onChange={(v) => set("primaryCtaId", v)} options={ctas} /></Field>
        <Field label="Secondary CTA"><Select value={d.secondaryCtaId} onChange={(v) => set("secondaryCtaId", v)} options={ctas} /></Field>
      </div>
      <Field label="Tags" hint={<span className="font-normal text-mute-4">comma separated</span>}>
        <input className="field" value={d.tags} onChange={(e) => set("tags", e.target.value)} placeholder="grant, church, search" />
      </Field>
    </Modal>
  );
}
