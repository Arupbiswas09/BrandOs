"use client";

import { href } from "@/lib/routes";
import { live, plural } from "@/lib/ws";
import { setArchived } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { OfferCard } from "@/components/cards";
import { ArchivedNote, Btn, Chip, Eyebrow, Page } from "@/components/ui";
import { NotHere, useVisit } from "./common";

export function ServicePage({ id }: { id: string }) {
  const { ws, open } = useApp();
  const [run] = useAction();
  const v = ws.service(id);
  useVisit("service", id, !!v);
  if (!v) return <NotHere what="service" />;
  const b = ws.brand(v.brandId);
  const so = ws.offersOfService(v.id);
  const liveOffers = live(so);
  const canEdit = ws.canChange(v);
  const groups = (b?.segments ?? [])
    .map((sg) => ({ ...sg, list: liveOffers.filter((o) => o.segment === sg.name) }))
    .filter((g) => g.name !== "All segments" || g.list.length);
  const orphans = liveOffers.filter((o) => !(b?.segments ?? []).some((s) => s.name === o.segment));
  const newOffer = (segment = "All segments") => open({ kind: "offer", draft: { brandId: v.brandId, serviceId: v.id, segment, status: "Ideation" } });

  return (
    <Page>
      <div className="head-band -mt-8 mb-8 pb-7 pt-8 sm:-mt-10 sm:pt-10 flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-1">
          <Eyebrow className="mb-[9px] tracking-[0.13em]">Service · {b?.name}</Eyebrow>
          <h1 className="m-0 mb-1.5 text-[26px] font-semibold leading-[1.1] tracking-[-0.022em] sm:text-[28px]">{v.name}</h1>
          <p className="m-0 text-[15px] text-[#475569]">{v.short}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:pt-[34px]">
          {canEdit && <Btn onClick={() => open({ kind: "service", draft: v })}>Edit</Btn>}
          {canEdit && <Btn variant="primary" onClick={() => newOffer()}>+ New offer</Btn>}
        </div>
      </div>
      {v.archived && <ArchivedNote className="mb-5">Archived. Its offers still exist and are reachable from the offers tab.</ArchivedNote>}
      {v.description && <p className="m-0 max-w-[62ch] text-[16px] leading-[1.6] text-ink-3 text-pretty">{v.description}</p>}
      <div className="mb-[38px] mt-6 flex flex-wrap gap-x-6 gap-y-1 text-[15px] text-[#475569]">
        <span>{plural(liveOffers.length, "offer")}</span>
        <span>{plural(live(ws.assetsOfService(v.id)).length, "asset")} across them</span>
        <span className="text-mute-5">Updated {ws.ago(v.updatedAt)} by {ws.user(v.ownerId).name}</span>
      </div>

      {groups.map((g) => (
        <div key={g.name} className="mb-[34px]">
          <div className="mb-3.5 flex items-center gap-2.5">
            <Chip color={g.color} size="md">{g.name}</Chip>
            <span className="text-[14.5px] text-mute-3">{g.list.length ? plural(g.list.length, "offer") : "Nothing written for this segment"}</span>
          </div>
          <div className="grid gap-3.5 md:grid-cols-2">
            {g.list.map((o) => <OfferCard key={o.id} o={o} variant="service" />)}
            {!g.list.length && (
              <button type="button" disabled={!canEdit} onClick={() => newOffer(g.name)} className="rounded-[13px] border border-dashed border-line-strong px-5 py-6 text-left hover:border-accent disabled:cursor-default disabled:hover:border-line-strong">
                <span className="mb-1 block text-[16px] font-semibold text-mute-1">No {g.name} version yet</span>
                <span className="block text-[15px] text-mute-3">{canEdit ? "Write the positioning for this segment →" : "Nobody has written one yet."}</span>
              </button>
            )}
          </div>
        </div>
      ))}
      {orphans.length > 0 && (
        <div className="mb-[34px]">
          <div className="mb-3.5 text-[14.5px] text-mute-3">Offers whose segment is no longer in the Brand Kit</div>
          <div className="grid gap-3.5 md:grid-cols-2">{orphans.map((o) => <OfferCard key={o.id} o={o} variant="service" />)}</div>
        </div>
      )}
      {so.some((o) => o.archived) && (
        <div className="mb-8 text-[14.5px] text-mute-3">
          {plural(so.filter((o) => o.archived).length, "archived offer")} hidden. Find {so.filter((o) => o.archived).length === 1 ? "it" : "them"} under <a className="underline hover:text-ink" href={href.brand(v.brandId, "offers")}>Offers</a>.
        </div>
      )}

      <div className="flex gap-2 border-t border-line pt-5">
        {ws.can("archive") && <Btn onClick={() => run(setArchived, "service", v.id, !v.archived)}>{v.archived ? "Restore service" : "Archive service"}</Btn>}
        {ws.can("del") && <Btn variant="danger" onClick={() => open({ kind: "confirm", item: "service", id: v.id, label: v.name, back: href.brand(v.brandId, "services") })}>Delete service</Btn>}
      </div>
    </Page>
  );
}
