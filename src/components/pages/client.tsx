"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { hexA, readable } from "@/lib/color";
import { href } from "@/lib/routes";
import { archivedOnly, live, plural } from "@/lib/ws";
import { setArchived } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { ArchExpander, ArchivedNote, Avatar, Btn, Card, Eyebrow, H2, Mark, Page } from "@/components/ui";
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
    { label: "Brands", value: live(bs).length },
    { label: "Offers", value: live(os).length },
    { label: "Assets", value: live(as).length },
    { label: "Client since", value: c.since },
  ];

  return (
    <Page>
      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-1">
          <Eyebrow className="mb-[9px] tracking-[0.13em]">Property</Eyebrow>
          <h1 className="m-0 mb-2 font-serif text-[32px] font-normal leading-[1.1] tracking-[-0.02em] sm:text-[38px]">{c.name}</h1>
          <p className="m-0 text-[15px] text-[#566560]">{c.kind}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:pt-[26px]">
          {ws.can("edit") && <Btn onClick={() => open({ kind: "client", draft: c })}>Edit</Btn>}
          {ws.can("archive") && <Btn onClick={() => run(setArchived, "client", c.id, !c.archived)}>{c.archived ? "Restore client" : "Archive client"}</Btn>}
          {ws.can("del") && <Btn variant="danger" onClick={() => open({ kind: "confirm", item: "client", id: c.id, label: c.name, back: "/" })}>Delete</Btn>}
        </div>
      </div>
      {c.archived && <ArchivedNote className="mt-[22px]">Archived. Hidden from the street and from search unless you go looking.</ArchivedNote>}
      {c.note && <p className="m-0 mt-[22px] max-w-[60ch] text-[15px] leading-[1.6] text-ink-3 text-pretty">{c.note}</p>}

      <Card className="mt-7 flex flex-wrap gap-x-9 gap-y-4 px-6 py-5">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="font-mono text-[23px] font-medium tabular-nums tracking-[-0.01em]">{s.value}</div>
            <div className="mt-0.5 text-[15px] text-mute-2">{s.label}</div>
          </div>
        ))}
        <div className="hidden flex-1 sm:block" />
        <div>
          <div className="text-[15px] font-semibold">{ws.user(c.contactId).name}</div>
          <div className="mt-0.5 text-[15px] text-mute-2">Primary contact</div>
        </div>
      </Card>

      <div className="mt-10">
        <H2 right={ws.can("edit") && <button type="button" onClick={() => open({ kind: "brand", draft: { clientId: c.id } })} className="text-[14.5px] text-mute-2 hover:text-ink">+ Add brand</button>}>Buildings on this property</H2>
        <div className="grid gap-4 md:grid-cols-2">
          {tops.map((b) => {
            const subs = live(ws.subBrands(b.id));
            return (
              <Card key={b.id} className="overflow-hidden">
                <Link href={href.brand(b.id)} className="flex w-full items-center gap-[15px] p-[22px] text-left" style={{ background: hexA(b.primary, 0.1) }}>
                  <Mark mark={b.mark} color={b.primary} size={48} radius={11} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[18px] font-semibold tracking-[-0.015em]">{b.name}</span>
                    <span className="mt-0.5 block text-[15px] text-mute-1">{b.tagline}</span>
                  </span>
                  <span className="flex-none text-[15px] text-mute-2">→</span>
                </Link>
                <div className="flex gap-3.5 border-t border-line px-[22px] py-3 text-[14px] text-[#566560]">
                  <span>{plural(live(ws.offersOf(b.id)).length, "offer")}</span>
                  <span>{plural(live(ws.assetsOf(b.id)).length, "asset")}</span>
                  {subs.length > 0 && <span className="text-mute-4">{plural(subs.length, "sub-brand")}</span>}
                </div>
                {subs.map((sb) => (
                  <Link key={sb.id} href={href.brand(sb.id)} className="flex w-full items-center gap-2.5 border-t border-divider px-[22px] py-[11px] text-left hover:bg-wash">
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
          <div className="rounded-[14px] border border-dashed border-line-strong p-10 text-center">
            <div className="mb-1.5 text-[15px] font-semibold">No buildings yet</div>
            <div className="mb-4 text-[15px] text-mute-2">A brand is where offers and assets live.</div>
            {ws.can("edit") && <Btn variant="primary" size="lg" onClick={() => open({ kind: "brand", draft: { clientId: c.id } })}>Add the first brand</Btn>}
          </div>
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
                <button key={a.id} type="button" onClick={() => openAsset(a.id)} className="flex items-start gap-[11px] rounded-xl border border-line bg-white p-3.5 text-left hover:border-mute-2">
                  <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[7px] text-[12px] font-bold" style={{ background: hexA(col, 0.1), color: readable(col) }}>{ws.codeOf(a)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-[1.35]">{a.name}</span>
                    <span className="mt-[3px] block text-[14.5px] text-mute-2">{ws.brand(a.brandId)?.name} · {ws.ago(a.updatedAt)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {!recent.length && <div className="text-[15px] text-mute-3">Nothing touched here yet.</div>}
        </div>
        <div>
          <H2>Activity</H2>
          <Card className="px-[18px] py-1">
            {acts.map((a) => (
              <button key={a.id} type="button" onClick={() => (a.type === "asset" ? openAsset(a.itemId) : a.type === "offer" ? router.push(href.offer(a.itemId)) : a.type === "brand" ? router.push(href.brand(a.itemId)) : undefined)}
                className="flex w-full items-center gap-2.5 border-t border-divider py-2.5 text-left first:border-t-0">
                <Avatar initials={ws.user(a.userId).initials} size={20} />
                <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink-3">{ws.first(a.userId)} {a.action} {a.label}{a.field ? ` — ${a.field}` : ""}</span>
                <span className="flex-none text-[13.5px] text-[#64716B]">{ws.ago(a.createdAt)}</span>
              </button>
            ))}
            {!acts.length && <div className="py-5 text-center text-[15px] text-mute-4">Quiet so far.</div>}
          </Card>
        </div>
      </div>
    </Page>
  );
}
