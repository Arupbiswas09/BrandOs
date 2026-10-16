"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Archive, ArchiveRestore, CalendarDays, Clock, Layers, Megaphone, Pencil, Split, Undo2, Workflow } from "lucide-react";
import { hexA, readable } from "@/lib/color";
import { OFFER_STATUS } from "@/lib/constants";
import { href } from "@/lib/routes";
import type { Offer } from "@/db/schema";
import { setArchived, setDue, setStatus } from "@/app/actions";
import { toDateInput } from "@/lib/time";
import { useAction, useApp } from "@/components/app/provider";
import { GoalChips } from "@/components/cards";
import { OfferAssets } from "@/components/folders/offer-assets";
import { CommentText, Thread } from "@/components/discussion";
import { CtaButton, ReviewBar } from "@/components/drawer/asset-drawer";
import { ArchivedNote, Avatar, Btn, Card, ChangeNote, Chip, Eyebrow, Page } from "@/components/ui";
import { EntityHeader, IconTile, MetaItem } from "@/components/polish";
import { MoreMenu } from "@/components/more-menu";
import { FunnelBoard } from "@/components/funnel/funnel-board";
import { NotHere, useVisit } from "./common";
import { fmtDate } from "@/lib/format";

export function OfferPage({ id }: { id: string }) {
  const { ws, open, openAsset, nudge, setNudge, toast } = useApp();
  const [run] = useAction();
  const o = ws.offer(id);
  useVisit("offer", id, !!o);
  useEffect(() => () => setNudge(null), [id, setNudge]);
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#discussion") {
      document.getElementById("discussion")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [id]);
  if (!o) return <NotHere what="offer" />;

  const b = ws.brand(o.brandId);
  const sv = ws.service(o.serviceId);
  const canEdit = ws.canChange(o);
  const mentions = ws.mentionsOf("offer", o.id);
  const openNotes = ws.openCount("offer", o.id);
  const nudgeAsset = nudge?.offerId === o.id ? ws.asset(nudge.assetId) : null;
  const missing = missingPieces(o);

  return (
    <Page>
      <EntityHeader
        eyebrow={<>Offer{b ? <> · <Link href={href.brand(b.id, "offers")} className="hover:text-ink hover:underline">{b.name}</Link></> : null}</>}
        lead={<IconTile icon={Megaphone} color={b?.primary} size={48} className="rounded-xl" />}
        title={o.name}
        sub={o.short}
        meta={
          <>
            <Chip color={OFFER_STATUS[o.status]} size="sm">{o.status}</Chip>
            <Chip color={ws.segColor(o.segment, o.brandId)} size="sm">{o.segment}</Chip>
            {sv ? (
              <Link href={href.service(sv.id)} className="inline-flex items-center gap-1 rounded-sm border border-line bg-surface px-2 py-0.5 text-small font-semibold text-mute-1 transition hover:border-accent hover:text-ink">
                <Layers aria-hidden size={13} />{sv.name}
              </Link>
            ) : (
              <span className="rounded-sm border border-dashed border-line-strong px-2 py-0.5 text-small font-semibold text-mute-3">Standalone</span>
            )}
            <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
            <MetaItem icon={Clock}><span>Updated {ws.ago(o.updatedAt)}</span></MetaItem>
            <MetaItem><Avatar initials={ws.user(o.ownerId).initials} size={20} />{ws.user(o.ownerId).name}</MetaItem>
          </>
        }
        actions={(canEdit || ws.can("archive")) && (
          <>
            {canEdit && <Btn onClick={() => {
              const taken = new Set(ws.offersOf(o.brandId).filter((x) => x.serviceId === o.serviceId && !x.archived).map((x) => x.segment));
              const next = b?.segments.find((sg) => sg.name !== "All segments" && !taken.has(sg.name))?.name ?? o.segment;
              open({ kind: "offer", draft: { ...o, id: undefined, name: `${o.name} — ${next}`, segment: next, status: "Ideation", review: "None" } });
            }}><Split aria-hidden size={16} />Adapt for another segment</Btn>}
            {ws.can("archive") && <Btn onClick={() => run(setArchived, "offer", o.id, !o.archived)}>{o.archived ? <ArchiveRestore aria-hidden size={16} /> : <Archive aria-hidden size={16} />}{o.archived ? "Restore" : "Archive"}</Btn>}
            {canEdit && <Btn variant="primary" onClick={() => open({ kind: "offer", draft: o })}><Pencil aria-hidden size={16} />Edit</Btn>}
            {/* Offers are never deleted. One that was cancelled, or added by mistake, goes back to draft. */}
            <MoreMenu label="More offer actions" items={canEdit && o.status !== "Ideation" ? [{ label: "Move back to draft", icon: <Undo2 aria-hidden size={16} />, onSelect: async () => { if ((await run(setStatus, "offer", o.id, "Ideation")).ok) toast("Moved back to draft"); } }] : []} />
          </>
        )}
      />

      {o.archived && <ArchivedNote className="mb-4">Archived. Its assets are still in the library — only this offer is closed.</ArchivedNote>}

      <Card className="mb-5 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-divider px-5 py-3">
          <Workflow aria-hidden size={16} className="text-mute-4" />
          <h2 className="m-0 text-body font-semibold">Workflow</h2>
        </div>
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="eyebrow mb-2">Status</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {!canEdit && <Chip color={OFFER_STATUS[o.status]} size="md" className="rounded-lg px-3 py-1">{o.status}</Chip>}
              {canEdit && (Object.keys(OFFER_STATUS) as Offer["status"][]).map((k) => {
                const on = o.status === k; const c = OFFER_STATUS[k];
                return (
                  <button key={k} type="button" aria-pressed={on} onClick={() => !on && run(setStatus, "offer", o.id, k)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-meta font-medium transition hover:border-line-strong"
                    style={{ borderColor: on ? hexA(c, 0.45) : "var(--bos-border)", background: on ? hexA(c, 0.16) : "#FFF", color: on ? readable(c) : "#56645E" }}>
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: c }} />{k}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex-none">
            <div className="eyebrow mb-2">Launch</div>
            <div className="flex flex-wrap items-center gap-2.5">
              {canEdit ? (
                <input type="date" aria-label="Launch date" defaultValue={toDateInput(o.dueAt)} key={String(o.dueAt)}
                  onChange={(e) => run(setDue, "offer", o.id, e.target.value || null)} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-meta" />
              ) : (
                <span className="inline-flex items-center gap-1.5 text-body text-ink-3"><CalendarDays aria-hidden size={15} className="text-mute-4" />{o.dueAt ? fmtDate(o.dueAt) : "Not scheduled"}</span>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-divider [&>div]:mb-0 [&>div]:rounded-none [&>div]:border-0 [&>div]:px-5">
          <ReviewBar kind="offer" item={o} />
        </div>
      </Card>
      {o.changeNote && o.review === "Changes requested" && <ChangeNote className="mb-5">{o.changeNote}</ChangeNote>}

      {missing.length > 0 && o.status !== "Archived" && (
        <div className="mb-3 rounded-xl border border-dashed border-[rgba(201,154,46,.45)] bg-[rgba(201,154,46,.06)] px-4 py-3 text-body text-warn-ink">
          Before this goes out: {missing.join(", ")}.
        </div>
      )}

      <div className="mb-8 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-6 py-6 sm:px-7">
          <Eyebrow className="mb-2.5">Positioning</Eyebrow>
          <p className="m-0 max-w-[52ch] text-title font-medium leading-[1.45] tracking-[-0.012em] text-ink text-pretty sm:text-title">
            {o.positioning || <span className="text-mute-4">No positioning written yet.</span>}
          </p>
        </div>
        <div className="grid md:grid-cols-3">
          <div className="border-b border-line px-6 py-5 sm:px-7 md:border-b-0 md:border-r">
            <Eyebrow className="mb-2">Goals</Eyebrow>
            <div className="mb-3">
              {o.goals.length ? <GoalChips ws={ws} o={o} size="md" /> : <span className="text-body text-warn-text">No goal set, so this offer is not comparable to anything.</span>}
            </div>
            {o.offerType && <div className="text-body text-mute-2">Offer type · <span className="font-medium text-ink-3">{o.offerType}</span></div>}
          </div>
          <div className="border-b border-line px-6 py-5 sm:px-7 md:border-b-0 md:border-r">
            <Eyebrow className="mb-2">Promise</Eyebrow>
            <p className="m-0 text-lead leading-[1.55] text-ink-3 text-pretty">{o.promise || <span className="text-mute-4">Not written yet.</span>}</p>
          </div>
          <div className="px-6 py-5 sm:px-7">
            <Eyebrow className="mb-2">Proof</Eyebrow>
            <p className="m-0 text-lead leading-[1.55] text-ink-3 text-pretty">{o.proof || <span className="text-mute-4">Not written yet.</span>}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-wash-2 px-6 py-4 sm:px-7">
          <Eyebrow>Calls to action</Eyebrow>
          {o.primaryCtaId && <CtaButton id={o.primaryCtaId} />}
          {o.secondaryCtaId && <CtaButton id={o.secondaryCtaId} />}
          {!o.primaryCtaId && !o.secondaryCtaId && <span className="text-body text-warn-text">None set — readers do not know what to do next.</span>}
        </div>
      </div>

      <FunnelBoard key={o.id} offer={o} />

      {nudgeAsset && (
        <div className="mb-4 flex animate-pop flex-wrap items-center gap-3.5 rounded-xl border border-accent bg-soft px-4 py-4">
          <span className="min-w-[240px] flex-1 text-body leading-[1.5] text-ink-2">
            {nudgeAsset.name} is now linked to this offer. The same asset, not a copy. <span className="text-mute-1">Need a version written specifically for this offer?</span>
          </span>
          <Btn variant="primary" onClick={() => open({ kind: "clone", srcId: nudgeAsset.id, brandId: nudgeAsset.brandId ?? o.brandId, name: `${nudgeAsset.name} — ${o.name}`, offerIds: [o.id] })}>Clone and adapt</Btn>
          <Btn variant="ghost" onClick={() => setNudge(null)}>No thanks</Btn>
        </div>
      )}

      <OfferAssets o={o} />

      <div id="discussion" className="mt-11 max-w-[720px] scroll-mt-24">
        <div className="mb-1 flex items-baseline justify-between gap-4">
          <h2 className="m-0 text-lead font-semibold">Discussion</h2>
          <span className="font-mono text-body text-mute-3">{openNotes ? `${openNotes} open note${openNotes === 1 ? "" : "s"}` : "Nothing open"}</span>
        </div>
        <p className="mb-3.5 mt-0 text-body text-mute-3">
          Decisions about this offer live here, not in a thread somebody has to go find. Type <span className="font-mono text-mute-1">#</span> to tag another offer, <span className="font-mono text-mute-1">@</span> to pull someone in.
        </p>
        {mentions.length > 0 && (
          <div className="mb-3.5 rounded-xl border border-line bg-[#F7F9F8] px-4 py-3.5">
            <div className="eyebrow mb-2.5 text-micro">{mentions.length} {mentions.length === 1 ? "mention" : "mentions"} elsewhere</div>
            <div className="flex flex-col gap-2">
              {mentions.map((m) => {
                const where = m.kind === "asset" ? ws.asset(m.itemId)?.name : ws.offer(m.itemId)?.name;
                const body = (
                  <>
                    <Avatar initials={ws.user(m.userId).initials} size={22} mono className="mt-px" />
                    <span className="min-w-0 flex-1">
                      <CommentText c={m} />
                      <span className="mt-1 block text-meta text-mute-4">{ws.first(m.userId)} · on {where ?? "somewhere else"} · {ws.ago(m.createdAt)}</span>
                    </span>
                  </>
                );
                return m.kind === "asset" ? (
                  <button key={m.id} type="button" onClick={() => openAsset(m.itemId, "discussion")} className="-m-1.5 flex w-[calc(100%+12px)] items-start gap-2.5 rounded-lg p-1.5 text-left hover:bg-chip">{body}</button>
                ) : (
                  <Link key={m.id} href={href.offer(m.itemId) + "#discussion"} className="-m-1.5 flex items-start gap-2.5 rounded-lg p-1.5 text-left hover:bg-chip">{body}</Link>
                );
              })}
            </div>
          </div>
        )}
        <Thread kind="offer" id={o.id} />
      </div>
    </Page>
  );
}

/** The things an offer needs before anyone should put it in front of a reader. */
function missingPieces(o: Offer) {
  const out: string[] = [];
  if (!o.positioning.trim()) out.push("write the positioning");
  if (!o.proof.trim() || /^(not written|draft|tbc|todo)/i.test(o.proof.trim())) out.push("find a proof point");
  if (!o.goals.length) out.push("pick a goal");
  if (!o.primaryCtaId) out.push("choose a call to action");
  return out;
}
