"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen, Building2, CalendarDays, Clock, CornerDownLeft, FileText, Layers, LayoutDashboard, Megaphone, MousePointerClick,
  Palette as PaletteIcon, Plus, Search, Settings, Users, Zap, type LucideIcon,
} from "lucide-react";
import { hexA, readable } from "@/lib/color";
import { href } from "@/lib/routes";
import { NEUTRAL } from "@/lib/constants";
import { useApp } from "./provider";
import { cx } from "@/components/ui";
import { SpotArt } from "@/components/art";

type Row = { key: string; title: string; sub: string; code: string; color: string; kind?: string; icon?: LucideIcon; run: () => void };
type Section = { section: string; icon: LucideIcon; rows: Row[] };

const SCOPES = ["All", "Client", "Brand", "Service", "Offer", "Asset", "CTA"] as const;

/** Section titles and icons for each kind of search result. */
const KIND: Record<string, { label: string; icon: LucideIcon }> = {
  Client: { label: "Clients", icon: Building2 },
  Brand: { label: "Brands", icon: PaletteIcon },
  Service: { label: "Services", icon: Layers },
  Offer: { label: "Offers", icon: Megaphone },
  Asset: { label: "Assets", icon: FileText },
  CTA: { label: "CTAs", icon: MousePointerClick },
};

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

  const rows: Section[] = useMemo(() => {
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
        ...(ws.can("edit") ? [{ key: "new", title: "Create something", sub: "Offer, asset, service, CTA, brand or client", code: "", color: NEUTRAL, icon: Plus, run: () => { onClose(); open({ kind: "new" }); } }] : []),
        { key: "street", title: "Go to Dashboard", sub: "Home", code: "", color: NEUTRAL, icon: LayoutDashboard, run: () => go("/") },
        { key: "cal", title: "Open the Calendar", sub: "Deadlines and launches", code: "", color: NEUTRAL, icon: CalendarDays, run: () => go("/calendar") },
        // Client guests cannot open the library or the team page, so they are not offered.
        ...(ws.isGuest ? [] : [
          { key: "lib", title: "Open the Global Library", sub: "Checklists, prompts, templates, SOPs", code: "", color: NEUTRAL, icon: BookOpen, run: () => go("/library") },
          { key: "team", title: "Team and access", sub: `${ws.d.users.length} people`, code: "", color: NEUTRAL, icon: Users, run: () => go("/team") },
        ]),
        { key: "settings", title: "Settings", sub: "Profile, display, notifications", code: "", color: NEUTRAL, icon: Settings, run: () => go("/settings") },
      ];
      return [
        ...(recents.length ? [{ section: "Recent", icon: Clock, rows: recents }] : []),
        { section: "Jump to", icon: Zap, rows: actions },
      ];
    }
    const found = ws.search(t).filter((r) => scope === "All" || r.kind === scope).slice(0, 30);
    // Grouped by kind, groups in the order their best match ranks, so the top hit stays first.
    const groups = new Map<string, Row[]>();
    for (const r of found) {
      const row: Row = {
        key: r.kind + r.id, title: r.title, sub: r.sub, code: r.code, color: r.color, kind: r.kind,
        run: () => {
          if (r.kind === "Asset") { onClose(); openAsset(r.id); return; }
          if (r.kind === "Service") return go(href.service(r.id));
          if (r.kind === "Offer") return go(href.offer(r.id));
          if (r.kind === "Brand") return go(href.brand(r.id));
          if (r.kind === "Client") return go(href.client(r.id));
          const c = ws.cta(r.id); if (c) go(href.brand(c.brandId, "ctas"));
        },
      };
      groups.set(r.kind, [...(groups.get(r.kind) ?? []), row]);
    }
    return [...groups].map(([kind, list]) => ({ section: KIND[kind]?.label ?? kind, icon: KIND[kind]?.icon ?? Search, rows: list }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, scope, ws]);

  const flat = rows.flatMap((s) => s.rows);
  const searching = !!q.trim();
  const total = searching ? flat.length : 0;

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
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-3 pt-[10vh] sm:px-4 sm:pt-24" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 animate-fade bg-[rgba(15,23,42,.36)] backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[78vh] w-[640px] max-w-full animate-pop flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_64px_rgba(15,23,42,.24)]">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <Search className="h-5 w-5 flex-none text-mute-4" />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={onKey}
            placeholder="Search clients, brands, offers, assets, CTAs"
            aria-label="Search"
            aria-controls={flat.length ? "cmdk-list" : undefined}
            aria-activedescendant={flat[sel] ? `cmdk-${sel}` : undefined}
            className="min-w-0 flex-1 border-0 bg-transparent py-1 text-[17px] tracking-[-0.01em] outline-none"
          />
          <button type="button" onClick={onClose} className="kbd h-6 flex-none px-1.5 text-mute-2 hover:text-ink">Esc<span className="sr-only"> (close search)</span></button>
        </div>
        <div className="flex flex-none gap-1 overflow-x-auto border-b border-line px-3.5 py-2" role="group" aria-label="Search in">
          {SCOPES.map((k) => (
            <button key={k} type="button" aria-pressed={scope === k} onClick={() => { setScope(k); setSel(0); }}
              className={cx("focus-inset flex-none rounded-full px-3 py-1 text-[13.5px] font-medium transition-colors duration-150", scope === k ? "bg-ink text-white" : "text-mute-2 hover:bg-hover hover:text-ink")}>
              {k === "All" ? "Everything" : KIND[k].label}
            </button>
          ))}
        </div>
        <div ref={listRef} data-scroll className="min-h-0 flex-1 overflow-y-auto p-2">
          {flat.length > 0 && <div id="cmdk-list" role="listbox" aria-label={searching ? `${total} results` : "Suggestions"}>
          {rows.map((s) => (
            <div key={s.section} role="group" aria-label={s.section} className="mb-1 last:mb-0">
              <div aria-hidden className="flex items-center gap-1.5 px-3 pb-1.5 pt-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-mute-4">
                <s.icon aria-hidden className="h-3.5 w-3.5" />{s.section}
                {searching && <span className="font-medium normal-case tracking-normal text-mute-5">· {s.rows.length}</span>}
              </div>
              {s.rows.map((r) => {
                i++;
                const idx = i;
                const on = sel === idx;
                return (
                  <button
                    key={r.key}
                    id={`cmdk-${idx}`}
                    data-i={idx}
                    type="button"
                    role="option"
                    aria-selected={on}
                    tabIndex={-1}
                    onMouseMove={() => setSel(idx)}
                    onClick={r.run}
                    className={cx("flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors duration-100", on ? "bg-soft" : "hover:bg-hover")}
                  >
                    <RowMark row={r} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-ink">{r.title}</span>
                      <span className="block truncate text-[13.5px] text-mute-2">{r.sub}</span>
                    </span>
                    {on && <span aria-hidden className="kbd flex-none gap-1 px-1.5"><CornerDownLeft className="h-3 w-3" /></span>}
                  </button>
                );
              })}
            </div>
          ))}
          </div>}
          {searching && total === 0 && (
            <div className="flex flex-col items-center px-6 py-8 text-center">
              <SpotArt kind="search" />
              <div className="mt-2 text-[15px] font-semibold text-ink">Nothing matches &ldquo;{q.trim()}&rdquo;</div>
              <div className="mt-1 max-w-[40ch] text-[14px] text-mute-2">
                {scope === "All" ? "Check the spelling, or try a client, brand or offer name." : <>Nothing in {KIND[scope].label.toLowerCase()}. <button type="button" onClick={() => setScope("All")} className="font-semibold text-accent hover:underline">Search everything</button></>}
              </div>
            </div>
          )}
        </div>
        <div className="hidden flex-none items-center gap-4 border-t border-line bg-wash-2 px-[18px] py-2.5 text-[12.5px] text-mute-3 sm:flex">
          <Hint keys={["↑", "↓"]}>move</Hint>
          <Hint keys={["↵"]}>open</Hint>
          <Hint keys={["Tab"]}>change scope</Hint>
          <span className="flex-1" />
          <span>{searching ? `${total} result${total === 1 ? "" : "s"}` : "Type to search"}</span>
        </div>
      </div>
    </div>
  );
}

function RowMark({ row }: { row: Row }) {
  if (row.icon) {
    const Icon = row.icon;
    return <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-line bg-white text-mute-2"><Icon aria-hidden className="h-4 w-4" /></span>;
  }
  return <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-[11.5px] font-bold tracking-[0.03em]" style={{ background: hexA(row.color, 0.12), color: readable(row.color) }}>{row.code}</span>;
}

function Hint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      {keys.map((k) => <kbd key={k} className="kbd">{k}</kbd>)}
      <span>{children}</span>
    </span>
  );
}
