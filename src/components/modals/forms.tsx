"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { Brand, Client, Cta, Service } from "@/db/schema";
import { isHex, onColor } from "@/lib/color";
import { BRAND_PALETTES, OFFER_STATUS, freshBrandPair } from "@/lib/constants";
import { href } from "@/lib/routes";
import { deleteGoal, mergeGoal, saveBrand, saveClient, saveCta, saveGoal, saveService } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { Btn, Chip, Field, Mark, Select, cx } from "@/components/ui";
import { Footer, Modal, MoreDetail } from "./frame";

/* ---------------------------------------------------------------- client */

export function ClientModal({ draft }: { draft?: Partial<Client> }) {
  const { ws, close } = useApp();
  const router = useRouter();
  const [run, pending] = useAction();
  const [d, setD] = useState({ name: draft?.name ?? "", kind: draft?.kind ?? "", note: draft?.note ?? "", contactId: draft?.contactId ?? (draft?.id ? "" : ws.me.id) });
  const team = ws.d.users.filter((u) => u.access !== "Client");
  const save = async () => {
    const r = await run(saveClient, { id: draft?.id, ...d, contactId: d.contactId || null });
    if (r.ok) { close(); if (!draft?.id && r.id) router.push(href.client(r.id)); }
  };
  return (
    <Modal title={draft?.id ? "Edit client" : "New client"} width={480} onSubmit={save} footer={<Footer saveLabel="Save client" pending={pending} disabled={!d.name.trim()} />}>
      <Field label="Client name" required><input required className="field text-lead" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Quokka For Good" /></Field>
      <Field label="Sector and location"><input className="field" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value })} placeholder="Wildlife conservation · Western Australia" /></Field>
      <Field label="What we do for them"><textarea rows={3} className="field leading-[1.55]" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></Field>
      <Field label="Primary contact" hint={<span className="font-normal text-mute-4">who on the team looks after them</span>}>
        <Select value={d.contactId} onChange={(v) => setD({ ...d, contactId: v })} options={[{ value: "", label: "No one yet" }, ...team.map((u) => ({ value: u.id, label: u.name }))]} />
      </Field>
    </Modal>
  );
}

/* ---------------------------------------------------------------- brand */

export function ColourInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [text, setText] = useState(value);
  return (
    <span className="flex items-center gap-2 rounded-lg border border-line bg-surface py-1 pl-1 pr-2">
      <input type="color" aria-label={label} value={isHex(value) && value.length === 7 ? value : "#2D4A5C"} onChange={(e) => { onChange(e.target.value.toUpperCase()); setText(e.target.value.toUpperCase()); }} className="h-7 w-8 cursor-pointer rounded-md border-0 bg-transparent p-0" />
      <input value={text} aria-label={`${label} hex`} onChange={(e) => { setText(e.target.value); if (isHex(e.target.value)) onChange(e.target.value.toUpperCase()); }} className="w-[76px] border-0 bg-transparent font-mono text-body outline-none" />
    </span>
  );
}

export function BrandModal({ draft }: { draft: Partial<Brand> & { clientId: string } }) {
  const { ws, close } = useApp();
  const router = useRouter();
  const [run, pending] = useAction();
  const [d, setD] = useState(() => {
    // A new brand (sub-brands too) starts on a pair no other brand wears yet, never a shared default.
    const [primary, secondary] = draft.primary ? [draft.primary, draft.secondary ?? draft.primary] : freshBrandPair(ws.d.brands);
    return {
      name: draft.name ?? "", tagline: draft.tagline ?? "", mark: draft.mark ?? "", clientId: draft.clientId,
      primary, secondary, description: draft.description ?? "", voice: draft.voice ?? "",
    };
  });
  const coloursId = useId();
  const parent = ws.brand(draft.parentId);
  const mark = (d.mark || d.name.slice(0, 2) || "?").toUpperCase();
  const filled = [d.tagline, d.mark, d.description, d.voice].filter((x) => x.trim()).length;
  const [more, setMore] = useState(() => filled > 0);
  const save = async () => {
    const r = await run(saveBrand, { id: draft.id, parentId: draft.parentId ?? null, ...d });
    if (r.ok) { close(); if (!draft.id && r.id) router.push(href.brand(r.id)); }
  };
  const sub = [parent ? `A wing of ${parent.name}.` : "", draft.id ? "" : "Starts with five default goals you can edit or merge later."].filter(Boolean).join(" ");
  return (
    <Modal title={draft.id ? "Edit brand" : "New brand"} sub={sub || undefined} width={540} onSubmit={save} footer={<Footer saveLabel="Save brand" pending={pending} disabled={!d.name.trim()} />}>
      {/* The monogram beside the name shows the brand as it will look, colours included. */}
      <div className="flex items-end gap-3">
        <Mark mark={mark} color={d.primary} fg={onColor(d.primary)} size={44} radius={11} className="mb-px flex-none" />
        <Field label="Brand name" required className="min-w-0 flex-1"><input required className="field text-lead" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Acme SaaS" /></Field>
      </div>
      {!draft.parentId && (
        <Field label="Client" required>
          <Select value={d.clientId} onChange={(v) => setD({ ...d, clientId: v })} options={ws.d.clients.filter((c) => !c.archived || c.id === d.clientId).map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
      )}
      <div role="group" aria-labelledby={coloursId}>
        <div id={coloursId} className="label">Colour pair</div>
        <div className="mb-2.5 flex flex-wrap gap-2">
          {BRAND_PALETTES.map(([a, b]) => (
            <button key={a} type="button" aria-label={`Use ${a} and ${b}`} aria-pressed={d.primary === a && d.secondary === b} onClick={() => setD({ ...d, primary: a, secondary: b })} className={cx("flex h-8 w-[52px] overflow-hidden rounded-lg border p-0", d.primary === a && d.secondary === b ? "border-ink ring-1 ring-ink" : "border-line")}>
              <span className="flex-[2]" style={{ background: a }} /><span className="flex-1" style={{ background: b }} />
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2.5">
          <ColourInput label="Primary colour" value={d.primary} onChange={(v) => setD((x) => ({ ...x, primary: v }))} />
          <ColourInput label="Secondary colour" value={d.secondary} onChange={(v) => setD((x) => ({ ...x, secondary: v }))} />
        </div>
      </div>
      <MoreDetail open={more} onToggle={() => setMore((m) => !m)} filled={filled} hint="tagline, monogram, description, voice">
        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <Field label="Tagline"><input className="field" value={d.tagline} onChange={(e) => setD({ ...d, tagline: e.target.value })} placeholder="Small animal. Big mandate." /></Field>
          <Field label="Monogram"><input className="field uppercase" maxLength={3} value={d.mark} onChange={(e) => setD({ ...d, mark: e.target.value })} placeholder={mark} /></Field>
        </div>
        <Field label="Description"><textarea rows={2} className="field leading-[1.55]" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
        <Field label="Voice and tone"><textarea rows={2} className="field leading-[1.55]" value={d.voice} onChange={(e) => setD({ ...d, voice: e.target.value })} placeholder="Warm and specific. Name the number." /></Field>
      </MoreDetail>
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
    <Modal title={draft.id ? "Edit service" : "New service"} sub={`In ${ws.brand(d.brandId)?.name}. A capability you sell. Offers hang off it, one per segment.`} onSubmit={save} footer={<Footer saveLabel="Save service" pending={pending} disabled={!d.name.trim()} />}>
      <Field label="Service name" required><input required className="field text-lead" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Google Ad Grant" /></Field>
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
  // The CTA as saved now, for who made it: contributors change only their own, and older CTAs have no owner.
  const saved = draft.id ? ws.cta(draft.id) : null;
  const locked = !!draft.id && !ws.canChange(saved);
  const maker = saved?.ownerId ? ws.user(saved.ownerId) : null;
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
  const swatches = [b?.primary, b?.secondary, ...(b?.colours.map((c) => c.hex) ?? []), "#101614", "#FFFFFF"].filter((x, i, a): x is string => !!x && a.indexOf(x) === i).slice(0, 8);
  return (
    <Modal title={draft.id ? "Edit CTA" : "New CTA"} width={480} onSubmit={save}
      footer={<Footer saveLabel="Save CTA" pending={pending} disabled={locked || !d.text.trim()}
        left={maker && <span className="min-w-0 truncate text-meta text-mute-3">Made by {maker.name}</span>} />}>
      {locked && (
        <p className="m-0 text-meta text-mute-2">
          {ws.can("edit") ? `You can change only the CTAs you made. Ask ${maker ? `${ws.first(maker.id)} or an editor` : "an editor"} to change this one.` : "Your role cannot change CTAs."}
        </p>
      )}
      <div className="flex items-center justify-center rounded-xl bg-wash-2 p-6">
        <span className="inline-block rounded-lg px-4 py-2 text-lead font-semibold" style={preview}>{d.text || "Button text"}</span>
      </div>
      <Field label="Button text" required><input required className="field text-lead" value={d.text} onChange={(e) => setD({ ...d, text: e.target.value })} placeholder="Book a Grant Audit" maxLength={80} /></Field>
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
  // Removing a goal takes it off every offer and cannot be undone, so it asks first.
  const [removing, setRemoving] = useState(false);
  const save = async () => { const r = await run(saveGoal, { brandId, original, ...d }); if (r.ok) close(); };
  const remove = async () => { const r = await run(deleteGoal, brandId, original!); if (r.ok) close(); };
  if (removing && original) {
    const n = ws.offersOf(brandId).filter((o) => o.goals.includes(original)).length;
    // Keyed, so each view mounts fresh and focus lands inside it (here on the question, back on the form after Cancel).
    return (
      <Modal key="remove" title={`Remove ${original}?`} width={440} onSubmit={remove}
        footer={<Footer saveLabel="Remove goal" pending={pending} saveVariant="danger-solid" onCancel={() => setRemoving(false)} />}>
        <div data-autofocus tabIndex={-1} className="text-body leading-[1.6] text-mute-1 outline-none text-pretty">
          {n ? `It comes off the ${n === 1 ? "offer that chases" : `${n} offers that chase`} it, and this cannot be undone.` : "No offer chases it yet. This cannot be undone."}
        </div>
        {n > 0 && ws.brand(brandId)!.goals.length > 1 && <div className="text-meta text-mute-3">To keep those offers tagged, merge it into another goal instead.</div>}
      </Modal>
    );
  }
  return (
    <Modal key="edit" title={original ? "Edit goal" : "New goal"} sub={`In ${ws.brand(brandId)?.name}. Keep it broad enough that a tactic never fits it exactly.`} width={480} onSubmit={save}
      footer={<Footer saveLabel="Save goal" pending={pending} disabled={!d.name.trim()} left={original ? <Btn variant="danger" onClick={() => setRemoving(true)}>Remove goal</Btn> : undefined} />}>
      <Field label="Goal" required><input required className="field text-lead" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Audience growth" /></Field>
      <Field label="What it means here"><textarea rows={3} className="field leading-[1.55]" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="Grow the audience we own: list, followers, members." /></Field>
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
    <Modal title={`Merge ${from} into…`} sub={`${n} ${n === 1 ? "offer moves" : "offers move"} across. ${from} then disappears.`} width={460} onSubmit={save} footer={<Footer saveLabel="Merge" pending={pending} disabled={!into} />} bodyClass="gap-2">
      {(ws.brand(brandId)?.goals ?? []).filter((g) => g.name !== from).map((g) => (
        <button key={g.name} type="button" aria-pressed={into === g.name} onClick={() => setInto(g.name)} className={cx("w-full rounded-xl border px-3.5 py-3 text-left text-lead font-medium transition", into === g.name ? "border-accent bg-soft" : "border-line bg-surface")}>{g.name}</button>
      ))}
    </Modal>
  );
}

export function GoalOffersModal({ brandId, name }: { brandId: string; name: string }) {
  const { ws, close } = useApp();
  const router = useRouter();
  const list = ws.offersOf(brandId).filter((o) => o.goals.includes(name));
  return (
    <Modal title={name} sub={`${list.length} ${list.length === 1 ? "offer chases this" : "offers chase this"}.`} footer={<Btn variant="primary" onClick={close}>Done</Btn>} bodyClass="max-h-[340px] gap-2 overflow-y-auto">
      {list.map((o) => (
        <button key={o.id} type="button" onClick={() => { close(); router.push(href.offer(o.id)); }} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 py-3 text-left hover:border-mute-2">
          <span className="min-w-0 flex-1">
            <span className="block text-body font-semibold">{o.name}</span>
            <span className="mt-0.5 block text-body text-mute-2">{o.serviceId ? ws.service(o.serviceId)?.name ?? "Standalone" : "Standalone"} · {o.segment}</span>
          </span>
          <Chip color={OFFER_STATUS[o.status]} size="xs">{o.status}</Chip>
        </button>
      ))}
      {!list.length && <div className="p-7 text-center text-body text-mute-2">No offer chases this goal yet.</div>}
    </Modal>
  );
}
