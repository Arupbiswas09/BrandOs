"use client";

import { useMemo, useState } from "react";
import type { Asset } from "@/db/schema";
import { hexA } from "@/lib/color";
import { ASSET_STATUS, ASSET_TYPES, CHANNELS, DELIVERY } from "@/lib/constants";
import { cloneAsset, saveAsset, toggleLink } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { Btn, CheckRow, Chip, Field, Mark, Pills, Select, Tick, cx } from "@/components/ui";
import { Footer, Modal } from "./frame";
import type { AssetDraft } from "./types";

type Step = 0 | 1 | 2 | 3;

export function AssetModal({ draft, step: initialStep = 0 }: { draft: AssetDraft; step?: Step }) {
  const { ws, close, openAsset } = useApp();
  const [run, pending] = useAction();
  const editing = !!draft.id;
  const [step, setStep] = useState<Step>(initialStep);
  const [d, setD] = useState({
    brandId: draft.brandId ?? null,
    type: draft.type ?? "",
    name: draft.name ?? "",
    short: draft.short ?? "",
    status: draft.status ?? "Draft",
    channel: draft.channel ?? "Owned",
    ctaId: draft.ctaId ?? "",
    delivery: draft.delivery ?? "None",
    gated: draft.gated ?? false,
    url: draft.url ?? "",
    notes: draft.notes ?? "",
    specs: draft.specs ?? "",
    audienceNotes: draft.audienceNotes ?? "",
    aiPrompt: draft.aiPrompt ?? "",
    tags: (draft.tags ?? []).join(", "),
    copy: draft.copy ?? { headline: "", body: "", cta: "" },
    promptFor: draft.promptFor ?? "",
    prompt: draft.prompt ?? "",
    checks: (draft.items ?? []).map((i) => i.text).join("\n"),
    offerIds: draft.offerIds ?? [],
  });
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  const known = !editing && !!d.brandId && d.offerIds.length > 0;
  const brand = ws.brand(d.brandId);

  const dupes = useMemo(() => {
    const words = d.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    if (!words.length) return [];
    return ws.d.assets.filter((a) => a.id !== draft.id && !a.archived && words.some((w) => a.name.toLowerCase().includes(w))).slice(0, 3);
  }, [d.name, ws, draft.id]);

  const save = async () => {
    const r = await run(saveAsset, {
      id: draft.id, brandId: d.brandId, name: d.name, type: d.type, channel: d.channel, status: d.status as Asset["status"],
      short: d.short, url: d.url, notes: d.notes, specs: d.specs, audienceNotes: d.audienceNotes, aiPrompt: d.aiPrompt,
      ctaId: d.ctaId || null, delivery: d.delivery, gated: d.gated,
      tags: d.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      copy: d.copy,
      ...(d.type === "Prompt" && { promptFor: d.promptFor, prompt: d.prompt }),
      ...(d.type === "Checklist" && !editing && { items: d.checks.split("\n").map((t) => t.trim()).filter(Boolean).map((text) => ({ text, done: false })) }),
      offerIds: d.brandId ? d.offerIds : [],
    });
    if (r.ok) { close(); if (!editing && r.id) openAsset(r.id); }
  };

  const valid = !!(d.name.trim() && d.type);
  const title = editing ? "Edit asset" : "What are you making?";
  const stepLabel = editing ? undefined : known ? "One step — the rest is already known" : `Step ${step + 1} of 4`;

  const footer = (
    <>
      {!editing && <Btn onClick={() => setStep((s) => Math.max(0, s - 1) as Step)} disabled={step === 0} className="px-[15px] py-2">Back</Btn>}
      <span className="flex-1" />
      <Btn variant="ghost" onClick={close}>Cancel</Btn>
      {step < 3 && <Btn onClick={() => setStep((s) => Math.min(3, s + 1) as Step)} disabled={step === 0 && !d.type} className="px-[15px] py-2">Next</Btn>}
      <Btn type="submit" variant="primary" disabled={!valid || pending} className="px-[17px] py-2">{pending ? "Saving…" : "Save asset"}</Btn>
    </>
  );

  return (
    <Modal title={title} eyebrow={stepLabel} width={640} onSubmit={() => valid && save()} footer={footer} bodyClass={step === 3 ? "gap-[15px]" : "px-6"}>
      {step === 0 && (
        <div>
          {known && (
            <div className="mb-3.5 rounded-[9px] bg-soft px-[13px] py-2.5 text-[12.5px] text-ink-2">
              Going into <span className="font-semibold">{brand?.name} · {ws.offer(d.offerIds[0])?.name}</span> — pick the kind and you are done.
            </div>
          )}
          {(["campaign", "master", "global"] as const).map((cat) => (
            <div key={cat} className="mb-3 last:mb-0">
              <div className="eyebrow mb-2 text-[9.5px]">{cat === "campaign" ? "Campaign work" : cat === "master" ? "Master files for the Brand Kit" : "Process — usually in the Global Library"}</div>
              <div className="grid grid-cols-2 gap-[9px] sm:grid-cols-3">
                {Object.entries(ASSET_TYPES).filter(([k, t]) => t.cat === cat && k !== "Newsletter ad").map(([k, t]) => (
                  <button key={k} type="button" aria-pressed={d.type === k}
                    onClick={() => { set("type", k); setStep(d.offerIds.length && d.brandId ? 3 : d.brandId === null && draft.brandId === null ? 3 : 1); }}
                    className={cx("rounded-[10px] border p-3 text-left transition hover:border-mute-2", d.type === k ? "border-accent bg-soft" : "border-line bg-white")}>
                    <span className="mb-1.5 block font-mono text-[9.5px] font-bold tracking-[0.06em] text-mute-4">{t.code}</span>
                    <span className="block text-[12.5px] font-semibold leading-[1.3]">{k}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="mb-3.5 text-[13px] text-mute-1">A {d.type || "new asset"}. Which building does it belong to?</div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {ws.d.brands.filter((b) => !b.archived).map((b) => (
              <button key={b.id} type="button" onClick={() => { setD((x) => ({ ...x, brandId: b.id, offerIds: x.brandId === b.id ? x.offerIds : [], ctaId: x.brandId === b.id ? x.ctaId : "" })); setStep(2); }}
                className="flex items-center gap-3 rounded-[11px] border bg-white p-3.5 text-left hover:border-mute-2" style={{ borderColor: d.brandId === b.id ? b.primary : "var(--bos-border)" }}>
                <Mark mark={b.mark} color={b.primary} size={32} radius={8} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">{b.name}</span>
                  <span className="mt-px block text-[12px] text-mute-2">{b.parentId ? `Sub-brand of ${ws.brand(b.parentId)?.name}` : ws.client(b.clientId)?.name}</span>
                </span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { setD((x) => ({ ...x, brandId: null, offerIds: [], ctaId: "" })); setStep(3); }} className="mt-2.5 w-full rounded-[11px] border border-dashed border-line-strong bg-white p-3.5 text-left hover:border-mute-2">
            <span className="block text-[13px] font-semibold">No brand — put it in the Global Library</span>
            <span className="mt-0.5 block text-[12px] text-mute-2">Checklists, prompts, templates, SOPs</span>
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="mb-1.5 text-[13px] text-mute-1">Which offers does it support?</div>
          <div className="mb-3.5 text-[12.5px] text-mute-3">Pick as many as apply. One asset, many rooms — nothing gets copied.</div>
          <div data-scroll className="flex max-h-[260px] flex-col gap-[7px] overflow-y-auto">
            {ws.offersOf(d.brandId ?? "").filter((o) => !o.archived).map((o) => (
              <CheckRow key={o.id} on={d.offerIds.includes(o.id)} sub={o.segment} onClick={() => set("offerIds", d.offerIds.includes(o.id) ? d.offerIds.filter((x) => x !== o.id) : [...d.offerIds, o.id])}>{o.name}</CheckRow>
            ))}
          </div>
          {!ws.offersOf(d.brandId ?? "").length && <div className="rounded-[10px] border border-dashed border-line-strong p-[26px] text-center text-[12.5px] text-mute-2">No offers in this brand yet. You can link it later.</div>}
          <div className="mt-3 text-[12px] text-mute-2">{d.offerIds.length ? `${d.offerIds.length} offer${d.offerIds.length > 1 ? "s" : ""} selected` : "No offers selected — it will sit in the library unlinked"}</div>
        </div>
      )}

      {step === 3 && (
        <>
          <div className="text-[12px] text-mute-2">{d.type || "Pick a type"} · {brand ? brand.name : "Global Library"}{d.brandId && ` · ${d.offerIds.length} offer${d.offerIds.length === 1 ? "" : "s"}`}</div>
          <Field label="Asset name"><input className="field text-[13.5px]" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Grant Landing Page — Free Audit" /></Field>
          {dupes.length > 0 && (
            <div className="rounded-[10px] border border-[rgba(201,154,46,.4)] bg-[rgba(201,154,46,.07)] px-[15px] py-[13px]">
              <div className="mb-2 text-[12.5px] font-semibold text-warn-ink">Similar assets already exist. Reuse before you rebuild.</div>
              <div className="flex flex-col gap-1">
                {dupes.map((a) => (
                  <button key={a.id} type="button" onClick={() => openAsset(a.id)} className="py-0.5 text-left text-[12.5px] text-warn-ink hover:underline">
                    {a.name} <span className="text-[#A08540]">· {ws.brand(a.brandId)?.name ?? "Global"} · {a.type}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Short description"><input className="field" value={d.short} onChange={(e) => set("short", e.target.value)} /></Field>
            <Field label="Status"><Select value={d.status} onChange={(v) => set("status", v as Asset["status"])} options={Object.keys(ASSET_STATUS).map((x) => ({ value: x, label: x }))} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type"><Select value={d.type} onChange={(v) => set("type", v)} options={[...(d.type ? [] : [{ value: "", label: "Pick one" }]), ...Object.keys(ASSET_TYPES).map((x) => ({ value: x, label: x }))]} /></Field>
            <Field label="Channel"><Select value={d.channel} onChange={(v) => set("channel", v)} options={CHANNELS.map((x) => ({ value: x, label: x }))} /></Field>
          </div>
          {d.brandId && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="CTA"><Select value={d.ctaId} onChange={(v) => set("ctaId", v)} options={[{ value: "", label: "None" }, ...ws.ctasOf(d.brandId).map((c) => ({ value: c.id, label: c.text }))]} /></Field>
              <Field label="Tags" hint={<span className="font-normal text-mute-4">comma separated</span>}><input className="field" value={d.tags} onChange={(e) => set("tags", e.target.value)} placeholder="landing, evergreen" /></Field>
            </div>
          )}
          <div className="grid items-end gap-3 sm:grid-cols-2">
            <Field label="Delivery"><Select value={d.delivery} onChange={(v) => set("delivery", v)} options={DELIVERY.map((x) => ({ value: x, label: x }))} /></Field>
            <button type="button" role="checkbox" aria-checked={d.gated} onClick={() => set("gated", !d.gated)} className="flex items-center gap-[9px] py-[9px] text-left text-[13px] text-ink-3">
              <Tick on={d.gated} />Gated — people request it
            </button>
          </div>
          <Field label="Live URL or doc link"><input className="field" value={d.url} onChange={(e) => set("url", e.target.value)} placeholder="quokkaforgood.org/grant-audit" /></Field>

          {d.type === "Prompt" && (
            <div className="border-t border-divider pt-1.5">
              <Field label="Use for" className="mt-2"><input className="field" value={d.promptFor} onChange={(e) => set("promptFor", e.target.value)} placeholder="Copy, Creative, Strategy…" /></Field>
              <Field label="The prompt" className="mt-3" hint={<span className="font-normal text-mute-4">[BRACKETS] for the bits people swap</span>}>
                <textarea rows={8} className="field font-mono text-[12px] leading-[1.65]" value={d.prompt} onChange={(e) => set("prompt", e.target.value)} />
              </Field>
            </div>
          )}
          {d.type === "Checklist" && !editing && (
            <Field label="Checks" hint={<span className="font-normal text-mute-4">one per line</span>}>
              <textarea rows={6} className="field leading-[1.55]" value={d.checks} onChange={(e) => set("checks", e.target.value)} placeholder={"Tracking fires on submit\nCTA matches the library entry"} />
            </Field>
          )}
          {ASSET_TYPES[d.type]?.cat !== "global" && (
            <div className="border-t border-divider pt-1.5">
              <div className="label mt-2">Copy</div>
              <input className="field mb-2" value={d.copy.headline} onChange={(e) => set("copy", { ...d.copy, headline: e.target.value })} placeholder="Headline" aria-label="Headline" />
              <textarea rows={3} className="field mb-2 leading-[1.55]" value={d.copy.body} onChange={(e) => set("copy", { ...d.copy, body: e.target.value })} placeholder="Body copy" aria-label="Body copy" />
              <input className="field" value={d.copy.cta} onChange={(e) => set("copy", { ...d.copy, cta: e.target.value })} placeholder="CTA text" aria-label="CTA text" />
            </div>
          )}
          <Field label="Notes"><textarea rows={2} className="field leading-[1.55]" value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Why this exists, and anything the next person needs to know." /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Creative specs"><input className="field" value={d.specs} onChange={(e) => set("specs", e.target.value)} placeholder="1080x1350, 4:5" /></Field>
            <Field label="Audience notes"><input className="field" value={d.audienceNotes} onChange={(e) => set("audienceNotes", e.target.value)} /></Field>
          </div>
          {editing && d.brandId && (
            <div>
              <div className="label">Linked offers</div>
              <div data-scroll className="flex max-h-[180px] flex-col gap-1.5 overflow-y-auto">
                {ws.offersOf(d.brandId).filter((o) => !o.archived || d.offerIds.includes(o.id)).map((o) => (
                  <CheckRow key={o.id} on={d.offerIds.includes(o.id)} sub={o.segment} onClick={() => set("offerIds", d.offerIds.includes(o.id) ? d.offerIds.filter((x) => x !== o.id) : [...d.offerIds, o.id])}>{o.name}</CheckRow>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------- clone */

export function CloneModal({ srcId, brandId, name, offerIds }: { srcId: string; brandId: string | null; name: string; offerIds: string[] }) {
  const { ws, close, openAsset, setNudge } = useApp();
  const [run, pending] = useAction();
  const src = ws.asset(srcId);
  const [d, setD] = useState({ name, brandId, offerIds, keepFiles: true, keepCopy: true });
  const save = async () => {
    const r = await run(cloneAsset, { srcId, ...d });
    if (r.ok) { close(); setNudge(null); if (r.id) openAsset(r.id); }
  };
  return (
    <Modal title="Clone and adapt" sub={`A real copy of ${src?.name}, with a reference back to the original.`} width={560} onSubmit={save} footer={<Footer saveLabel="Create clone" pending={pending} disabled={!d.name.trim()} />}>
      <Field label="New name"><input className="field text-[13.5px]" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
      <Field label="Target brand">
        <Select value={d.brandId ?? ""} onChange={(v) => setD({ ...d, brandId: v || null, offerIds: [] })}
          options={[{ value: "", label: "Global Library — no brand" }, ...ws.d.brands.filter((b) => !b.archived).map((b) => ({ value: b.id, label: b.name + (b.parentId ? ` (sub-brand of ${ws.brand(b.parentId)?.name})` : "") }))]} />
      </Field>
      {d.brandId && (
        <div>
          <div className="label">Link the clone to</div>
          <div data-scroll className="flex max-h-[180px] flex-col gap-1.5 overflow-y-auto">
            {ws.offersOf(d.brandId).filter((o) => !o.archived).map((o) => (
              <CheckRow key={o.id} on={d.offerIds.includes(o.id)} sub={o.segment} onClick={() => setD({ ...d, offerIds: d.offerIds.includes(o.id) ? d.offerIds.filter((x) => x !== o.id) : [...d.offerIds, o.id] })}>{o.name}</CheckRow>
            ))}
            {!ws.offersOf(d.brandId).length && <div className="text-[12.5px] text-mute-3">No offers in that brand yet.</div>}
          </div>
        </div>
      )}
      <div className="flex gap-[18px] pt-1.5">
        <button type="button" role="checkbox" aria-checked={d.keepFiles} onClick={() => setD({ ...d, keepFiles: !d.keepFiles })} className="flex items-center gap-2 text-[13px] text-ink-3"><Tick on={d.keepFiles} />Keep files</button>
        <button type="button" role="checkbox" aria-checked={d.keepCopy} onClick={() => setD({ ...d, keepCopy: !d.keepCopy })} className="flex items-center gap-2 text-[13px] text-ink-3"><Tick on={d.keepCopy} />Keep copy</button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- link assets into an offer */

export function LinkModal({ offerId }: { offerId: string }) {
  const { ws, close, setNudge } = useApp();
  const [run, pending] = useAction();
  const o = ws.offer(offerId);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"unlinked" | "linked" | "all">("unlinked");
  if (!o) return null;
  const linked = new Set(ws.linkedAssetIds(offerId));
  const pool = ws.d.assets.filter((a) => a.brandId === o.brandId && ws.catOf(a) !== "master" && !a.archived);
  const t = q.toLowerCase();
  const rows = pool.filter((a) => {
    if (scope === "unlinked" && linked.has(a.id)) return false;
    if (scope === "linked" && !linked.has(a.id)) return false;
    return !t || `${a.name} ${a.short} ${a.type} ${a.tags.join(" ")}`.toLowerCase().includes(t);
  });
  const color = ws.brand(o.brandId)?.primary ?? "#6C7B74";
  return (
    <Modal title={`Link an asset to ${o.name}`} sub="Linking does not copy anything. The asset stays where it is and gains one more room." width={600} footer={<Btn variant="primary" onClick={close}>Done</Btn>} bodyClass="gap-2.5 px-4 pt-4 sm:px-6">
      <input className="field text-[13px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the library" aria-label="Search the library" />
      <Pills tone="dark" value={scope} onChange={setScope} options={[{ value: "unlinked", label: "Not yet linked" }, { value: "linked", label: "Already linked" }, { value: "all", label: "Everything" }]} />
      <div data-scroll className="-mx-2 max-h-[340px] overflow-y-auto">
        {rows.slice(0, 60).map((a) => {
          const on = linked.has(a.id);
          const other = ws.linkedOfferIds(a.id).length;
          return (
            <div key={a.id} className="flex items-center gap-3 rounded-[9px] px-2 py-2.5">
              <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[7px] text-[8.5px] font-bold" style={{ background: hexA(color, 0.12), color }}>{ws.codeOf(a)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{a.name}</span>
                <span className="block text-[12px] text-mute-2">{a.type} · {other ? `already in ${other} offer${other > 1 ? "s" : ""}` : "not linked anywhere"}</span>
              </span>
              <Btn size="sm" disabled={pending} variant={on ? "secondary" : "primary"} className="px-[13px] font-semibold"
                onClick={async () => { const r = await run(toggleLink, a.id, offerId); if (r.ok && !on) { setNudge({ assetId: a.id, offerId }); close(); } }}>
                {on ? "Unlink" : "Link"}
              </Btn>
            </div>
          );
        })}
        {!rows.length && <div className="p-9 text-center text-[13px] text-mute-2">Nothing left to link here.</div>}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- link one asset to offers */

export function LinkAssetModal({ assetId }: { assetId: string }) {
  const { ws, close } = useApp();
  const [run, pending] = useAction();
  const a = ws.asset(assetId);
  if (!a) return null;
  const linked = new Set(ws.linkedOfferIds(assetId));
  const pool = ws.offersOf(a.brandId ?? "").filter((o) => !o.archived || linked.has(o.id));
  return (
    <Modal title="Which offers use this?" sub={`${a.name} stays a single asset. Linking just adds another room.`} footer={<Btn variant="primary" onClick={close}>Done</Btn>} bodyClass="max-h-[360px] gap-[7px] overflow-y-auto px-5 pt-3.5">
      {pool.map((o) => {
        const on = linked.has(o.id);
        return (
          <div key={o.id} className="flex items-center gap-[11px] rounded-[10px] border border-line px-[13px] py-[11px]">
            <span className="flex-1 text-[13px] font-medium">{o.name}</span>
            <Chip color={ws.segColor(o.segment, o.brandId)} size="xs">{o.segment}</Chip>
            <button type="button" disabled={pending} aria-pressed={on} onClick={() => run(toggleLink, assetId, o.id)}
              className={cx("flex-none rounded-[7px] border px-3 py-1 text-[11.5px] font-semibold", on ? "border-accent bg-soft text-accent" : "border-line bg-white text-mute-1 hover:border-mute-2")}>
              {on ? "Linked" : "Link"}
            </button>
          </div>
        );
      })}
      {!pool.length && <div className="p-8 text-center text-[13px] text-mute-2">This brand has no offers yet.</div>}
    </Modal>
  );
}
