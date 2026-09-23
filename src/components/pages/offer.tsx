"use client";

import Link from "next/link";
import { useEffect } from "react";
import { hexA } from "@/lib/color";
import { OFFER_STATUS } from "@/lib/constants";
import { href } from "@/lib/routes";
import type { Offer } from "@/db/schema";
import { setArchived, setStatus } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { AssetCard, GoalChips } from "@/components/cards";
import { CommentText, Thread } from "@/components/discussion";
import { CtaButton, ReviewBar } from "@/components/drawer/asset-drawer";
import { ArchivedNote, Avatar, Btn, ChangeNote, Chip, Empty, Eyebrow, Page } from "@/components/ui";
import { NotHere, useVisit } from "./common";

export function OfferPage({ id }: { id: string }) {
  const { ws, open, openAsset, nudge, setNudge } = useApp();
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
  const assets = ws.linkedAssets(o.id);
  const canEdit = ws.can("edit");
  const mentions = ws.mentionsOf("offer", o.id);
  const openNotes = ws.openCount("offer", o.id);
  const nudgeAsset = nudge?.offerId === o.id ? ws.asset(nudge.assetId) : null;
  const missing = missingPieces(o);

  return (
    <Page>
      <div className="mb-1.5 flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-[7px]">
            <Chip color={ws.segColor(o.segment, o.brandId)}>{o.segment}</Chip>
            <Chip color={OFFER_STATUS[o.status]}>{o.status}</Chip>
            {sv && <Link href={href.service(sv.id)} className="rounded-[5px] border border-line bg-white px-2 py-0.5 text-[10.5px] font-semibold text-mute-1 hover:border-accent hover:text-accent">{sv.name} ↗</Link>}
            {!sv && <span className="rounded-[5px] border border-dashed border-line px-2 py-0.5 text-[10.5px] font-semibold text-mute-3">Standalone</span>}
            <span className="text-[11.5px] text-[#8B9791]">Updated {ws.ago(o.updatedAt)}</span>
          </div>
          <h1 className="m-0 mb-1.5 font-serif text-[32px] font-normal leading-[1.1] tracking-[-0.022em] sm:text-[38px]">{o.name}</h1>
          <p className="m-0 text-[14px] text-[#71807A]">{o.short}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:pt-[34px]">
          {canEdit && <Btn onClick={() => open({ kind: "offer", draft: o })}>Edit</Btn>}
          {canEdit && <Btn onClick={() => {
            const taken = new Set(ws.offersOf(o.brandId).filter((x) => x.serviceId === o.serviceId && !x.archived).map((x) => x.segment));
            const next = b?.segments.find((sg) => sg.name !== "All segments" && !taken.has(sg.name))?.name ?? o.segment;
            open({ kind: "offer", draft: { ...o, id: undefined, name: `${o.name} — ${next}`, segment: next, status: "Ideation", review: "None" } });
          }}>Adapt for another segment</Btn>}
          {ws.can("archive") && <Btn onClick={() => run(setArchived, "offer", o.id, !o.archived)}>{o.archived ? "Restore" : "Archive"}</Btn>}
          {ws.can("del") && <Btn variant="danger" onClick={() => open({ kind: "confirm", item: "offer", id: o.id, label: o.name, back: href.brand(o.brandId, "offers") })}>Delete</Btn>}
        </div>
      </div>

      <div className="mb-[26px] mt-[22px] flex flex-wrap items-center gap-1.5">
        <span className="eyebrow mr-1">Status</span>
        {!canEdit && <Chip color={OFFER_STATUS[o.status]} size="md" className="rounded-[7px] px-[11px] py-1">{o.status}</Chip>}
        {canEdit && (Object.keys(OFFER_STATUS) as Offer["status"][]).map((k) => {
          const on = o.status === k; const c = OFFER_STATUS[k];
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => !on && run(setStatus, "offer", o.id, k)} className="rounded-[7px] border px-[11px] py-1 text-[11.5px] font-medium transition"
              style={{ borderColor: on ? hexA(c, 0.4) : "var(--bos-border)", background: on ? hexA(c, 0.16) : "#FFF", color: on ? c : "#7C8A83" }}>{k}</button>
          );
        })}
      </div>

      {o.archived && <ArchivedNote className="mb-3.5">Archived. Its assets are still in the library — only this room is closed.</ArchivedNote>}
      <ReviewBar kind="offer" item={o} />
      {o.changeNote && o.review === "Changes requested" && <ChangeNote className="mb-5">{o.changeNote}</ChangeNote>}

      {missing.length > 0 && o.status !== "Archived" && (
        <div className="mb-3 rounded-xl border border-dashed border-[rgba(201,154,46,.45)] bg-[rgba(201,154,46,.06)] px-[18px] py-3 text-[12.5px] text-warn-ink">
          Before this goes out: {missing.join(", ")}.
        </div>
      )}

      <div className="mb-[34px] overflow-hidden rounded-2xl border border-line bg-white">
        <div className="border-b border-line px-6 py-[26px] sm:px-7">
          <Eyebrow className="mb-2.5">Positioning</Eyebrow>
          <p className="m-0 max-w-[44ch] font-serif text-[22px] leading-[1.4] tracking-[-0.012em] text-ink text-pretty sm:text-[24px]">
            {o.positioning || <span className="text-mute-4">No positioning written yet.</span>}
          </p>
        </div>
        <div className="grid md:grid-cols-3">
          <div className="border-b border-line px-6 py-[22px] sm:px-7 md:border-b-0 md:border-r">
            <Eyebrow className="mb-[9px]">Goals</Eyebrow>
            <div className="mb-3">
              {o.goals.length ? <GoalChips ws={ws} o={o} size="md" /> : <span className="text-[13px] text-warn">No goal set, so this offer is not comparable to anything.</span>}
            </div>
            {o.offerType && <div className="text-[12.5px] text-mute-2">Offer type · <span className="font-medium text-ink-3">{o.offerType}</span></div>}
          </div>
          <div className="border-b border-line px-6 py-[22px] sm:px-7 md:border-b-0 md:border-r">
            <Eyebrow className="mb-2">Promise</Eyebrow>
            <p className="m-0 text-[13.5px] leading-[1.55] text-ink-3 text-pretty">{o.promise || <span className="text-mute-4">Not written yet.</span>}</p>
          </div>
          <div className="px-6 py-[22px] sm:px-7">
            <Eyebrow className="mb-2">Proof</Eyebrow>
            <p className="m-0 text-[13.5px] leading-[1.55] text-ink-3 text-pretty">{o.proof || <span className="text-mute-4">Not written yet.</span>}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-wash-2 px-6 py-[18px] sm:px-7">
          <Eyebrow>Calls to action</Eyebrow>
          {o.primaryCtaId && <CtaButton id={o.primaryCtaId} />}
          {o.secondaryCtaId && <CtaButton id={o.secondaryCtaId} />}
          {!o.primaryCtaId && !o.secondaryCtaId && <span className="text-[12.5px] text-warn">None set — readers do not know what to do next.</span>}
          <span className="flex-1" />
          <span className="flex items-center gap-[7px] text-[12.5px] text-mute-2"><Avatar initials={ws.user(o.ownerId).initials} size={20} />{ws.user(o.ownerId).name}</span>
        </div>
      </div>

      {nudgeAsset && (
        <div className="mb-[18px] flex animate-pop flex-wrap items-center gap-3.5 rounded-xl border border-accent bg-soft px-[18px] py-[15px]">
          <span className="min-w-[240px] flex-1 text-[13px] leading-[1.5] text-ink-2">
            {nudgeAsset.name} is now linked to this offer. The same asset, not a copy. <span className="text-mute-1">Need a version written specifically for this offer?</span>
          </span>
          <Btn variant="primary" onClick={() => open({ kind: "clone", srcId: nudgeAsset.id, brandId: nudgeAsset.brandId ?? o.brandId, name: `${nudgeAsset.name} — ${o.name}`, offerIds: [o.id] })}>Clone and adapt</Btn>
          <Btn variant="ghost" onClick={() => setNudge(null)}>No thanks</Btn>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h2 className="m-0 mb-1 text-[13px] font-semibold">What supports this offer</h2>
          <p className="m-0 text-[12px] text-mute-2">{assets.length} {assets.length === 1 ? "asset supports" : "assets support"} this offer. Linking never duplicates — the asset stays where it lives.</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Btn variant="outline-accent" size="lg" onClick={() => open({ kind: "link", offerId: o.id })}>Link existing asset</Btn>
            <Btn variant="primary" size="lg" onClick={() => open({ kind: "asset", draft: { brandId: o.brandId, status: "Draft", offerIds: [o.id] }, step: 0 })}>+ New asset</Btn>
          </div>
        )}
      </div>
      {assets.length > 0 ? (
        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4">{assets.map((a) => <AssetCard key={a.id} a={a} />)}</div>
      ) : (
        <Empty title="This room is empty" body="Something in the library probably already fits. Look before you build.">
          {canEdit && <Btn variant="outline-accent" size="lg" onClick={() => open({ kind: "link", offerId: o.id })}>Link an existing asset</Btn>}
          {canEdit && <Btn variant="primary" size="lg" onClick={() => open({ kind: "asset", draft: { brandId: o.brandId, status: "Draft", offerIds: [o.id] }, step: 0 })}>Make something new</Btn>}
        </Empty>
      )}

      <div id="discussion" className="mt-11 max-w-[720px] scroll-mt-24">
        <div className="mb-1 flex items-baseline justify-between gap-4">
          <h2 className="m-0 text-[13px] font-semibold">Discussion</h2>
          <span className="font-mono text-[12px] text-mute-3">{openNotes ? `${openNotes} open note${openNotes === 1 ? "" : "s"}` : "Nothing open"}</span>
        </div>
        <p className="mb-3.5 mt-0 text-[12.5px] text-mute-3">
          Decisions about this offer live here, not in a thread somebody has to go find. Type <span className="font-mono text-mute-1">#</span> to tag another offer, <span className="font-mono text-mute-1">@</span> to pull someone in.
        </p>
        {mentions.length > 0 && (
          <div className="mb-3.5 rounded-xl border border-line bg-[#FBFCFC] px-4 py-3.5">
            <div className="eyebrow mb-2.5 text-[9.5px]">{mentions.length} {mentions.length === 1 ? "mention" : "mentions"} elsewhere</div>
            <div className="flex flex-col gap-2">
              {mentions.map((m) => {
                const where = m.kind === "asset" ? ws.asset(m.itemId)?.name : ws.offer(m.itemId)?.name;
                const body = (
                  <>
                    <Avatar initials={ws.user(m.userId).initials} size={22} mono className="mt-px" />
                    <span className="min-w-0 flex-1">
                      <CommentText c={m} />
                      <span className="mt-[3px] block text-[11px] text-mute-4">{ws.first(m.userId)} · on {where ?? "somewhere else"} · {ws.ago(m.createdAt)}</span>
                    </span>
                  </>
                );
                return m.kind === "asset" ? (
                  <button key={m.id} type="button" onClick={() => openAsset(m.itemId, "discussion")} className="-m-1.5 flex w-[calc(100%+12px)] items-start gap-2.5 rounded-[9px] p-1.5 text-left hover:bg-chip">{body}</button>
                ) : (
                  <Link key={m.id} href={href.offer(m.itemId) + "#discussion"} className="-m-1.5 flex items-start gap-2.5 rounded-[9px] p-1.5 text-left hover:bg-chip">{body}</Link>
                );
              })}
            </div>
          </div>
        )}
        <Thread kind="offer" id={o.id} />
      </div>
      {b && <div className="mt-10 text-[12px] text-mute-4">In <Link href={href.brand(b.id)} className="hover:text-ink">{b.name}</Link>{sv ? <> · <Link href={href.service(sv.id)} className="hover:text-ink">{sv.name}</Link></> : null}</div>}
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
