"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Asset } from "@/db/schema";
import { hexA, readable } from "@/lib/color";
import { ASSET_STATUS, CHANNEL_COLOR, REVIEW_COLOR } from "@/lib/constants";
import { href } from "@/lib/routes";
import { waitOn } from "@/lib/types";
import {
  addItem, approveItem, listVersions, moveItem, removeFile, removeItem, resetList, restoreVersion,
  setArchived, setDue, setStatus, toggleClientVisible, toggleItem, toggleLink, trackVisit,
} from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { Thread } from "@/components/discussion";
import { ArchivedNote, Avatar, Btn, ChangeNote, Chip, DueBadge, Eyebrow, Hint, cx } from "@/components/ui";
import { toDateInput } from "@/lib/time";
import { AiDraftButton } from "@/components/ai";

const IMAGE = /^image\/(png|jpe?g|gif|webp|avif)$/;

type Tab = "overview" | "list" | "prompt" | "copy" | "files" | "discussion" | "history" | "sharing";

export function AssetDrawer() {
  const { assetId, ws } = useApp();
  const a = assetId ? ws.asset(assetId) : null;
  if (!assetId) return null;
  if (!a) return <Missing />;
  return <Drawer key={a.id} a={a} />;
}

function Missing() {
  const { closeAsset } = useApp();
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 animate-fade bg-[rgba(16,22,20,.28)]" onClick={closeAsset} />
      <div className="absolute inset-y-0 right-0 flex w-[560px] max-w-full animate-slide flex-col items-center justify-center gap-3 bg-white p-10 text-center">
        <div className="text-[16px] font-semibold">This asset is not here any more</div>
        <div className="text-[15px] text-mute-2">It was deleted, or it belongs to a client you cannot see.</div>
        <Btn onClick={closeAsset}>Close</Btn>
      </div>
    </div>
  );
}

function Drawer({ a }: { a: Asset }) {
  const { ws, closeAsset, open } = useApp();
  const [run] = useAction();
  const params = useSearchParams();
  const router = useRouter();
  const initial = (params.get("tab") as Tab) || "overview";
  const [tab, setTab] = useState<Tab>(initial);
  useEffect(() => { void trackVisit("asset", a.id); }, [a.id]);

  const b = ws.brand(a.brandId);
  const color = b?.primary ?? "#64748B";
  const offers = ws.linkedOffers(a.id);
  const cat = ws.catOf(a);
  const canEdit = ws.canChange(a) && (!!a.brandId || ws.can("library"));
  const items = a.items ?? [];
  const done = items.filter((i) => i.done).length;
  const files = a.files ?? [];

  const tabs: [Tab, string][] = [
    ["overview", "Overview"],
    ...(a.type === "Checklist" ? [["list", `Checklist · ${done}/${items.length}`] as [Tab, string]] : []),
    ...(a.type === "Prompt" ? [["prompt", "Prompt"] as [Tab, string]] : []),
    ["copy", "Copy"],
    ["files", `Files · ${files.length}`],
    ["discussion", `Discussion · ${ws.openCount("asset", a.id)}`],
    ["history", "History"],
    ["sharing", "Client"],
  ];

  const editDraft = () => open({ kind: "asset", draft: { ...a, offerIds: offers.map((o) => o.id), copy: a.copy ?? { headline: "", body: "", cta: "" } }, step: 3 });

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={a.name}>
      <div className="absolute inset-0 animate-fade bg-[rgba(16,22,20,.28)]" onClick={closeAsset} />
      <div data-scroll className="absolute inset-y-0 right-0 w-[560px] max-w-full animate-slide overflow-y-auto border-l border-line bg-white shadow-[-16px_0_44px_rgba(16,22,20,.10)]">
        <div className="sticky top-0 z-[2] flex flex-wrap items-center gap-2 border-b border-line bg-white/95 px-4 py-3.5 backdrop-blur-[8px] sm:px-6">
          <button type="button" aria-label="Close" onClick={closeAsset} className="px-1.5 py-0.5 text-[16px] text-mute-2 hover:text-ink">←</button>
          <span className="flex-1" />
          {canEdit && a.brandId && <Btn size="sm" onClick={() => open({ kind: "linkAsset", assetId: a.id })}>Link to offers</Btn>}
          {canEdit && <Btn size="sm" onClick={() => open({ kind: "clone", srcId: a.id, brandId: a.brandId, name: a.name + " (copy)", offerIds: [] })}>Clone</Btn>}
          {canEdit && <Btn size="sm" variant="primary" onClick={editDraft}>Edit</Btn>}
          {ws.can("archive") && (
            <button type="button" onClick={() => run(setArchived, "asset", a.id, !a.archived)} className="px-1 py-[5px] text-[14px] text-mute-1 hover:text-ink">{a.archived ? "Restore" : "Archive"}</button>
          )}
          {ws.can("del") && (
            <button type="button" onClick={() => open({ kind: "confirm", item: "asset", id: a.id, label: a.name })} className="px-1 py-[5px] text-[14px] text-danger hover:underline">Delete</button>
          )}
        </div>

        <div className="px-5 pb-10 pt-[26px] sm:px-7">
          <div className="mb-5 flex items-start gap-4">
            {ws.previewOf(a) ? (
              // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file
              <img src={ws.previewOf(a)!} alt="" className="h-14 w-14 flex-none rounded-[13px] border border-line object-cover" />
            ) : (
              <span className="flex h-14 w-14 flex-none items-center justify-center rounded-[13px] text-[15px] font-bold tracking-[0.03em]" style={{ background: hexA(color, 0.12), color: readable(color) }}>{ws.codeOf(a)}</span>
            )}
            <span className="min-w-0 flex-1">
              <Eyebrow className="mb-1.5">{cat === "campaign" ? "Campaign asset" : cat === "master" ? "Master file" : "Global asset"}</Eyebrow>
              <span className="block text-[22px] font-semibold leading-[1.25] tracking-[-0.018em]">{a.name}</span>
              {a.short && <span className="mt-1 block text-[15px] text-mute-2">{a.short}</span>}
            </span>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-1.5">
            <span className="eyebrow mr-[3px]">Status</span>
            {!canEdit && <Chip color={ASSET_STATUS[a.status]} size="md" className="rounded-[7px] px-2.5 py-1">{a.status}</Chip>}
            {canEdit && (Object.keys(ASSET_STATUS) as Asset["status"][]).map((k) => {
              const on = a.status === k; const c = ASSET_STATUS[k];
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => !on && run(setStatus, "asset", a.id, k)} className="rounded-[7px] border px-2.5 py-1 text-[14px] font-medium transition"
                  style={{ borderColor: on ? hexA(c, 0.4) : "var(--bos-border)", background: on ? hexA(c, 0.16) : "#FFF", color: on ? readable(c) : "#4B5A6E" }}>{k}</button>
              );
            })}
          </div>

          {a.archived && <ArchivedNote className="mb-4">Archived. Offers that link to it still show it, greyed out.</ArchivedNote>}

          <ReviewBar kind="asset" item={a} />
          {a.changeNote && a.review === "Changes requested" && <ChangeNote className="mb-[18px]">{a.changeNote}</ChangeNote>}

          <div className="mb-[22px] overflow-hidden rounded-xl border border-line">
            <div className="grid grid-cols-2">
              <Meta label="Brand" border="br">{b ? <button type="button" className="text-left hover:text-accent" onClick={() => router.push(href.brand(b.id))}>{b.name}</button> : "Global Library"}</Meta>
              <Meta label="Type" border="b">{a.type}</Meta>
              <Meta label="Channel" border="br"><Chip color={CHANNEL_COLOR[a.channel] ?? "#475569"} size="md">{a.channel}</Chip></Meta>
              <Meta label="Visibility" border="b">{a.clientVisible ? "Visible to client" : "Internal only"}</Meta>
              <Meta label="Delivery" border="br">{a.delivery || "None"}</Meta>
              <Meta label="Access" border="b">{a.gated ? "Gated — requested, then sent" : "Open"}</Meta>
              <Meta label="Owner" border="r">{ws.user(a.ownerId).name}</Meta>
              <Meta label="Version">v{a.version} · updated {ws.ago(a.updatedAt)}</Meta>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
              <span className="text-[13px] text-mute-4">Due</span>
              {canEdit ? (
                <input type="date" aria-label="Due date" defaultValue={toDateInput(a.dueAt)} key={String(a.dueAt)}
                  onChange={(e) => run(setDue, "asset", a.id, e.target.value || null)} className="rounded-[7px] border border-line bg-white px-2 py-1 text-[14px]" />
              ) : (
                <span className="text-[15px] font-medium">{a.dueAt ? new Date(a.dueAt).toDateString() : "No date"}</span>
              )}
              <DueBadge at={a.dueAt} now={ws.d.now} done={a.status === "Live"} />
            </div>
          </div>

          <div className="mb-[22px] flex gap-0.5 overflow-x-auto border-b border-line" role="tablist">
            {tabs.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={cx("-mb-px flex-none border-b-2 px-[13px] py-2 text-[15px] transition", tab === k ? "border-accent font-semibold text-ink" : "border-transparent font-medium text-mute-2 hover:text-ink")}>
                {label}
              </button>
            ))}
          </div>

          {tab === "overview" && <Overview a={a} />}
          {tab === "list" && <Checklist a={a} />}
          {tab === "prompt" && <PromptTab a={a} />}
          {tab === "copy" && <CopyTab a={a} onEdit={editDraft} />}
          {tab === "files" && <Files a={a} />}
          {tab === "discussion" && <Thread kind="asset" id={a.id} />}
          {tab === "history" && <History a={a} />}
          {tab === "sharing" && <Sharing a={a} />}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, children, border }: { label: string; children: React.ReactNode; border?: "b" | "r" | "br" }) {
  return (
    <div className={cx("px-4 py-[13px]", border?.includes("r") && "border-r border-line", border?.includes("b") && "border-b border-line")}>
      <div className="mb-[3px] text-[13px] text-mute-4">{label}</div>
      <div className="text-[15px] font-medium">{children}</div>
    </div>
  );
}

export function ReviewBar({ kind, item }: { kind: "asset" | "offer"; item: Pick<Asset, "id" | "review" | "reviewerId" | "ownerId"> }) {
  const { ws, open } = useApp();
  const [run, pending] = useAction();
  const w = waitOn(item);
  const tone = w ? (w.act === "review" ? "#8A6A12" : "#C2410C") : null;
  const label = item.review === "None" ? "Not reviewed" : item.review;
  return (
    <div
      className={cx("flex flex-wrap items-center gap-2 border px-3.5 py-3", kind === "asset" ? "mb-[18px] rounded-[11px]" : "mb-3 rounded-xl bg-white px-[18px] py-[13px]")}
      style={{ background: tone ? hexA(tone, 0.08) : kind === "asset" ? "transparent" : "#FFFFFF", borderColor: tone ? hexA(tone, 0.35) : "var(--bos-border)" }}
    >
      <Chip color={REVIEW_COLOR[item.review]}>{label}</Chip>
      {w && (
        <span className="min-w-[110px] flex-1 text-[15px] font-semibold text-ink-3">
          {w.verb} — {ws.user(w.who).name}{w.who === ws.me.id ? " (you)" : ""}
        </span>
      )}
      {!w && <span className="min-w-5 flex-1" />}
      {ws.canChange(item) && (!ws.can("review") || item.review !== "In review") && (
        <Btn size="sm" disabled={pending} onClick={() => open({ kind: "sendReview", item: kind, id: item.id })}>{item.review === "In review" ? "Reassign" : "Send for review"}</Btn>
      )}
      {ws.can("review") && (
        <>
          {ws.canChange(item) && item.review === "In review" && <Btn size="sm" disabled={pending} onClick={() => open({ kind: "sendReview", item: kind, id: item.id })}>Reassign</Btn>}
          <Btn size="sm" variant="change" disabled={pending} onClick={() => open({ kind: "reqChanges", item: kind, id: item.id })}>Request changes</Btn>
          <Btn size="sm" variant="approve" disabled={pending || item.review === "Approved"} onClick={() => run(approveItem, kind, item.id)}>{item.review === "Approved" ? "Approved" : "Approve"}</Btn>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- tabs */

function Overview({ a }: { a: Asset }) {
  const { ws } = useApp();
  const router = useRouter();
  const [run] = useAction();
  const offers = ws.linkedOffers(a.id);
  const src = a.clonedFromId ? ws.asset(a.clonedFromId) : null;
  const section = (label: string, body: React.ReactNode) => (
    <div className="mb-[18px]"><Eyebrow className="mb-1.5">{label}</Eyebrow>{body}</div>
  );
  return (
    <div>
      <Eyebrow className="mb-2.5">{offers.length === 0 ? "Not linked to any offer" : `Linked to ${offers.length} offer${offers.length > 1 ? "s" : ""}`}</Eyebrow>
      <div className="mb-6 flex flex-col gap-[7px]">
        {offers.map((o) => (
          <div key={o.id} className="flex items-center gap-2.5 rounded-[10px] border border-line px-[13px] py-[11px]">
            <button type="button" onClick={() => router.push(href.offer(o.id))} className="flex-1 text-left text-[15px] font-medium text-ink hover:text-accent">{o.name}</button>
            <Chip color={ws.segColor(o.segment, o.brandId)} size="xs">{o.segment}</Chip>
            {ws.canChange(a) && <button type="button" onClick={() => run(toggleLink, a.id, o.id)} className="flex-none px-1 py-0.5 text-[13.5px] text-mute-5 hover:text-danger">Unlink</button>}
          </div>
        ))}
        {!offers.length && a.brandId && (
          <div className="rounded-[10px] border border-dashed border-[rgba(201,154,46,.5)] bg-[rgba(201,154,46,.07)] p-4 text-[15px] text-warn-ink">
            This asset is not linked to anything, so nobody will find it by walking through the rooms.
          </div>
        )}
        {!offers.length && !a.brandId && <div className="text-[15px] text-mute-2">Global Library items are not linked to offers. Clone one into a brand when you run it.</div>}
      </div>
      {src && (
        <div className="mb-[22px] rounded-[10px] bg-wash px-3.5 py-3 text-[15px] text-mute-1">
          Cloned from <button type="button" className="font-semibold text-ink hover:underline" onClick={() => ws.asset(src.id) && router.push(`?asset=${src.id}`, { scroll: false })}>{src.name}</button>
        </div>
      )}
      {a.url && section("Live URL", <a href={a.url.startsWith("http") ? a.url : `https://${a.url}`} target="_blank" rel="noreferrer" className="break-all text-[15px] text-accent hover:underline">{a.url}</a>)}
      {a.tags.length > 0 && section("Tags", <div className="flex flex-wrap gap-[5px]">{a.tags.map((t) => <span key={t} className="rounded-[5px] bg-chip px-[9px] py-[3px] text-[13.5px] text-mute-1">{t}</span>)}</div>)}
      {a.ctaId && ws.cta(a.ctaId) && section("Call to action", <CtaButton id={a.ctaId} />)}
      {a.specs && section("Creative specs", <div className="text-[15px] leading-[1.55] text-ink-3">{a.specs}</div>)}
      {a.audienceNotes && section("Audience notes", <div className="text-[15px] leading-[1.55] text-ink-3">{a.audienceNotes}</div>)}
      {a.aiPrompt && section("AI prompt used", <div className="text-[15px] italic leading-[1.55] text-mute-1">{a.aiPrompt}</div>)}
      {a.notes && section("Notes", <div className="whitespace-pre-wrap text-[15px] leading-[1.6] text-ink-3 text-pretty">{a.notes}</div>)}
    </div>
  );
}

export function CtaButton({ id, size = "md" }: { id: string; size?: "md" | "lg" }) {
  const { ws } = useApp();
  const c = ws.cta(id);
  if (!c) return null;
  const outline = c.style === "outline";
  const ghost = c.style === "ghost";
  return (
    <span
      title={c.url}
      className={cx("inline-block rounded-[7px] font-semibold", size === "lg" ? "px-[17px] py-[9px] text-[15px]" : "px-[15px] py-[7px] text-[15px]")}
      style={{ background: outline || ghost ? "transparent" : c.bg, color: c.fg, border: `1.5px solid ${outline ? c.fg : "transparent"}`, textDecoration: ghost ? "underline" : undefined }}
    >
      {c.text}
    </span>
  );
}

function Checklist({ a }: { a: Asset }) {
  const { ws } = useApp();
  const [run] = useAction();
  const [text, setText] = useState("");
  const items = a.items ?? [];
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const canTick = ws.can("comment");
  return (
    <div>
      <div className="mb-3.5 flex items-center gap-3">
        <span className="text-[15px] font-semibold">{done} of {items.length} done</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-avatar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span className="block h-1.5 rounded-[3px] bg-accent transition-[width] duration-300" style={{ width: pct + "%" }} />
        </span>
        {canTick && <button type="button" onClick={() => run(resetList, a.id)} className="flex-none px-1 py-0.5 text-[14px] text-mute-3 hover:text-ink">Reset</button>}
      </div>
      {items.length > 0 && done === items.length && (
        <div className="mb-3 rounded-[11px] border border-[rgba(47,143,98,.28)] bg-[rgba(47,143,98,.09)] px-[15px] py-[11px] text-[15px] text-[#1F6F4A]">Every check is done.</div>
      )}
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        {items.map((it, idx) => (
          <div key={idx} className="group flex items-start gap-3 border-t border-divider px-[15px] py-3 first:border-t-0">
            <button type="button" role="checkbox" aria-checked={it.done} disabled={!canTick} onClick={() => run(toggleItem, a.id, idx)}
              className="mt-px flex h-[19px] w-[19px] flex-none items-center justify-center rounded-[5px] text-[13.5px] font-bold text-white disabled:cursor-default"
              style={{ border: `1.5px solid ${it.done ? "var(--bos-accent)" : "#CBD5E1"}`, background: it.done ? "var(--bos-accent)" : "#FFF" }}>
              {it.done ? "✓" : ""}
            </button>
            <span className="mt-[3px] flex-none font-mono text-[13.5px] text-mute-5">{String(idx + 1).padStart(2, "0")}</span>
            <span className="flex-1 text-[16px] leading-[1.5] text-pretty" style={{ color: it.done ? "#4B5A6E" : "#1E293B", textDecoration: it.done ? "line-through" : "none" }}>{it.text}</span>
            {ws.can("edit") && (
              <span className="flex flex-none gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <button type="button" aria-label="Move up" disabled={idx === 0} onClick={() => run(moveItem, a.id, idx, -1)} className="px-1 text-[13.5px] text-line-strong hover:text-ink disabled:opacity-30">↑</button>
                <button type="button" aria-label="Move down" disabled={idx === items.length - 1} onClick={() => run(moveItem, a.id, idx, 1)} className="px-1 text-[13.5px] text-line-strong hover:text-ink disabled:opacity-30">↓</button>
                <button type="button" aria-label="Remove check" onClick={() => run(removeItem, a.id, idx)} className="px-1 text-[14.5px] text-line-strong hover:text-danger">✕</button>
              </span>
            )}
          </div>
        ))}
        {!items.length && <div className="p-[30px] text-center text-[15px] text-mute-2">No checks yet.</div>}
      </div>
      {ws.can("edit") && (
        <form className="mt-2.5 flex gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await run(addItem, a.id, text); if (r.ok) setText(""); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a check" aria-label="Add a check" className="field flex-1 text-[15px]" />
          <Btn type="submit" size="lg" className="font-semibold">Add</Btn>
        </form>
      )}
      <Hint className="mt-3.5">
        {ws.can("edit")
          ? "This is the master copy. Clone it into a brand when you run it on a real project, so the ticks belong to that job and this one stays clean."
          : "This is the master copy. The ticks show where the team last left it — ask an editor if something needs changing."}
      </Hint>
    </div>
  );
}

function useCopied() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, key: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied((k) => (k === key ? null : k)), 1600);
  };
  return [copied, copy] as const;
}

function PromptTab({ a }: { a: Asset }) {
  const { ws } = useApp();
  const [copied, copy] = useCopied();
  return (
    <div>
      <div className="mb-3 flex items-center gap-[11px]">
        <span className="eyebrow text-[12px]">Use for</span>
        <span className="text-[15px] font-semibold">{a.promptFor || "—"}</span>
        <span className="flex-1" />
        <Btn size="sm" className="font-semibold text-accent hover:border-accent" onClick={() => copy(a.prompt, "prompt")} disabled={!a.prompt}>{copied === "prompt" ? "Copied" : "Copy prompt"}</Btn>
      </div>
      <div className="rounded-xl border border-line bg-[#F8FAFC] px-5 py-[18px]">
        <pre className="m-0 whitespace-pre-wrap break-words font-[family-name:var(--font-code)] text-[15px] leading-[1.75] text-ink-2">{a.prompt || "No prompt written yet."}</pre>
      </div>
      <Hint className="mt-3.5">
        {ws.can("edit")
          ? "Square brackets are the bits you swap per job. This is the finalised version — if you improve it, edit it here rather than keeping a better one in your notes."
          : "Square brackets are the bits you swap per job. Copy it and fill them in — this is the finalised version the team agreed on."}
      </Hint>
    </div>
  );
}

function CopyTab({ a, onEdit }: { a: Asset; onEdit: () => void }) {
  const { ws } = useApp();
  const [copied, copy] = useCopied();
  const c = a.copy;
  const has = !!(c && (c.headline || c.body));
  if (!has) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong p-9 text-center">
        <div className="mb-[5px] text-[16px] font-semibold">No copy written yet</div>
        <div className="mb-4 text-[15px] text-mute-2">Headline, body and CTA live here so nobody has to open a design file to read them.</div>
        {ws.can("edit") && (
          <div className="flex flex-wrap justify-center gap-2">
            <Btn variant="primary" onClick={onEdit}>Write the copy</Btn>
            {a.brandId && ws.d.aiEnabled && <AiDraftButton assetId={a.id} />}
          </div>
        )}
      </div>
    );
  }
  const all = [c!.headline, c!.body, c!.cta].filter(Boolean).join("\n\n");
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-line">
        <div className="border-b border-line px-[18px] py-4">
          <div className="mb-[5px] flex items-center text-[13px] text-mute-4"><span className="flex-1">Headline</span><CopyLink on={copied === "h"} onClick={() => copy(c!.headline, "h")} /></div>
          <div className="text-[17px] font-semibold leading-[1.4] tracking-[-0.01em] text-pretty">{c!.headline}</div>
        </div>
        <div className="border-b border-line px-[18px] py-4">
          <div className="mb-[5px] flex items-center text-[13px] text-mute-4"><span className="flex-1">Body</span><CopyLink on={copied === "b"} onClick={() => copy(c!.body, "b")} /></div>
          <div className="whitespace-pre-wrap text-[16px] leading-[1.65] text-ink-3 text-pretty">{c!.body}</div>
        </div>
        <div className="flex items-center gap-3 px-[18px] py-4">
          <div><div className="mb-[5px] text-[13px] text-mute-4">Call to action</div><div className="text-[16px] font-semibold">{c!.cta || "—"}</div></div>
          <span className="flex-1" />
          <Btn size="sm" onClick={() => copy(all, "all")}>{copied === "all" ? "Copied" : "Copy all"}</Btn>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[14.5px] text-mute-3">
        <span className="flex-1">{wordCount(all)} words · reads in about {Math.max(1, Math.round(wordCount(all) / 3.5))} seconds</span>
        {ws.can("edit") && a.brandId && ws.d.aiEnabled && <AiDraftButton assetId={a.id} label="Suggest a rewrite" />}
      </div>
    </div>
  );
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function CopyLink({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="text-[13px] text-mute-4 hover:text-ink">{on ? "Copied" : "Copy"}</button>;
}

function Files({ a }: { a: Asset }) {
  const { ws, toast } = useApp();
  const [run] = useAction();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const files = a.files ?? [];
  const canEdit = ws.canChange(a) && (!!a.brandId || ws.can("library"));

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      Array.from(list).forEach((f) => fd.append("file", f));
      const res = await fetch(`/api/assets/${a.id}/files`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) toast(body.error ?? "Upload failed.", "error");
      else { toast(`${list.length} file${list.length > 1 ? "s" : ""} added`); router.refresh(); }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div
      onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { if (!canEdit) return; e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files); }}
      className={cx("rounded-xl transition", drag && "outline-2 outline-dashed outline-accent outline-offset-4")}
    >
      {files.some((f) => f.url && IMAGE.test(f.type ?? "")) && (
        <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {files.filter((f) => f.url && IMAGE.test(f.type ?? "")).map((f) => (
            <a key={f.name} href={`${f.url}?inline=1`} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-[10px] border border-line bg-wash" title={`Open ${f.name}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file */}
              <img src={`${f.url}?inline=1`} alt={f.name} loading="lazy" className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.02]" />
            </a>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="rounded-xl border border-line px-[18px] py-1">
          {files.map((f) => (
            <div key={f.name} className="group flex items-center gap-3 border-t border-divider py-3 first:border-t-0">
              <span className="min-w-0 flex-1 truncate text-[16px] font-medium">{f.name}</span>
              <span className="flex-none font-mono text-[14px] text-[#526077]">{f.size}</span>
              {f.url ? (
                <a href={f.url} download={f.name} className="flex-none rounded-[7px] border border-line bg-white px-[11px] py-[5px] text-[14px] font-semibold text-accent hover:border-accent">Download</a>
              ) : (
                <span title="Listed for reference. The file itself was never uploaded here." className="flex-none rounded-[7px] border border-dashed border-line px-[11px] py-[5px] text-[14px] text-mute-4">Not uploaded</span>
              )}
              {canEdit && <button type="button" aria-label={`Remove ${f.name}`} onClick={() => run(removeFile, a.id, f.name)} className="flex-none px-1 text-[14.5px] text-line-strong opacity-0 transition hover:text-danger group-hover:opacity-100 focus:opacity-100">✕</button>}
            </div>
          ))}
        </div>
      )}
      {!files.length && <div className="rounded-xl border border-dashed border-line-strong p-9 text-center text-[15px] text-mute-2">No files attached yet.</div>}
      {canEdit && (
        <>
          <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="mt-2.5 w-full rounded-[10px] border border-line bg-white p-2.5 text-[15px] font-semibold text-ink-3 hover:border-mute-2 disabled:opacity-60">
            {busy ? "Uploading…" : "Upload files — or drop them here"}
          </button>
        </>
      )}
    </div>
  );
}

type VersionRow = Awaited<ReturnType<typeof listVersions>>[number];

function History({ a }: { a: Asset }) {
  const { ws } = useApp();
  const [run, pending] = useAction();
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    listVersions(a.id).then((v) => alive && setVersions(v));
    return () => { alive = false; };
  }, [a.id, a.version]);
  const acts = ws.d.activity.filter((x) => x.type === "asset" && x.itemId === a.id);
  return (
    <div>
      <Eyebrow className="mb-2.5">Activity</Eyebrow>
      {acts.length ? (
        <div className="mb-6 rounded-xl border border-line px-[18px] py-1">
          {acts.map((x) => (
            <div key={x.id} className="flex items-center gap-[11px] border-t border-divider py-[13px] first:border-t-0">
              <Avatar initials={ws.user(x.userId).initials} size={20} />
              <span className="flex-1 text-[15px] text-ink-3">{ws.first(x.userId)} {x.action}{x.field ? ` — ${x.field}` : ""}</span>
              <span className="flex-none text-[14px] text-[#526077]">{ws.ago(x.createdAt)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-dashed border-line-strong p-9 text-center text-[15px] text-mute-2">No changes recorded since this asset was created.</div>
      )}
      <Eyebrow className="mb-2.5">Earlier versions</Eyebrow>
      {versions === null && <div className="text-[15px] text-mute-4">Loading…</div>}
      {versions && !versions.length && <div className="text-[15px] text-mute-3">Every edit saves the version before it. Nothing has been edited here yet.</div>}
      {versions && versions.length > 0 && (
        <div className="rounded-xl border border-line px-[18px] py-1">
          {versions.map((v) => (
            <div key={v.id} className="flex items-center gap-3 border-t border-divider py-3 first:border-t-0">
              <span className="flex-none font-mono text-[14px] font-semibold text-mute-1">v{v.version}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-ink-3">{v.headline || v.name}</span>
                <span className="block text-[13.5px] text-mute-4">replaced {ws.ago(v.createdAt)}{v.userId ? ` by ${ws.first(v.userId)}` : ""}</span>
              </span>
              {ws.canChange(a) && <Btn size="sm" disabled={pending} onClick={() => run(restoreVersion, a.id, v.id)}>Restore</Btn>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Sharing({ a }: { a: Asset }) {
  const { ws, open } = useApp();
  const [run, pending] = useAction();
  const label = a.clientVisible ? "Visible to client" : "Internal only";
  return (
    <div>
      <div className="rounded-xl border border-line p-[18px]">
        <div className="flex items-center gap-3.5">
          <div className="flex-1">
            <div className="mb-[3px] text-[16px] font-semibold">Cleared to send</div>
            <div className="text-[14.5px] leading-[1.5] text-mute-2">Marks this as signed off and safe to put in front of the client.</div>
          </div>
          {ws.can("share") ? (
            <button type="button" role="switch" aria-checked={a.clientVisible} disabled={pending} onClick={() => run(toggleClientVisible, a.id)}
              className={cx("flex flex-none items-center gap-2 rounded-[7px] border px-[13px] py-1.5 text-[14.5px] font-medium", a.clientVisible ? "border-ok/40 bg-[rgba(47,143,98,.08)] text-ok" : "border-line bg-white text-ink-3 hover:border-mute-2")}>
              <span className={cx("h-2 w-2 rounded-full", a.clientVisible ? "bg-ok" : "bg-line-strong")} />{label}
            </button>
          ) : (
            <span className="flex-none rounded-[7px] bg-chip px-[13px] py-1.5 text-[14.5px] font-semibold text-mute-1">{label}</span>
          )}
        </div>
        {a.clientVisible && a.review !== "Approved" && (
          <div className="mt-3 rounded-[9px] bg-[rgba(201,154,46,.08)] px-3 py-2 text-[14.5px] text-warn-ink">Cleared to send, but nobody has approved it yet.</div>
        )}
      </div>
      <Hint className="mt-3.5">Assets cleared to send appear for people with the Client role and on the brand&apos;s client share page. Every other asset stays internal.</Hint>
      {a.brandId && ws.can("share") && <Btn className="mt-3" onClick={() => open({ kind: "share", brandId: a.brandId! })}>Manage client links</Btn>}
    </div>
  );
}
