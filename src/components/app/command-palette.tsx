"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { hexA, readable } from "@/lib/color";
import { href } from "@/lib/routes";
import { NEUTRAL } from "@/lib/constants";
import { useApp } from "./provider";
import { cx } from "@/components/ui";

type Row = { key: string; title: string; sub: string; code: string; color: string; kind?: string; run: () => void };

const SCOPES = ["All", "Client", "Brand", "Service", "Offer", "Asset", "CTA"] as const;

export function CommandPalette() {
  const { cmdk, setCmdk } = useApp();
  if (!cmdk) return null;
  return <Palette onClose={() => setCmdk(false)} />;
}

function Palette({ onClose }: { onClose: () => void }) {
  const { ws, openAsset, open } = useApp();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<(typeof SCOPES)[number]>("All");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const go = (to: string) => { onClose(); router.push(to); };

  const rows: { section: string; rows: Row[] }[] = useMemo(() => {
    const t = q.trim();
    if (!t) {
      const recents: Row[] = ws.d.recents.map((r) => {
        if (r.kind === "brand") { const b = ws.brand(r.itemId); return b && { key: "b" + b.id, title: b.name, sub: "Brand", code: b.mark, color: b.primary, run: () => go(href.brand(b.id)) }; }
        if (r.kind === "offer") { const o = ws.offer(r.itemId); const b = ws.brand(o?.brandId); return o && { key: "o" + o.id, title: o.name, sub: `Offer · ${b?.name}`, code: "OF", color: b?.primary ?? NEUTRAL, run: () => go(href.offer(o.id)) }; }
        if (r.kind === "service") { const v = ws.service(r.itemId); const b = ws.brand(v?.brandId); return v && { key: "s" + v.id, title: v.name, sub: `Service · ${b?.name}`, code: "SVC", color: b?.primary ?? NEUTRAL, run: () => go(href.service(v.id)) }; }
        if (r.kind === "client") { const c = ws.client(r.itemId); return c && { key: "c" + c.id, title: c.name, sub: "Client", code: "CL", color: NEUTRAL, run: () => go(href.client(c.id)) }; }
        const a = ws.asset(r.itemId); const b = ws.brand(a?.brandId);
        return a && { key: "a" + a.id, title: a.name, sub: `Asset · ${b?.name ?? "Global"}`, code: ws.codeOf(a), color: b?.primary ?? NEUTRAL, run: () => { onClose(); openAsset(a.id); } };
      }).filter(Boolean).slice(0, 6) as Row[];
      const actions: Row[] = [
        ...(ws.can("edit") ? [{ key: "new", title: "Create something", sub: "Offer, asset, service, CTA, brand or client", code: "+", color: "#2D4A5C", run: () => { onClose(); open({ kind: "new" }); } }] : []),
        { key: "street", title: "Go to the Street", sub: "Home", code: "◻", color: NEUTRAL, run: () => go("/") },
        { key: "lib", title: "Open the Global Library", sub: "Checklists, prompts, templates, SOPs", code: "◫", color: NEUTRAL, run: () => go("/library") },
        { key: "team", title: "Team and access", sub: `${ws.d.users.length} people`, code: "◐", color: NEUTRAL, run: () => go("/team") },
      ];
      return [
        ...(recents.length ? [{ section: "Recent", rows: recents }] : []),
        { section: "Jump to", rows: actions },
      ];
    }
    const found = ws.search(t).filter((r) => scope === "All" || r.kind === scope).slice(0, 30);
    return [{
      section: "",
      rows: found.map((r) => ({
        key: r.kind + r.id, title: r.title, sub: r.sub, code: r.code, color: r.color, kind: r.kind,
        run: () => {
          if (r.kind === "Asset") { onClose(); openAsset(r.id); return; }
          if (r.kind === "Service") return go(href.service(r.id));
          if (r.kind === "Offer") return go(href.offer(r.id));
          if (r.kind === "Brand") return go(href.brand(r.id));
          if (r.kind === "Client") return go(href.client(r.id));
          const c = ws.cta(r.id); if (c) go(href.brand(c.brandId, "ctas"));
        },
      })),
    }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, scope, ws]);

  const flat = rows.flatMap((s) => s.rows);
  const total = q.trim() ? flat.length : 0;

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); flat[sel]?.run(); }
    else if (e.key === "Tab") {
      e.preventDefault();
      const i = SCOPES.indexOf(scope);
      setScope(SCOPES[(i + (e.shiftKey ? SCOPES.length - 1 : 1)) % SCOPES.length]);
      setSel(0);
    }
  };

  let i = -1;
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh] sm:pt-24" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 animate-fade bg-[rgba(16,22,20,.32)]" onClick={onClose} />
      <div className="relative w-[620px] max-w-full animate-pop overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(16,22,20,.22)]">
        <div className="border-b border-line px-5 py-4">
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={onKey}
            placeholder="Search clients, brands, offers, assets, CTAs"
            aria-label="Search"
            className="w-full border-0 bg-transparent text-[17px] tracking-[-0.01em] outline-none"
          />
        </div>
        <div className="flex gap-0.5 overflow-x-auto border-b border-line px-3.5 py-[9px]">
          {SCOPES.map((k) => (
            <button key={k} type="button" onClick={() => { setScope(k); setSel(0); }} className={cx("flex-none rounded-md px-2.5 py-1 text-[14px] font-medium transition", scope === k ? "bg-ink text-white" : "text-[#5C6A64] hover:text-ink")}>
              {k === "All" ? "Everything" : k + "s"}
            </button>
          ))}
        </div>
        <div ref={listRef} data-scroll className="max-h-[380px] overflow-y-auto p-2">
          {rows.map((s) => (
            <div key={s.section || "results"}>
              {s.section && <div className="eyebrow px-3 pb-1.5 pt-2 tracking-[0.11em]">{s.section}</div>}
              {s.rows.map((r) => {
                i++;
                const idx = i;
                return (
                  <button
                    key={r.key}
                    data-i={idx}
                    type="button"
                    onMouseMove={() => setSel(idx)}
                    onClick={r.run}
                    className={cx("flex w-full items-center gap-3 rounded-[9px] px-3 py-[9px] text-left", sel === idx && "bg-hover")}
                  >
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[7px] text-[12px] font-bold" style={{ background: hexA(r.color, 0.12), color: readable(r.color) }}>{r.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{r.title}</span>
                      <span className="block truncate text-[14.5px] text-mute-2">{r.sub}</span>
                    </span>
                    {r.kind && <span className="flex-none text-[12.5px] font-semibold uppercase tracking-[0.05em] text-mute-5">{r.kind}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {q.trim() && total === 0 && <div className="p-10 text-center text-[15px] text-mute-2">Nothing matches that.</div>}
        </div>
        <div className="flex items-center gap-3 border-t border-line bg-wash-2 px-[18px] py-[9px] text-[13.5px] text-mute-4">
          <span>{total ? `${total} result${total > 1 ? "s" : ""}` : "↑↓ to move · Enter to open · Tab to change scope"}</span>
          <span className="flex-1" />
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
