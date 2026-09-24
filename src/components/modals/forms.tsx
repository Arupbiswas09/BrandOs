"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Brand, Client, Cta, Service } from "@/db/schema";
import { hexA, isHex, onColor } from "@/lib/color";
import { BRAND_PALETTES, OFFER_STATUS } from "@/lib/constants";
import { href } from "@/lib/routes";
import { deleteGoal, mergeGoal, saveBrand, saveClient, saveCta, saveGoal, saveService } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { Btn, Chip, Field, Mark, Select, cx } from "@/components/ui";
import { Footer, Modal } from "./frame";

/* ---------------------------------------------------------------- client */

export function ClientModal({ draft }: { draft?: Partial<Client> }) {
  const { close } = useApp();
  const router = useRouter();
  const [run, pending] = useAction();
  const [d, setD] = useState({ name: draft?.name ?? "", kind: draft?.kind ?? "", note: draft?.note ?? "" });
  const save = async () => {
    const r = await run(saveClient, { id: draft?.id, ...d });
    if (r.ok) { close(); if (!draft?.id && r.id) router.push(href.client(r.id)); }
  };
  return (
    <Modal title={draft?.id ? "Edit client" : "New client"} width={480} onSubmit={save} footer={<Footer saveLabel="Save client" pending={pending} disabled={!d.name.trim()} />}>
      <Field label="Client name" required><input required className="field text-[16px]" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Quokka For Good" /></Field>
      <Field label="Sector and location"><input className="field" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value })} placeholder="Wildlife conservation · Western Australia" /></Field>
      <Field label="What we do for them"><textarea rows={3} className="field leading-[1.55]" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></Field>
    </Modal>
  );
}

/* ---------------------------------------------------------------- brand */

export function ColourInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [text, setText] = useState(value);
  return (
    <span className="flex items-center gap-2 rounded-[9px] border border-line bg-white py-1 pl-1 pr-2">
      <input type="color" aria-label={label} value={isHex(value) && value.length === 7 ? value : "#2D4A5C"} onChange={(e) => { onChange(e.target.value.toUpperCase()); setText(e.target.value.toUpperCase()); }} className="h-7 w-8 cursor-pointer rounded-md border-0 bg-transparent p-0" />
      <input value={text} aria-label={`${label} hex`} onChange={(e) => { setText(e.target.value); if (isHex(e.target.value)) onChange(e.target.value.toUpperCase()); }} className="w-[76px] border-0 bg-transparent font-mono text-[14.5px] outline-none" />
    </span>
  );
}

export function BrandModal({ draft }: { draft: Partial<Brand> & { clientId: string } }) {
  const { ws, close } = useApp();
  const router = useRouter();
  const [run, pending] = useAction();
  const [d, setD] = useState({
    name: draft.name ?? "", tagline: draft.tagline ?? "", mark: draft.mark ?? "", clientId: draft.clientId,
    primary: draft.primary ?? "#2D4A5C", secondary: draft.secondary ?? "#7BA0A8",
    description: draft.description ?? "", voice: draft.voice ?? "",
  });
  const parent = ws.brand(draft.parentId);
  const mark = (d.mark || d.name.slice(0, 2) || "?").toUpperCase();
  const save = async () => {
    const r = await run(saveBrand, { id: draft.id, parentId: draft.parentId ?? null, ...d });
    if (r.ok) { close(); if (!draft.id && r.id) router.push(href.brand(r.id)); }
  };
  return (
    <Modal title={draft.id ? "Edit brand" : "New brand"} sub={parent ? `A wing of ${parent.name}` : undefined} width={540} onSubmit={save} footer={<Footer saveLabel="Save brand" pending={pending} disabled={!d.name.trim()} />}>
      <div className="flex items-center gap-3.5 rounded-xl p-[18px]" style={{ background: hexA(d.primary, 0.06) }}>
        <Mark mark={mark} color={d.primary} fg={onColor(d.primary)} size={44} radius={11} />
        <span className="flex-1">
          <span className="block text-[16px] font-semibold">{d.name || "New brand"}</span>
          <span className="mt-0.5 block text-[14px] text-mute-1">{draft.id ? d.tagline || "No tagline yet" : "Starts with five default goals you can edit or merge later"}</span>
        </span>
        <span className="h-6 w-6 rounded-md" style={{ background: d.secondary }} title="Secondary colour" />
      </div>
      <Field label="Brand name" required><input required className="field text-[16px]" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Acme SaaS" /></Field>
      <div className="grid grid-cols-[2fr_1fr] gap-3">
        <Field label="Tagline"><input className="field" value={d.tagline} onChange={(e) => setD({ ...d, tagline: e.target.value })} placeholder="Small animal. Big mandate." /></Field>
        <Field label="Monogram"><input className="field uppercase" maxLength={3} value={d.mark} onChange={(e) => setD({ ...d, mark: e.target.value })} placeholder={mark} /></Field>
      </div>
      {!draft.parentId && (
        <Field label="Client" required>
          <Select value={d.clientId} onChange={(v) => setD({ ...d, clientId: v })} options={ws.d.clients.filter((c) => !c.archived || c.id === d.clientId).map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
      )}
      <div>
        <div className="label">Colour pair</div>
        <div className="mb-2.5 flex flex-wrap gap-2">
          {BRAND_PALETTES.map(([a, b]) => (
            <button key={a} type="button" aria-label={`Use ${a} and ${b}`} onClick={() => setD({ ...d, primary: a, secondary: b })} className={cx("flex h-8 w-[52px] overflow-hidden rounded-lg border p-0", d.primary === a && d.secondary === b ? "border-ink ring-1 ring-ink" : "border-line")}>
              <span className="flex-[2]" style={{ background: a }} /><span className="flex-1" style={{ background: b }} />
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2.5">
          <ColourInput label="Primary colour" value={d.primary} onChange={(v) => setD((x) => ({ ...x, primary: v }))} />
          <ColourInput label="Secondary colour" value={d.secondary} onChange={(v) => setD((x) => ({ ...x, secondary: v }))} />
        </div>
      </div>
      <Field label="Description"><textarea rows={2} className="field leading-[1.55]" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
      <Field label="Voice and tone"><textarea rows={2} className="field leading-[1.55]" value={d.voice} onChange={(e) => setD({ ...d, voice: e.target.value })} placeholder="Warm and specific. Name the number." /></Field>
    </Modal>
  );
}

/* ---------------------------------------------------------------- service */

export function ServiceModal({ draft }: { draft: Partial<Service> & { brandId: string } }) {
  const { ws, close } = useApp();
  const router = useRouter();
  const [run, pending] = useAction();
  const [d, setD] = useState({ name: draft.name ?? "", short: draft.short ?? "", description: draft.description ?? "", brandId: draft.brandId });
  const save = async () => {
    const r = await run(saveService, { id: draft.id, ...d });
    if (r.ok) { close(); if (!draft.id && r.id) router.push(href.service(r.id)); }
  };
  return (
    <Modal title={draft.id ? "Edit service" : "New service"} sub={`In ${ws.brand(d.brandId)?.name}. A capability you sell — offers hang off it, one per segment.`} onSubmit={save} footer={<Footer saveLabel="Save service" pending={pending} disabled={!d.name.trim()} />}>
      {!draft.id && (
        <Field label="Brand" required><Select value={d.brandId} onChange={(v) => setD({ ...d, brandId: v })} options={ws.d.brands.filter((b) => !b.archived).map((b) => ({ value: b.id, label: b.name }))} /></Field>
      )}
      <Field label="Service name" required><input required className="field text-[16px]" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Google Ad Grant" /></Field>
      <Field label="One line"><input className="field" value={d.short} onChange={(e) => setD({ ...d, short: e.target.value })} placeholder="Ten thousand a month, actually spent" /></Field>
      <Field label="What it is"><textarea rows={3} className="field leading-[1.55]" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="The capability itself, before it is aimed at anyone." /></Field>
    </Modal>
  );
}

/* ---------------------------------------------------------------- CTA */

export function CtaModal({ draft }: { draft: Partial<Cta> & { brandId: string } }) {
  const { ws, close } = useApp();
  const [run, pending] = useAction();
  const b = ws.brand(draft.brandId);
  const [d, setD] = useState({
    text: draft.text ?? "", url: draft.url ?? "", style: (draft.style as "solid" | "outline" | "ghost") ?? "solid",
    bg: draft.bg && draft.bg !== "transparent" ? draft.bg : b?.primary ?? "#2D4A5C",
    fg: draft.fg ?? onColor(b?.primary ?? "#2D4A5C"),
  });
  const outline = d.style !== "solid";
  const preview = { background: outline ? "transparent" : d.bg, color: outline ? d.bg : d.fg, border: `1.5px solid ${d.style === "outline" ? d.bg : "transparent"}`, textDecoration: d.style === "ghost" ? "underline" : undefined };
  const save = async () => {
    const r = await run(saveCta, { id: draft.id, brandId: draft.brandId, text: d.text, url: d.url, style: d.style, bg: outline ? "transparent" : d.bg, fg: outline ? d.bg : d.fg });
    if (r.ok) close();
  };
  const swatches = [b?.primary, b?.secondary, ...(b?.colours.map((c) => c.hex) ?? []), "#0F172A", "#FFFFFF"].filter((x, i, a): x is string => !!x && a.indexOf(x) === i).slice(0, 8);
  return (
    <Modal title={draft.id ? "Edit CTA" : "New CTA"} width={480} onSubmit={save} footer={<Footer saveLabel="Save CTA" pending={pending} disabled={!d.text.trim()} />}>
      <div className="flex items-center justify-center rounded-[11px] bg-wash-2 p-6">
        <span className="inline-block rounded-[7px] px-[18px] py-[9px] text-[16px] font-semibold" style={preview}>{d.text || "Button text"}</span>
      </div>
      <Field label="Button text" required><input required className="field text-[16px]" value={d.text} onChange={(e) => setD({ ...d, text: e.target.value })} placeholder="Book a Grant Audit" maxLength={80} /></Field>
      <Field label="Destination"><input className="field" value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} placeholder="quokkaforgood.org/grant-audit" /></Field>
      <div>
        <div className="label">{outline ? "Colour" : "Button colour"}</div>
        <div className="flex flex-wrap gap-2">
          {swatches.map((hx) => (
            <button key={hx} type="button" aria-label={`Use ${hx}`} onClick={() => setD({ ...d, bg: hx, fg: onColor(hx) })} className={cx("h-[34px] w-[34px] rounded-lg border", d.bg === hx ? "border-ink ring-1 ring-ink" : "border-line")} style={{ background: hx }} />
          ))}
        </div>
      </div>
      <Field label="Style"><Select value={d.style} onChange={(v) => setD({ ...d, style: v as typeof d.style })} options={["solid", "outline", "ghost"].map((x) => ({ value: x, label: x[0].toUpperCase() + x.slice(1) }))} /></Field>
    </Modal>
  );
}

/* ---------------------------------------------------------------- goals */

export function GoalModal({ brandId, name, description, original }: { brandId: string; name?: string; description?: string; original?: string }) {
  const { ws, close } = useApp();
  const [run, pending] = useAction();
  const [d, setD] = useState({ name: name ?? "", description: description ?? "" });
  const save = async () => { const r = await run(saveGoal, { brandId, original, ...d }); if (r.ok) close(); };
  const remove = async () => { const r = await run(deleteGoal, brandId, original!); if (r.ok) close(); };
  return (
    <Modal title={original ? "Edit goal" : "New goal"} sub={`In ${ws.brand(brandId)?.name}. Keep it broad enough that a tactic never fits it exactly.`} width={480} onSubmit={save}
      footer={<Footer saveLabel="Save goal" pending={pending} disabled={!d.name.trim()} left={original ? <button type="button" onClick={remove} className="px-0.5 py-1.5 text-[14.5px] text-danger hover:underline">Remove from every offer</button> : undefined} />}>
      <Field label="Goal" required><input required className="field text-[16px]" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Audience growth" /></Field>
      <Field label="What it means here"><textarea rows={3} className="field leading-[1.55]" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="Grow the audience we own — list, followers, members." /></Field>
    </Modal>
  );
}

export function MergeGoalModal({ brandId, from }: { brandId: string; from: string }) {
  const { ws, close } = useApp();
  const [run, pending] = useAction();
  const [into, setInto] = useState("");
  const n = ws.offersOf(brandId).filter((o) => o.goals.includes(from)).length;
  const save = async () => { const r = await run(mergeGoal, brandId, from, into); if (r.ok) close(); };
  return (
    <Modal title={`Merge ${from} into…`} sub={`${n} ${n === 1 ? "offer moves" : "offers move"} across. ${from} then disappears.`} width={460} onSubmit={save} footer={<Footer saveLabel="Merge" pending={pending} disabled={!into} />} bodyClass="gap-[7px]">
      {(ws.brand(brandId)?.goals ?? []).filter((g) => g.name !== from).map((g) => (
        <button key={g.name} type="button" aria-pressed={into === g.name} onClick={() => setInto(g.name)} className={cx("w-full rounded-[10px] border px-3.5 py-[11px] text-left text-[16px] font-medium transition", into === g.name ? "border-accent bg-soft" : "border-line bg-white")}>{g.name}</button>
      ))}
    </Modal>
  );
}

export function GoalOffersModal({ brandId, name }: { brandId: string; name: string }) {
  const { ws, close } = useApp();
  const router = useRouter();
  const list = ws.offersOf(brandId).filter((o) => o.goals.includes(name));
  return (
    <Modal title={name} sub={`${list.length} ${list.length === 1 ? "offer chases this" : "offers chase this"}.`} footer={<Btn variant="primary" onClick={close}>Done</Btn>} bodyClass="max-h-[340px] gap-[7px] overflow-y-auto">
      {list.map((o) => (
        <button key={o.id} type="button" onClick={() => { close(); router.push(href.offer(o.id)); }} className="flex w-full items-center gap-[11px] rounded-[10px] border border-line bg-white px-[13px] py-[11px] text-left hover:border-mute-2">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{o.name}</span>
            <span className="mt-0.5 block text-[14.5px] text-mute-2">{o.serviceId ? ws.service(o.serviceId)?.name ?? "Standalone" : "Standalone"} · {o.segment}</span>
          </span>
          <Chip color={OFFER_STATUS[o.status]} size="xs">{o.status}</Chip>
        </button>
      ))}
      {!list.length && <div className="p-7 text-center text-[15px] text-mute-2">No offer chases this goal yet.</div>}
    </Modal>
  );
}
