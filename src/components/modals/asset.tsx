"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, Paperclip, X } from "lucide-react";
import type { Asset } from "@/db/schema";
import { hexA, readable } from "@/lib/color";
import { ASSET_STATUS, ASSET_TYPES, CHANNELS, DELIVERY, roleOf, type AssetCategory } from "@/lib/constants";
import { addTags, tagPool } from "@/lib/tags";
import { cloneAsset, saveAsset, toggleLink } from "@/app/actions";
import { checkBatch, sizeLabel } from "@/lib/upload-policy";
import { useAction, useApp } from "@/components/app/provider";
import { TagInput } from "@/components/tag-input";
import { Btn, CheckRow, Chip, Field, Mark, Pills, Select, Tick, cx } from "@/components/ui";
import { Footer, Modal, MoreDetail } from "./frame";
import type { AssetDraft } from "./types";

type Step = 0 | 1 | 2 | 3;

const plural2 = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** A name hint that fits the kind of thing being made. */
function namePlaceholder(type: string): string {
  const hints: Record<string, string> = {
    "Landing page": "Free audit landing page", "Lead magnet": "Grant readiness checklist", "Thank you page": "Audit booked: thank you page",
    "Meta ad": "Meta ad: grant intent, static 4:5", "Google ad": "Search ad: free audit", "LinkedIn post": "LinkedIn carousel: grant myths",
    "Social post": "Instagram post: volunteer story", Email: "Audit invitation email", "Email sequence": "Audit nurture sequence",
    Automation: "Audit request nurture flow", "Case study": "Case study: St Aidan", "Drive link": "Grant application source files",
    "Ad creative": "Before and after carousel, 1:1", Checklist: "Landing page launch checklist", Prompt: "Ad headline variations",
    Template: "Campaign landing page template", SOP: "New client onboarding", Logo: "Primary logo, full colour",
  };
  return hints[type] ?? (type ? `Name of the ${type.toLowerCase()}` : "What is it called?");
}

const plural = (n: number) => `${n} file${n === 1 ? "" : "s"}`;

/** The type step's groups: what the work is, and where it will live. */
const GROUPS: { cat: AssetCategory; what: string; where?: string }[] = [
  { cat: "campaign", what: "Campaign work" },
  { cat: "master", what: "Master files", where: "Brand Kit" },
  { cat: "global", what: "Process", where: "Global Library" },
];

export function AssetModal({ draft, step: initialStep = 0 }: { draft: AssetDraft; step?: Step }) {
  const { ws, close, openAsset, toast } = useApp();
  const [run, pending] = useAction();
  const router = useRouter();
  // Files picked here wait until the asset is saved (a new one has no id to upload to yet), then go up in one batch.
  const [queued, setQueued] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const canUpload = ws.can("upload");
  const limits = ws.d.uploads.mine;
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
    tags: draft.tags ?? [],
    copy: draft.copy ?? { headline: "", body: "", cta: "" },
    promptFor: draft.promptFor ?? "",
    prompt: draft.prompt ?? "",
    checks: (draft.items ?? []).map((i) => i.text).join("\n"),
    offerIds: draft.offerIds ?? [],
  });
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  // A Drive link is delivered as a link, so it starts as one.
  const setType = (type: string) => setD((x) => ({ ...x, type, delivery: type === "Drive link" && x.delivery === "None" ? "Doc link" : x.delivery }));
  const drive = d.type === "Drive link";
  // A tag half typed in the box; saving adds it too.
  const [tagText, setTagText] = useState("");
  const tagsInUse = useMemo(() => tagPool(ws.d.assets), [ws.d.assets]);
  const uid = useId();
  // Which fields this kind of asset uses, so the form only asks what matters for it.
  const role = roleOf(d.type);
  const urlFirst = role === "entry" || role === "after";
  const withCopy = role === "traffic" || role === "entry" || role === "after" || d.type === "Ad creative";
  const withDelivery = d.type === "Lead magnet" || d.type === "Document";
  const withSpecs = role === "traffic" || d.type === "Ad creative";
  const filled = [d.short, d.ctaId, d.tags.length ? "t" : "", d.copy.headline || d.copy.body || d.copy.cta, d.notes, d.specs, d.audienceNotes, !urlFirst && !drive ? d.url : "", d.gated ? "g" : ""].filter(Boolean).length;
  const moreHint = withCopy ? "copy, channel, CTA, tags, notes" : "channel, tags, notes";
  // Editing something that already has those details: open straight away so nothing is hidden.
  const [more, setMore] = useState(() => editing && filled > 0);
  const known = !editing && !!d.brandId && d.offerIds.length > 0;
  const brand = ws.brand(d.brandId);

  const dupes = useMemo(() => {
    const words = d.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    if (!words.length) return [];
    return ws.d.assets.filter((a) => a.id !== draft.id && !a.archived && words.some((w) => a.name.toLowerCase().includes(w))).slice(0, 3);
  }, [d.name, ws, draft.id]);

  /** Adds files to the queue, same name replacing same name, if the whole batch still fits the upload limits. */
  const addFiles = (list: FileList | File[] | null) => {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    const names = new Set(picked.map((f) => f.name));
    const next = [...queued.filter((f) => !names.has(f.name)), ...picked];
    const problem = checkBatch(next.map((f) => ({ name: f.name, size: f.size })), limits);
    if (problem) { toast(problem, "error"); return; }
    setQueued(next);
  };

  /** Runs after the modal has closed, so progress and problems are toasts. */
  const uploadQueued = async (id: string, list: File[]) => {
    toast(`Uploading ${plural(list.length)}…`, "info");
    try {
      const fd = new FormData();
      list.forEach((f) => fd.append("file", f));
      const res = await fetch(`/api/assets/${id}/files`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) toast(`The asset is saved, but its files did not upload. ${body.error ?? "Try again from the asset."}`, "error");
      else toast(`${plural(list.length)} added`);
    } catch {
      toast("The asset is saved, but its files did not upload. Check your connection and try again from the asset.", "error");
    } finally {
      router.refresh();
    }
  };

  const save = async () => {
    const files = canUpload ? queued : [];
    if (files.length) {
      const problem = checkBatch(files.map((f) => ({ name: f.name, size: f.size })), limits);
      if (problem) { toast(problem, "error"); return; }
    }
    const r = await run(saveAsset, {
      id: draft.id, brandId: d.brandId, name: d.name, type: d.type, channel: d.channel, status: d.status as Asset["status"],
      short: d.short, url: d.url, notes: d.notes, specs: d.specs, audienceNotes: d.audienceNotes, aiPrompt: d.aiPrompt,
      ctaId: d.ctaId || null, delivery: d.delivery, gated: d.gated,
      tags: addTags(d.tags, tagText, tagsInUse),
      copy: d.copy,
      ...(d.type === "Prompt" && { promptFor: d.promptFor, prompt: d.prompt }),
      ...(d.type === "Checklist" && !editing && { items: d.checks.split("\n").map((t) => t.trim()).filter(Boolean).map((text) => ({ text, done: false })) }),
      offerIds: d.brandId ? d.offerIds : [],
    });
    if (!r.ok) return;
    const id = r.id ?? draft.id;
    close();
    if (!editing && id) openAsset(id);
    if (files.length && id) void uploadQueued(id, files);
  };

  const valid = !!(d.name.trim() && d.type && (!drive || d.url.trim()));
  const title = editing ? "Edit asset" : step === 3 && d.type ? `New ${d.type.toLowerCase()}` : "What are you making?";
  const stepLabel = editing || step === 3 ? undefined : known ? "One step: the rest is already known" : `Step ${step + 1} of 4`;

  // On the type step, picking a type is the way forward, so there is no Next or Save to press.
  const footer = (
    <>
      {!editing && <Btn onClick={() => setStep((s) => Math.max(0, s - 1) as Step)} disabled={step === 0} className="px-4 py-2">Back</Btn>}
      <span className="flex-1" />
      <Btn variant="ghost" onClick={close}>Cancel</Btn>
      {step > 0 && step < 3 && <Btn onClick={() => setStep((s) => Math.min(3, s + 1) as Step)} className="px-4 py-2">Next</Btn>}
      {step > 0 && <Btn type="submit" variant="primary" disabled={!valid || pending} className="px-4 py-2">{pending ? "Saving…" : "Save asset"}</Btn>}
    </>
  );

  return (
    <Modal title={title} eyebrow={stepLabel} width={640} onSubmit={() => valid && save()} footer={footer} bodyClass={step === 3 ? "gap-4" : "px-6"}>
      {step === 0 && (
        <div>
          {known && (
            <div className="mb-3.5 rounded-lg bg-soft px-3 py-2.5 text-body text-ink-2">
              Going into <span className="font-semibold">{brand?.name} · {ws.offer(d.offerIds[0])?.name}</span>: pick the kind and you are done.
            </div>
          )}
          {GROUPS.map(({ cat, what, where }) => (
            <div key={cat} role="group" aria-labelledby={`${uid}-${cat}`} className="mb-3 last:mb-0">
              <div id={`${uid}-${cat}`} className="eyebrow mb-2 text-micro">
                {what}
                {where && <><span aria-hidden> → </span><span className="sr-only">, kept in the </span>{where}</>}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(ASSET_TYPES).filter(([k, t]) => t.cat === cat && k !== "Newsletter ad").map(([k, t]) => (
                  <button key={k} type="button" aria-pressed={d.type === k}
                    onClick={() => { setType(k); setStep(d.offerIds.length && d.brandId ? 3 : d.brandId === null && draft.brandId === null ? 3 : 1); }}
                    className={cx("rounded-xl border p-3 text-left transition hover:border-mute-2", d.type === k ? "border-accent bg-soft" : "border-line bg-surface")}>
                    <span className="mb-1.5 block font-mono text-micro font-bold tracking-[0.06em] text-mute-4">{t.code}</span>
                    <span className="block text-body font-semibold leading-[1.3]">{k}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="mb-3.5 text-body text-mute-1">A {d.type || "new asset"}. Which brand does it belong to?</div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {ws.d.brands.filter((b) => !b.archived).map((b) => (
              <button key={b.id} type="button" onClick={() => { setD((x) => ({ ...x, brandId: b.id, offerIds: x.brandId === b.id ? x.offerIds : [], ctaId: x.brandId === b.id ? x.ctaId : "" })); setStep(2); }}
                className="flex items-center gap-3 rounded-xl border bg-surface p-3.5 text-left hover:border-mute-2" style={{ borderColor: d.brandId === b.id ? b.primary : "var(--bos-border)" }}>
                <Mark mark={b.mark} color={b.primary} size={32} radius={8} />
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold">{b.name}</span>
                  <span className="mt-px block text-body text-mute-2">{b.parentId ? `Sub-brand of ${ws.brand(b.parentId)?.name}` : ws.client(b.clientId)?.name}</span>
                </span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { setD((x) => ({ ...x, brandId: null, offerIds: [], ctaId: "" })); setStep(3); }} className="mt-2.5 w-full rounded-xl border border-dashed border-line-strong bg-surface p-3.5 text-left hover:border-mute-2">
            <span className="block text-body font-semibold">No brand: put it in the Global Library</span>
            <span className="mt-0.5 block text-body text-mute-2">Checklists, prompts, templates, SOPs, ad creatives</span>
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="mb-1.5 text-body text-mute-1">Which offers does it support?</div>
          <div className="mb-3.5 text-body text-mute-3">Pick as many as apply. One asset, many rooms: nothing gets copied.</div>
          <div data-scroll className="flex max-h-[260px] flex-col gap-2 overflow-y-auto">
            {ws.offersOf(d.brandId ?? "").filter((o) => !o.archived).map((o) => (
              <CheckRow key={o.id} on={d.offerIds.includes(o.id)} sub={o.segment} onClick={() => set("offerIds", d.offerIds.includes(o.id) ? d.offerIds.filter((x) => x !== o.id) : [...d.offerIds, o.id])}>{o.name}</CheckRow>
            ))}
          </div>
          {!ws.offersOf(d.brandId ?? "").length && <div className="rounded-xl border border-dashed border-line-strong p-6 text-center text-body text-mute-2">No offers in this brand yet. You can link it later.</div>}
          <div className="mt-3 text-body text-mute-2">{d.offerIds.length ? `${d.offerIds.length} offer${d.offerIds.length > 1 ? "s" : ""} selected` : "No offers selected: it will sit in the library unlinked"}</div>
        </div>
      )}

      {step === 3 && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2 text-meta text-mute-2">
            <span>{brand ? brand.name : "Global Library"}{d.brandId && ` · ${plural2(d.offerIds.length, "offer")}`}{!editing && ` · starts as ${d.status}`}</span>
            {!editing && <button type="button" onClick={() => setStep(0)} className="font-medium text-accent hover:underline">Change type</button>}
          </div>
          <Field label="Asset name" required><input required className="field text-lead" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder={namePlaceholder(d.type)} /></Field>
          {dupes.length > 0 && (
            <div className="rounded-xl border border-[rgba(201,154,46,.4)] bg-[rgba(201,154,46,.07)] px-4 py-3">
              <div className="mb-2 text-body font-semibold text-warn-ink">Similar assets already exist. Reuse before you rebuild.</div>
              <div className="flex flex-col gap-1">
                {dupes.map((a) => (
                  <button key={a.id} type="button" onClick={() => openAsset(a.id)} className="py-0.5 text-left text-body text-warn-ink hover:underline">
                    {a.name} <span className="text-warn-text">· {ws.brand(a.brandId)?.name ?? "Global"} · {a.type}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* A Drive link is the link itself, so it is asked for first and files are left out of the way. */}
          {drive && (
            <Field label="Drive link" required>
              <input required type="text" inputMode="url" className="field text-lead" value={d.url} onChange={(e) => set("url", e.target.value)} placeholder="drive.google.com/..." />
            </Field>
          )}
          {/* Pages people land on are their address; ask for it up front. */}
          {!drive && urlFirst && <Field label="Live URL"><input type="text" inputMode="url" className="field" value={d.url} onChange={(e) => set("url", e.target.value)} placeholder="yoursite.org/free-audit" /></Field>}
          {canUpload && !drive && (
            <div>
              <div className="label">Files</div>
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false); }}
                onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
                className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed px-3.5 py-3 transition-colors", drag ? "border-accent bg-soft" : "border-line-strong bg-wash-2")}
              >
                <CloudUpload aria-hidden size={20} className="flex-none text-mute-3" />
                <span className="min-w-[140px] flex-1 text-body text-mute-2">Drop files here, or choose them.</span>
                <Btn size="sm" onClick={() => picker.current?.click()}>Choose files</Btn>
                <input ref={picker} type="file" multiple hidden onChange={(e) => { addFiles(e.currentTarget.files); e.currentTarget.value = ""; }} />
              </div>
              {queued.length > 0 && (
                <ul aria-label="Files to upload" className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
                  {queued.map((f) => (
                    <li key={f.name} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface py-1.5 pl-3 pr-1.5">
                      <Paperclip aria-hidden size={14} className="flex-none text-mute-4" />
                      <span className="min-w-0 flex-1 truncate text-body text-ink-3">{f.name}</span>
                      <span className="flex-none font-mono text-small text-mute-3">{sizeLabel(f.size)}</span>
                      <button type="button" aria-label={`Remove ${f.name} from the upload`} onClick={() => setQueued((q) => q.filter((x) => x !== f))}
                        className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-mute-3 transition-colors hover:bg-hover hover:text-danger">
                        <X aria-hidden size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="m-0 mt-1.5 text-small text-mute-3">
                {queued.length ? `${plural(queued.length)} will upload when you save.` : editing ? "New files are added when you save." : "They upload as soon as the asset is saved."}
                {editing && (draft.files?.length ?? 0) > 0 && " Replace or remove the files already here from the asset itself."}
              </p>
            </div>
          )}
          {/* What a prompt or a checklist is, is its content: that stays up front. */}
          {d.type === "Prompt" && (
            <>
              <Field label="Use for"><input className="field" value={d.promptFor} onChange={(e) => set("promptFor", e.target.value)} placeholder="Copy, Creative, Strategy…" /></Field>
              <Field label="The prompt" hint={<span className="font-normal text-mute-4">[BRACKETS] for the bits people swap</span>}>
                <textarea rows={7} className="field font-[family-name:var(--font-code)] text-body leading-relaxed" value={d.prompt} onChange={(e) => set("prompt", e.target.value)} />
              </Field>
            </>
          )}
          {d.type === "Checklist" && !editing && (
            <Field label="Checks" hint={<span className="font-normal text-mute-4">one per line</span>}>
              <textarea rows={6} className="field leading-relaxed" value={d.checks} onChange={(e) => set("checks", e.target.value)} placeholder={"Tracking fires on submit\nCTA matches the library entry"} />
            </Field>
          )}

          {/* Everything else is optional and waits behind More detail, as on the offer form. */}
          <MoreDetail open={more} onToggle={() => setMore((m) => !m)} filled={filled} hint={moreHint}>
              <div className={cx("grid gap-3", editing && "sm:grid-cols-2")}>
                <Field label="One line about it" hint={<span className="font-normal text-mute-4">shown on the card</span>}><input className="field" value={d.short} onChange={(e) => set("short", e.target.value)} /></Field>
                {editing && <Field label="Status"><Select value={d.status} onChange={(v) => set("status", v as Asset["status"])} options={Object.keys(ASSET_STATUS).map((x) => ({ value: x, label: x }))} /></Field>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Type" required><Select value={d.type} onChange={setType} options={[...(d.type ? [] : [{ value: "", label: "Pick one" }]), ...Object.keys(ASSET_TYPES).map((x) => ({ value: x, label: x }))]} /></Field>
                <Field label="Channel"><Select value={d.channel} onChange={(v) => set("channel", v)} options={CHANNELS.map((x) => ({ value: x, label: x }))} /></Field>
              </div>
              {!drive && !urlFirst && <Field label="Live URL or doc link"><input type="text" inputMode="url" className="field" value={d.url} onChange={(e) => set("url", e.target.value)} placeholder="yoursite.org/page or a doc link" /></Field>}
              {d.brandId && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="CTA"><Select value={d.ctaId} onChange={(v) => set("ctaId", v)} options={[{ value: "", label: "None" }, ...ws.ctasOf(d.brandId).map((c) => ({ value: c.id, label: c.text }))]} /></Field>
                  <TagInput value={d.tags} onChange={(v) => set("tags", v)} text={tagText} onText={setTagText} pool={tagsInUse} placeholder="landing, evergreen" />
                </div>
              )}
              {withCopy && !drive && (
                <div>
                  <div className="label">Copy</div>
                  <div className="flex flex-col gap-2">
                    <input className="field" value={d.copy.headline} onChange={(e) => set("copy", { ...d.copy, headline: e.target.value })} placeholder="Headline" aria-label="Headline" />
                    <textarea rows={3} className="field leading-relaxed" value={d.copy.body} onChange={(e) => set("copy", { ...d.copy, body: e.target.value })} placeholder="Body copy" aria-label="Body copy" />
                    <input className="field" value={d.copy.cta} onChange={(e) => set("copy", { ...d.copy, cta: e.target.value })} placeholder="Button text" aria-label="CTA text" />
                  </div>
                </div>
              )}
              {withDelivery && (
                <div className="grid items-end gap-3 sm:grid-cols-2">
                  <Field label="Delivery"><Select value={d.delivery} onChange={(v) => set("delivery", v)} options={DELIVERY.map((x) => ({ value: x, label: x }))} /></Field>
                  <button type="button" role="checkbox" aria-checked={d.gated} onClick={() => set("gated", !d.gated)} className="flex items-center gap-2 py-2 text-left text-body text-ink-3">
                    <Tick on={d.gated} />Gated: people ask for it
                  </button>
                </div>
              )}
              {withSpecs && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Creative specs"><input className="field" value={d.specs} onChange={(e) => set("specs", e.target.value)} placeholder="1080×1350, 4:5" /></Field>
                  <Field label="Audience notes"><input className="field" value={d.audienceNotes} onChange={(e) => set("audienceNotes", e.target.value)} /></Field>
                </div>
              )}
              <Field label="Notes"><textarea rows={2} className="field leading-relaxed" value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Why this exists, and anything the next person needs to know." /></Field>
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
          </MoreDetail>
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
      <Field label="New name" required><input required className="field text-lead" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
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
            {!ws.offersOf(d.brandId).length && <div className="text-body text-mute-3">No offers in that brand yet.</div>}
          </div>
        </div>
      )}
      <div className="flex gap-4 pt-1.5">
        <button type="button" role="checkbox" aria-checked={d.keepFiles} onClick={() => setD({ ...d, keepFiles: !d.keepFiles })} className="flex items-center gap-2 text-body text-ink-3"><Tick on={d.keepFiles} />Keep files</button>
        <button type="button" role="checkbox" aria-checked={d.keepCopy} onClick={() => setD({ ...d, keepCopy: !d.keepCopy })} className="flex items-center gap-2 text-body text-ink-3"><Tick on={d.keepCopy} />Keep copy</button>
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
  // With nothing linked yet every scope lists the same assets, so the row is no choice and hides.
  const choosable = pool.some((a) => linked.has(a.id));
  const shown = choosable ? scope : "all";
  const rows = pool.filter((a) => {
    if (shown === "unlinked" && linked.has(a.id)) return false;
    if (shown === "linked" && !linked.has(a.id)) return false;
    return !t || `${a.name} ${a.short} ${a.type} ${a.tags.join(" ")}`.toLowerCase().includes(t);
  });
  const color = ws.brand(o.brandId)?.primary ?? "#5E6C66";
  return (
    <Modal title={`Link an asset to ${o.name}`} sub="Linking does not copy anything. The asset stays where it is and appears in one more offer." width={600} footer={<Btn variant="primary" onClick={close}>Done</Btn>} bodyClass="gap-2.5 px-4 pt-4 sm:px-6">
      <input className="field text-body" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the library" aria-label="Search the library" />
      {choosable && <Pills tone="dark" label="Show" value={scope} onChange={setScope} options={[{ value: "unlinked", label: "Not yet linked" }, { value: "linked", label: "Already linked" }, { value: "all", label: "Everything" }]} />}
      <div data-scroll className="-mx-2 max-h-[340px] overflow-y-auto">
        {rows.slice(0, 60).map((a) => {
          const on = linked.has(a.id);
          const other = ws.linkedOfferIds(a.id).length;
          return (
            <div key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5">
              <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg text-micro font-bold" style={{ background: hexA(color, 0.12), color: readable(color) }}>{ws.codeOf(a)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-medium">{a.name}</span>
                <span className="block text-body text-mute-2">{a.type} · {other ? `already in ${other} offer${other > 1 ? "s" : ""}` : "not linked anywhere"}</span>
              </span>
              <Btn size="sm" disabled={pending} variant={on ? "secondary" : "primary"} className="px-3 font-semibold"
                onClick={async () => { const r = await run(toggleLink, a.id, offerId); if (r.ok && !on) { setNudge({ assetId: a.id, offerId }); close(); } }}>
                {on ? "Unlink" : "Link"}
              </Btn>
            </div>
          );
        })}
        {!rows.length && <div className="p-9 text-center text-body text-mute-2">Nothing left to link here.</div>}
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
    <Modal title="Which offers use this?" sub={`${a.name} stays a single asset. Linking just adds it to another offer.`} footer={<Btn variant="primary" onClick={close}>Done</Btn>} bodyClass="max-h-[360px] gap-2 overflow-y-auto px-5 pt-3.5">
      {pool.map((o) => {
        const on = linked.has(o.id);
        return (
          <div key={o.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-3">
            <span className="flex-1 text-body font-medium">{o.name}</span>
            <Chip color={ws.segColor(o.segment, o.brandId)} size="xs">{o.segment}</Chip>
            <button type="button" disabled={pending} aria-pressed={on} onClick={() => run(toggleLink, assetId, o.id)}
              className={cx("flex-none rounded-lg border px-3 py-1 text-meta font-semibold", on ? "border-accent bg-soft text-accent" : "border-line bg-surface text-mute-1 hover:border-mute-2")}>
              {on ? "Linked" : "Link"}
            </button>
          </div>
        );
      })}
      {!pool.length && <div className="p-8 text-center text-body text-mute-2">This brand has no offers yet.</div>}
    </Modal>
  );
}
