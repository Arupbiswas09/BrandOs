"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, Clock, FolderOpen, Layers, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { href } from "@/lib/routes";
import { live, plural } from "@/lib/ws";
import { setArchived } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { OfferCard } from "@/components/cards";
import { ArchivedNote, Avatar, Btn, Chip, Page, cx } from "@/components/ui";
import { EmptyArt, EntityHeader, FOCUS, IconTile, MetaItem } from "@/components/polish";
import { SpotArt } from "@/components/art";
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
      <EntityHeader
        eyebrow={<>Service{b ? <> · <Link href={href.brand(b.id, "services")} className="hover:text-ink hover:underline">{b.name}</Link></> : null}</>}
        lead={<IconTile icon={Layers} color={b?.primary} size={48} className="rounded-[13px]" />}
        title={v.name}
        sub={v.short}
        meta={
          <>
            {v.archived && <span className="rounded-md bg-chip px-2 py-[2px] text-[13px] font-semibold text-mute-2">Archived</span>}
            <MetaItem icon={Megaphone}>{plural(liveOffers.length, "offer")}</MetaItem>
            <MetaItem icon={FolderOpen}>{plural(live(ws.assetsOfService(v.id)).length, "asset")} across them</MetaItem>
            <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
            <MetaItem icon={Clock}>Updated {ws.ago(v.updatedAt)}</MetaItem>
            <MetaItem><Avatar initials={ws.user(v.ownerId).initials} size={20} />{ws.user(v.ownerId).name}</MetaItem>
          </>
        }
        actions={canEdit && (
          <>
            <Btn onClick={() => open({ kind: "service", draft: v })}><Pencil aria-hidden size={16} />Edit</Btn>
            <Btn variant="primary" onClick={() => newOffer()}><Plus aria-hidden size={16} />New offer</Btn>
          </>
        )}
      />
      {v.archived && <ArchivedNote className="mb-5">Archived. Its offers still exist and are reachable from the offers tab.</ArchivedNote>}
      {v.description && <p className="m-0 mb-9 max-w-[64ch] text-[16px] leading-[1.6] text-ink-3 text-pretty">{v.description}</p>}

      {!groups.length && !orphans.length && (
        <EmptyArt art={<SpotArt kind="offer" />} title="No offers for this service yet" body="An offer is this service argued at one segment. Write the first one and the gaps start to show.">
          {canEdit && <Btn variant="primary" size="lg" onClick={() => newOffer()}>Write the first offer</Btn>}
        </EmptyArt>
      )}

      {groups.map((g) => (
        <div key={g.name} className="mb-[34px]">
          <div className="mb-3.5 flex items-center gap-2.5 border-b border-divider pb-2.5">
            <Chip color={g.color} size="md">{g.name}</Chip>
            <span className="text-[14.5px] text-mute-3">{g.list.length ? plural(g.list.length, "offer") : "Nothing written for this segment"}</span>
          </div>
          <div className="grid gap-3.5 md:grid-cols-2">
            {g.list.map((o) => <OfferCard key={o.id} o={o} variant="service" />)}
            {!g.list.length && (
              <button type="button" disabled={!canEdit} onClick={() => newOffer(g.name)} className={cx("group flex items-start gap-3.5 rounded-[13px] border border-dashed border-line-strong bg-white/60 px-5 py-5 text-left transition hover:border-accent hover:bg-white disabled:cursor-default disabled:hover:border-line-strong disabled:hover:bg-white/60", FOCUS)}>
                <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] border border-dashed border-line-strong text-mute-3 transition group-enabled:group-hover:border-accent group-enabled:group-hover:text-accent"><Plus size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="mb-0.5 block text-[16px] font-semibold text-mute-1">No {g.name} version yet</span>
                  <span className="block text-[15px] text-mute-3">{canEdit ? "Write the positioning for this segment →" : "Nobody has written one yet."}</span>
                </span>
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
          {plural(so.filter((o) => o.archived).length, "archived offer")} hidden. Find {so.filter((o) => o.archived).length === 1 ? "it" : "them"} under <Link className="underline hover:text-ink" href={href.brand(v.brandId, "offers")}>Offers</Link>.
        </div>
      )}

      {(ws.can("archive") || ws.can("del")) && (
        <div className="mt-11 flex flex-wrap items-center gap-2 border-t border-line pt-5">
          {ws.can("archive") && <Btn onClick={() => run(setArchived, "service", v.id, !v.archived)}>{v.archived ? <ArchiveRestore aria-hidden size={16} /> : <Archive aria-hidden size={16} />}{v.archived ? "Restore service" : "Archive service"}</Btn>}
          {ws.can("del") && <Btn variant="danger" onClick={() => open({ kind: "confirm", item: "service", id: v.id, label: v.name, back: href.brand(v.brandId, "services") })}><Trash2 aria-hidden size={16} />Delete service</Btn>}
          <span className="flex-1" />
          <span className="text-[14px] text-mute-3">Archiving hides the service. Its offers stay where they are.</span>
        </div>
      )}
    </Page>
  );
}
