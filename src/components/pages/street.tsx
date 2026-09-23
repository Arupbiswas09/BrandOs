"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useDayPart } from "@/lib/stored";
import { hexA } from "@/lib/color";
import { NEUTRAL } from "@/lib/constants";
import { href } from "@/lib/routes";
import { archivedOnly, live, plural } from "@/lib/ws";
import { useApp } from "@/components/app/provider";
import { ArchExpander, Avatar, Card, Eyebrow, H2, Page } from "@/components/ui";

export function Street() {
  const { ws, openAsset, open } = useApp();
  const router = useRouter();
  const me = ws.me;
  const greeting = `${useDayPart()}, ${me.name.split(" ")[0]}.`;
  const queue = useMemo(() => ws.queue(), [ws]);
  const mine = queue.filter((q) => q.who === me.id);
  const others = queue.length - mine.length;
  const otherLabel = others ? `${others} with other people` : "Nothing with anyone else";

  const clients = live(ws.d.clients);
  const brands = live(ws.d.brands);
  const ideation = ws.d.offers.filter((o) => o.status === "Ideation" && !o.archived);
  const nRev = queue.length;
  const sub = `${plural(clients.length, "property", "properties")}, ${plural(brands.length, "building")}. ` +
    (nRev + ideation.length === 0 ? "Nothing is moving through review." : `${plural(nRev, "thing")} mid-review, ${ideation.length} still just an idea.`);

  const already = new Set(mine.map((q) => q.kind + q.id));
  const attention = [
    ...mine.map((q) => ({ key: q.kind + q.id, label: q.name, sub: q.sub, dot: q.act === "review" ? "#C99A2E" : "#C2410C", badge: q.verb, badgeFg: q.act === "review" ? "#8A6A12" : "#A63A12", go: () => (q.kind === "asset" ? openAsset(q.id) : router.push(href.offer(q.id))) })),
    ...ideation.filter((o) => !already.has("offer" + o.id)).slice(0, 3).map((o) => {
      const n = ws.linkedAssetIds(o.id).length;
      return { key: "i" + o.id, label: o.name, sub: `${ws.brand(o.brandId)?.name} · ${plural(n, "asset")}`, dot: "#7C6AC4", badge: "Ideation", badgeFg: "#5C4CA8", go: () => router.push(href.offer(o.id)) };
    }),
  ];

  const continueItems = ws.d.recents.map((r) => {
    if (r.kind === "brand") { const b = ws.brand(r.itemId); return b && !b.archived && { key: "b" + b.id, title: b.name, sub: `Brand · ${ws.client(b.clientId)?.name}`, code: b.mark, color: b.primary, go: () => router.push(href.brand(b.id)) }; }
    if (r.kind === "offer") { const o = ws.offer(r.itemId); const b = ws.brand(o?.brandId); return o && !o.archived && { key: "o" + o.id, title: o.name, sub: `Offer · ${b?.name}`, code: "OF", color: b?.primary ?? NEUTRAL, go: () => router.push(href.offer(o.id)) }; }
    if (r.kind === "service") { const v = ws.service(r.itemId); const b = ws.brand(v?.brandId); return v && !v.archived && { key: "s" + v.id, title: v.name, sub: `Service · ${b?.name}`, code: "SVC", color: b?.primary ?? NEUTRAL, go: () => router.push(href.service(v.id)) }; }
    if (r.kind === "client") { const c = ws.client(r.itemId); return c && !c.archived && { key: "c" + c.id, title: c.name, sub: `Client · ${c.kind}`, code: "CL", color: NEUTRAL, go: () => router.push(href.client(c.id)) }; }
    const a = ws.asset(r.itemId); const b = ws.brand(a?.brandId);
    return a && !a.archived && { key: "a" + a.id, title: a.name, sub: `Asset · ${b?.name ?? "Global Library"}`, code: ws.codeOf(a), color: b?.primary ?? "#6C7B74", go: () => openAsset(a.id) };
  }).filter(Boolean).slice(0, 4) as { key: string; title: string; sub: string; code: string; color: string; go: () => void }[];

  const activity = ws.d.activity.slice(0, 7);

  return (
    <Page>
      <div className="animate-rise">
        <Eyebrow className="mb-[9px] tracking-[0.13em]">The Street</Eyebrow>
        <h1 className="m-0 mb-1.5 font-serif text-[34px] font-normal leading-[1.1] tracking-[-0.02em] sm:text-[40px]">{greeting}</h1>
        <p className="m-0 max-w-[52ch] text-[14.5px] text-[#71807A] text-pretty">{sub}</p>
      </div>

      <div className="mt-[38px] grid items-start gap-5 md:grid-cols-2">
        <Card className="px-[22px] pb-2 pt-5">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="m-0 text-[13px] font-semibold tracking-[-0.005em]">Waiting on you</h2>
            <span className="text-[12px] text-mute-3">{mine.length ? `${mine.length} on you` : "clear"}</span>
          </div>
          <p className="mb-3 mt-0 text-[12px] text-mute-3">{mine.length ? `Assigned to you by name. ${otherLabel}.` : `Nothing is assigned to you. ${otherLabel}.`}</p>
          {attention.map((a) => (
            <button key={a.key} type="button" onClick={a.go} className="-mx-2 flex w-[calc(100%+16px)] items-center gap-[11px] rounded-[7px] border-t border-divider px-2 py-2.5 text-left hover:bg-wash">
              <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: a.dot }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{a.label}</span>
                <span className="mt-px block text-[12.5px] text-mute-2">{a.sub}</span>
              </span>
              <span className="flex-none rounded-[5px] px-[7px] py-[3px] text-[10.5px] font-semibold" style={{ background: hexA(a.dot, 0.15), color: a.badgeFg }}>{a.badge}</span>
            </button>
          ))}
          {!attention.length && <div className="pb-[26px] pt-[22px] text-center text-[13px] text-mute-4">Nothing waiting on you.</div>}
          <div className="h-3" />
        </Card>
        <Card className="px-[22px] pb-2 pt-5">
          <h2 className="m-0 mb-1 text-[13px] font-semibold tracking-[-0.005em]">Continue where you left off</h2>
          <p className="mb-3 mt-0 text-[12px] text-mute-3">The last places you were standing.</p>
          {continueItems.map((r) => (
            <button key={r.key} type="button" onClick={r.go} className="-mx-2 flex w-[calc(100%+16px)] items-center gap-[11px] rounded-[7px] border-t border-divider px-2 py-2.5 text-left hover:bg-wash">
              <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-md font-mono text-[8.5px] font-bold tracking-[0.06em]" style={{ background: hexA(r.color, 0.12), color: r.color }}>{r.code}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{r.title}</span>
                <span className="mt-px block truncate text-[12.5px] text-mute-2">{r.sub}</span>
              </span>
              <span className="flex-none text-[11.5px] text-[#8B9791]">→</span>
            </button>
          ))}
          {!continueItems.length && <div className="pb-[26px] pt-[22px] text-center text-[13px] text-mute-4">Open a brand and it will show up here.</div>}
          <div className="h-3" />
        </Card>
      </div>

      <div className="mt-11">
        <H2 right={ws.can("edit") && <button type="button" onClick={() => open({ kind: "client" })} className="py-0.5 text-[12px] text-mute-2 hover:text-ink">+ Add client</button>}>Clients</H2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => {
            const bs = brands.filter((b) => b.clientId === c.id);
            const ids = new Set(bs.map((b) => b.id));
            const os = live(ws.d.offers).filter((o) => ids.has(o.brandId)).length;
            const as = live(ws.d.assets).filter((a) => a.brandId && ids.has(a.brandId)).length;
            return (
              <Link key={c.id} href={href.client(c.id)} className="flex flex-col gap-3.5 rounded-[14px] border border-line bg-white p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(16,22,20,.07)]">
                <span className="flex gap-[5px]">
                  {bs.map((b) => (
                    <span key={b.id} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[9.5px] font-bold text-white" style={{ background: b.primary }}>{b.mark}</span>
                  ))}
                  {!bs.length && <span className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-dashed border-line-strong text-[11px] text-mute-4">+</span>}
                </span>
                <span className="block">
                  <span className="block text-[15px] font-semibold tracking-[-0.01em]">{c.name}</span>
                  <span className="mt-[3px] block text-[12.5px] text-mute-2">{c.kind}</span>
                </span>
                <span className="flex gap-4 whitespace-nowrap border-t border-divider pt-3 text-[11.5px] text-[#71807A]">
                  <span>{plural(bs.length, "brand")}</span><span>{plural(os, "offer")}</span><span>{plural(as, "asset")}</span>
                </span>
              </Link>
            );
          })}
        </div>
        <ArchExpander items={archivedOnly(ws.d.clients)} noun="client" onOpen={(c) => router.push(href.client(c.id))} />
        {!clients.length && (
          <div className="rounded-[14px] border border-dashed border-line-strong p-10 text-center text-[13px] text-mute-2">
            {ws.can("edit") ? "No clients yet. Add the first property on the street." : "You have not been given any clients yet. Ask an admin."}
          </div>
        )}
      </div>

      <div className="mt-11 grid items-start gap-5 md:grid-cols-[1.35fr_1fr]">
        <div>
          <H2>Recent activity</H2>
          <Card className="px-5 py-1.5">
            {activity.map((a) => {
              const go = () => {
                if (a.type === "asset") openAsset(a.itemId);
                else if (a.type === "offer") router.push(href.offer(a.itemId));
                else if (a.type === "brand") router.push(href.brand(a.itemId));
                else if (a.type === "service") router.push(href.service(a.itemId));
                else if (a.type === "client") router.push(href.client(a.itemId));
                else if (a.type === "person") router.push("/team");
              };
              return (
                <button key={a.id} type="button" onClick={go} className="flex w-full items-center gap-[11px] border-t border-divider py-[11px] text-left first:border-t-0">
                  <Avatar initials={ws.user(a.userId).initials} size={22} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">{ws.first(a.userId)} {a.action} {a.label}{a.field ? ` — ${a.field}` : ""}</span>
                  <span className="flex-none text-[11.5px] text-[#8B9791]">{ws.ago(a.createdAt)}</span>
                </button>
              );
            })}
            {!activity.length && <div className="py-6 text-center text-[13px] text-mute-4">Nothing has happened yet.</div>}
          </Card>
        </div>
        <div>
          <H2>Shared workshop</H2>
          <Link href="/library" className="block w-full rounded-[14px] border border-dashed border-line-strong bg-white p-5 text-left transition hover:border-mute-2">
            <span className="mb-1 block text-[14px] font-semibold">Global Library</span>
            <span className="block text-[12px] leading-[1.5] text-mute-2 text-pretty">Checklists, finalised prompts, templates and SOPs. Nothing in here belongs to a brand, so nothing in here is themed.</span>
            <span className="mt-3 inline-block text-[12px] font-semibold text-accent">Open the workshop →</span>
          </Link>
        </div>
      </div>
    </Page>
  );
}
