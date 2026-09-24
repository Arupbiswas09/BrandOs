"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Building2, CalendarDays, ChevronRight, FolderOpen, GitBranch, Megaphone, Palette, Pencil, Trash2 } from "lucide-react";
import { hexA, readable } from "@/lib/color";
import { href } from "@/lib/routes";
import { archivedOnly, live, plural } from "@/lib/ws";
import { setArchived } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { ArchExpander, ArchivedNote, Avatar, Btn, Card, H2, Mark, Page, cx } from "@/components/ui";
import { ActionRule, EmptyArt, EntityHeader, FOCUS, IconTile, LIFT, MetaItem } from "@/components/polish";
import { SpotArt } from "@/components/art";
import { NotHere, useVisit } from "./common";

export function ClientPage({ id }: { id: string }) {
  const { ws, open, openAsset } = useApp();
  const router = useRouter();
  const [run] = useAction();
  const c = ws.client(id);
  useVisit("client", id, !!c);
  if (!c) return <NotHere what="client" />;

  const bs = ws.d.brands.filter((b) => b.clientId === c.id);
  const ids = new Set(bs.map((b) => b.id));
  const os = ws.d.offers.filter((o) => ids.has(o.brandId));
  const as = ws.d.assets.filter((a) => a.brandId && ids.has(a.brandId));
  const tops = live(bs).filter((b) => !b.parentId);
  const recent = [...live(as)].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 4);
  const acts = ws.d.activity.filter((a) => {
    if (a.type === "asset") return as.some((x) => x.id === a.itemId);
    if (a.type === "offer") return os.some((x) => x.id === a.itemId);
    if (a.type === "brand") return ids.has(a.itemId);
    if (a.type === "client") return a.itemId === c.id;
    return false;
  }).slice(0, 6);

  const stats = [
    { label: "Brands", value: live(bs).length, icon: Palette },
    { label: "Offers", value: live(os).length, icon: Megaphone },
    { label: "Assets", value: live(as).length, icon: FolderOpen },
  ];
  const contact = ws.user(c.contactId);

  return (
    <Page>
      <EntityHeader
        eyebrow="Client"
        lead={<IconTile icon={Building2} size={48} className="rounded-[13px]" />}
        title={c.name}
        sub={c.kind}
        meta={
          <>
            {c.archived && <span className="rounded-md bg-chip px-2 py-[2px] text-[13px] font-semibold text-mute-2">Archived</span>}
            <MetaItem icon={CalendarDays}>Client since {c.since}</MetaItem>
            <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
            <MetaItem><Avatar initials={contact.initials} size={20} />{contact.name}<span className="text-mute-3">· primary contact</span></MetaItem>
          </>
        }
        actions={(ws.can("structure") || ws.can("archive") || ws.can("del")) && (
          <>
            {ws.can("archive") && <Btn onClick={() => run(setArchived, "client", c.id, !c.archived)}>{c.archived ? <ArchiveRestore aria-hidden size={16} /> : <Archive aria-hidden size={16} />}{c.archived ? "Restore client" : "Archive client"}</Btn>}
            {ws.can("structure") && <Btn variant="primary" onClick={() => open({ kind: "client", draft: c })}><Pencil aria-hidden size={16} />Edit</Btn>}
            {ws.can("del") && (
              <>
                {(ws.can("structure") || ws.can("archive")) && <ActionRule />}
                <Btn variant="danger" onClick={() => open({ kind: "confirm", item: "client", id: c.id, label: c.name, back: "/" })}><Trash2 aria-hidden size={16} />Delete</Btn>
              </>
            )}
          </>
        )}
      />
      {c.archived && <ArchivedNote className="mb-5">Archived. Hidden from the street and from search unless you go looking.</ArchivedNote>}
      {c.note && <p className="m-0 mb-7 max-w-[64ch] text-[15px] leading-[1.6] text-ink-3 text-pretty">{c.note}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((st) => (
          <Card key={st.label} className="flex items-center gap-3.5 p-4">
            <IconTile icon={st.icon} size={40} />
            <span className="min-w-0">
              <span className="block text-[26px] font-semibold leading-[1.1] tabular-nums tracking-[-0.02em] text-ink">{st.value}</span>
              <span className="mt-0.5 block text-[13.5px] font-medium text-mute-3">{st.label}</span>
            </span>
          </Card>
        ))}
      </div>

      <div className="mt-10">
        <H2 right={ws.can("structure") && <button type="button" onClick={() => open({ kind: "brand", draft: { clientId: c.id } })} className="text-[14.5px] text-mute-2 hover:text-ink">+ Add brand</button>}>Brands</H2>
        <div className="grid gap-4 md:grid-cols-2">
          {tops.map((b) => {
            const subs = live(ws.subBrands(b.id));
            return (
              <Card key={b.id} className="overflow-hidden transition duration-200 hover:shadow-[0_10px_24px_-12px_rgba(15,23,42,.18)]">
                <span aria-hidden className="block h-[3px]" style={{ background: `linear-gradient(90deg, ${b.primary}, ${b.secondary})` }} />
                <Link href={href.brand(b.id)} className="group flex w-full items-center gap-[15px] p-5 text-left focus-visible:outline-offset-[-2px]" style={{ background: `linear-gradient(100deg, ${hexA(b.primary, 0.1)}, ${hexA(b.secondary, 0.05)} 60%, rgba(255,255,255,0))` }}>
                  <Mark mark={b.mark} color={b.primary} size={48} radius={12} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[18px] font-semibold tracking-[-0.015em]">{b.name}</span>
                    {b.tagline && <span className="mt-0.5 block text-[15px] text-mute-1">{b.tagline}</span>}
                  </span>
                  <ChevronRight aria-hidden size={18} className="flex-none text-mute-3 transition group-hover:translate-x-0.5 group-hover:text-ink" />
                </Link>
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-5 py-3 text-[14px] text-mute-2">
                  <MetaItem icon={Megaphone}>{plural(live(ws.offersOf(b.id)).length, "offer")}</MetaItem>
                  <MetaItem icon={FolderOpen}>{plural(live(ws.assetsOf(b.id)).length, "asset")}</MetaItem>
                  {subs.length > 0 && <MetaItem icon={GitBranch}>{plural(subs.length, "sub-brand")}</MetaItem>}
                </div>
                {subs.map((sb) => (
                  <Link key={sb.id} href={href.brand(sb.id)} className="flex w-full items-center gap-2.5 border-t border-divider px-5 py-[11px] text-left hover:bg-wash focus-visible:outline-offset-[-2px]">
                    <Mark mark={sb.mark} color={sb.primary} size={22} radius={6} />
                    <span className="flex-1 text-[15px] font-medium">{sb.name}</span>
                    <span className="text-[13px] text-mute-4">Sub-brand</span>
                  </Link>
                ))}
              </Card>
            );
          })}
        </div>
        {!tops.length && (
          <EmptyArt art={<SpotArt kind="kit" />} title="No brands yet" body="A brand is where offers and assets live.">
            {ws.can("structure") && <Btn variant="primary" size="lg" onClick={() => open({ kind: "brand", draft: { clientId: c.id } })}>Add the first brand</Btn>}
          </EmptyArt>
        )}
        <ArchExpander items={archivedOnly(bs)} noun="brand" onOpen={(b) => router.push(href.brand(b.id))} />
      </div>

      <div className="mt-10 grid items-start gap-6 md:grid-cols-[1.3fr_1fr]">
        <div>
          <H2>Recently touched</H2>
          <div className="grid gap-3 sm:grid-cols-2">
            {recent.map((a) => {
              const col = ws.colorOf(a);
              return (
                <button key={a.id} type="button" onClick={() => openAsset(a.id)} className={cx("flex items-start gap-[11px] rounded-xl border border-line bg-white p-3.5 text-left", LIFT, FOCUS)}>
                  <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] font-mono text-[12px] font-bold tracking-[0.04em]" style={{ background: hexA(col, 0.12), color: readable(col, 0.12) }}>{ws.codeOf(a)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-[1.35]">{a.name}</span>
                    <span className="mt-[3px] block text-[14.5px] text-mute-2">{ws.brand(a.brandId)?.name} · {ws.ago(a.updatedAt)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {!recent.length && <EmptyArt compact art={<SpotArt kind="folder" />} title="Nothing touched here yet" body="Assets show up here as people work on them." />}
        </div>
        <div>
          <H2>Activity</H2>
          <Card className="px-[18px] py-1">
            {acts.map((a) => (
              <button key={a.id} type="button" onClick={() => (a.type === "asset" ? openAsset(a.itemId) : a.type === "offer" ? router.push(href.offer(a.itemId)) : a.type === "brand" ? router.push(href.brand(a.itemId)) : undefined)}
                className="-mx-2 flex w-[calc(100%+16px)] items-center gap-2.5 rounded-[8px] border-t border-divider px-2 py-2.5 text-left first:border-t-0 hover:bg-wash">
                <Avatar initials={ws.user(a.userId).initials} size={20} />
                <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink-3">{ws.first(a.userId)} {a.action} {a.label}{a.field ? ` — ${a.field}` : ""}</span>
                <span className="flex-none text-[13.5px] text-[#526077]">{ws.ago(a.createdAt)}</span>
              </button>
            ))}
            {!acts.length && <div className="flex flex-col items-center py-5 text-center"><SpotArt kind="inbox" className="mb-2" /><span className="text-[15px] text-mute-3">Quiet so far.</span></div>}
          </Card>
        </div>
      </div>
    </Page>
  );
}
