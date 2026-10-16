"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen, Building2, CalendarDays, Clock, CornerDownLeft, FileText, Folder, Inbox, Keyboard, Layers, LayoutDashboard, Library,
  Megaphone, MessageSquare, MousePointerClick, Palette as PaletteIcon, Plus, Search, Settings, ShieldCheck, Trash2, User, Users, X, Zap,
  type LucideIcon,
} from "lucide-react";
import { hexA, onColor, readable } from "@/lib/color";
import { href } from "@/lib/routes";
import { ASSET_STATUS, NEUTRAL } from "@/lib/constants";
import { SEARCH_KINDS, type Part, type SearchHit, type SearchKind, type SearchTarget } from "@/lib/search";
import { useApp } from "./provider";
import { whereAmI } from "./here";
import { NEW_MENU_EVENT } from "./new-menu";
import { Avatar, cx } from "@/components/ui";

/*
 * Global search lives in the header box itself: typing there searches at
 * once and the results drop down under it. ⌘K and "/" focus the box. On
 * phones the box widens over the header and the results fill the screen
 * below it.
 */

type Row = {
  key: string;
  title: Part[];
  /** Mono label in front of the context line: "Offer", "Page", "Action". */
  type: string;
  sub: string;
  code: string;
  color: string;
  icon?: LucideIcon;
  avatar?: boolean;
  thumb?: string | null;
  status?: string;
  archived?: boolean;
  field?: string;
  snippet?: Part[];
  /** A quiet row that changes the search rather than opening something ("Show all", "Search everywhere"). */
  more?: boolean;
  run: () => void;
};
type Section = { section: string; icon: LucideIcon; rows: Row[]; count?: number };

/** Section titles, the type label on each row, and icons for each kind of result. */
const KIND: Record<SearchKind, { label: string; one: string; many: string; icon: LucideIcon }> = {
  Page: { label: "Pages and actions", one: "Page", many: "pages and actions", icon: Zap },
  Client: { label: "Clients", one: "Client", many: "clients", icon: Building2 },
  Brand: { label: "Brands", one: "Brand", many: "brands", icon: PaletteIcon },
  Service: { label: "Services", one: "Service", many: "services", icon: Layers },
  Offer: { label: "Offers", one: "Offer", many: "offers", icon: Megaphone },
  Asset: { label: "Assets", one: "Asset", many: "assets", icon: FileText },
  Library: { label: "Global Library", one: "Library", many: "Global Library items", icon: Library },
  CTA: { label: "CTAs", one: "CTA", many: "CTAs", icon: MousePointerClick },
  Folder: { label: "Folders", one: "Folder", many: "folders", icon: Folder },
  Person: { label: "People", one: "Person", many: "people", icon: Users },
  Note: { label: "Notes", one: "Note", many: "notes", icon: MessageSquare },
};

/** Icons for the app's own pages and actions, by their id in the search index. */
const PAGE_ICON: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, launches: CalendarDays, inbox: Inbox, library: BookOpen, settings: Settings, team: Users,
  audit: ShieldCheck, trash: Trash2, shortcuts: Keyboard,
};

/** With everything shown, each group lists this many and offers the rest behind "Show all". */
const PER_GROUP = 5;
const PER_SCOPE = 60;

/** The id of the header search box, so the phone's Search button can focus it straight away. */
export const SEARCH_INPUT_ID = "header-search";

const plain = (text: string): Part[] => [{ text, hit: false }];

export function HeaderSearch() {
  const { ws, cmdk: open, setCmdk, openAsset, open: openModal, setInbox } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<SearchKind | "All">("All");
  const [owner, setOwner] = useState<string | null>(null);
  // Opened inside a brand, results start narrowed to it; Tab or the chip's × widens them to everything.
  const [inBrand, setInBrand] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Each time it opens: narrowed to the brand the person is in, nothing else carried over.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) { setInBrand(whereAmI(ws, pathname).active?.id ?? null); setScope("All"); setOwner(null); setSel(0); }
  }

  // ⌘K, "/" and the phone's Search button open it with the typing focus in the box; a click anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const down = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setCmdk(false); };
    document.addEventListener("mousedown", down, true);
    return () => document.removeEventListener("mousedown", down, true);
  }, [open, setCmdk]);

  const close = () => { setCmdk(false); };
  const done = () => { setQ(""); setCmdk(false); document.getElementById(SEARCH_INPUT_ID)?.blur(); };
  const go = (to: string) => { done(); router.push(to); };

  const action = (a: Extract<SearchTarget, { type: "action" }>["action"]) => {
    const h = whereAmI(ws, pathname);
    const b = h.brand;
    done();
    if (a === "inbox") return setInbox(true);
    if (a === "shortcuts") return openModal({ kind: "shortcuts" });
    if (a === "new-client") return openModal({ kind: "client" });
    if (a === "new-library") return openModal({ kind: "asset", draft: { brandId: null, type: "Checklist", status: "Live", offerIds: [] }, step: 3 });
    if (a === "new-brand" && h.clientId) return openModal({ kind: "brand", draft: { clientId: h.clientId } });
    if (!b || a === "new") { window.dispatchEvent(new CustomEvent(NEW_MENU_EVENT)); return; }
    if (a === "new-offer") return openModal({ kind: "offer", draft: { brandId: b.id, serviceId: h.service?.id ?? null, segment: "All segments", status: "Ideation" } });
    if (a === "new-asset") return openModal({ kind: "asset", draft: { brandId: b.id, status: "Draft", offerIds: h.offer ? [h.offer.id] : [] }, step: 0 });
    if (a === "new-service") return openModal({ kind: "service", draft: { brandId: b.id } });
    if (a === "new-cta") return openModal({ kind: "cta", draft: { brandId: b.id, bg: b.primary, fg: onColor(b.primary), style: "solid" } });
  };

  const runTarget = (t: SearchTarget) => {
    if (t.type === "href") return go(t.href);
    if (t.type === "asset") { done(); openAsset(t.id, t.tab); return; }
    if (t.type === "action") return action(t.action);
    // A person: show their work here, without leaving the search.
    setOwner(t.id); setQ(""); setScope("All"); setSel(0);
  };

  const searching = open && (!!q.trim() || !!owner);
  // The index behind ws.search is built once per workspace snapshot; this only re-runs the scan as the query changes.
  const everywhere: SearchHit[] = useMemo(() => (searching ? ws.search(q, { owner }) : []), [ws, q, owner, searching]);
  const brandIds = useMemo(() => (inBrand ? new Set([inBrand, ...ws.subBrands(inBrand).map((b) => b.id)]) : null), [ws, inBrand]);
  const hits = useMemo(
    () => (brandIds ? everywhere.filter((h) => h.kind === "Page" || (!!h.brandId && brandIds.has(h.brandId))) : everywhere),
    [everywhere, brandIds],
  );
  const outside = everywhere.length - hits.length;
  const brandName = inBrand ? ws.brand(inBrand)?.name ?? "" : "";

  const counts = useMemo(() => {
    const m = new Map<SearchKind, number>();
    for (const h of hits) m.set(h.kind, (m.get(h.kind) ?? 0) + 1);
    return m;
  }, [hits]);
  // A chosen scope with nothing in it any more falls back to everything.
  const shownScope = scope !== "All" && counts.has(scope) ? scope : "All";

  const toRow = (h: SearchHit): Row => ({
    key: h.kind + h.id, title: h.titleParts, sub: h.sub, code: h.code, color: h.color, archived: h.archived,
    type: h.kind === "Page" && h.to.type === "action" ? "Action" : KIND[h.kind].one,
    avatar: h.kind === "Person", thumb: h.thumb, status: h.status, field: h.field, snippet: h.snippet,
    ...(h.kind === "Page" && { icon: PAGE_ICON[h.id] ?? (h.to.type === "action" ? Plus : Zap) }),
    run: () => runTarget(h.to),
  });

  const sections: Section[] = useMemo(() => {
    if (!open) return [];
    if (!searching) {
      const h = whereAmI(ws, pathname);
      const recent: Row[] = ws.d.recents.map((r): Row | null => {
        if (r.kind === "brand") { const b = ws.brand(r.itemId); return b && { key: "b" + b.id, title: plain(b.name), type: "Brand", sub: ws.client(b.clientId)?.name ?? "", code: b.mark, color: b.primary, run: () => go(href.brand(b.id)) }; }
        if (r.kind === "offer") { const o = ws.offer(r.itemId); const b = ws.brand(o?.brandId); return o && { key: "o" + o.id, title: plain(o.name), type: "Offer", sub: [b?.name, o.segment].filter(Boolean).join(" · "), code: "OF", color: b?.primary ?? NEUTRAL, run: () => go(href.offer(o.id)) }; }
        if (r.kind === "service") { const v = ws.service(r.itemId); const b = ws.brand(v?.brandId); return v && { key: "s" + v.id, title: plain(v.name), type: "Service", sub: b?.name ?? "", code: "SVC", color: b?.primary ?? NEUTRAL, run: () => go(href.service(v.id)) }; }
        if (r.kind === "client") { const c = ws.client(r.itemId); return c && { key: "c" + c.id, title: plain(c.name), type: "Client", sub: c.kind, code: "CL", color: NEUTRAL, run: () => go(href.client(c.id)) }; }
        const a = ws.asset(r.itemId); const b = ws.brand(a?.brandId);
        return a && { key: "a" + a.id, title: plain(a.name), type: a.brandId ? "Asset" : "Library", sub: [b?.name ?? "Global Library", a.type].join(" · "), code: ws.codeOf(a), color: b?.primary ?? NEUTRAL, thumb: ws.previewOf(a), status: a.status, run: () => { done(); openAsset(a.id); } };
      }).filter((r): r is Row => !!r).slice(0, 5);
      const page = (key: string, title: string, sub: string, icon: LucideIcon, run: () => void, type = "Page"): Row => ({ key, title: plain(title), type, sub, code: "", color: NEUTRAL, icon, run });
      const jump: Row[] = [
        ...(h.active ? [page("kit", "Brand Kit", h.active.name, PaletteIcon, () => go(href.brand(h.active!.id, "kit")))] : []),
        // Client guests cannot open the library.
        ...(ws.isGuest ? [] : [page("lib", "Global Library", "Checklists, prompts, templates, SOPs", BookOpen, () => go("/library"))]),
        page("cal", "Launches", "Offer launch dates", CalendarDays, () => go("/calendar")),
        ...(ws.can("edit") && h.brand ? [
          page("new-offer", "New offer", `In ${h.brand.name}`, Plus, () => action("new-offer"), "Action"),
          page("new-asset", "New asset", `In ${h.brand.name}`, Plus, () => action("new-asset"), "Action"),
        ] : []),
      ];
      return [
        ...(recent.length ? [{ section: "Recent", icon: Clock, rows: recent }] : []),
        { section: "Jump to", icon: Zap, rows: jump },
      ];
    }
    // Grouped by kind, groups in the order their best match ranks, so the top hit stays first.
    const groups = new Map<SearchKind, SearchHit[]>();
    for (const h of hits) if (shownScope === "All" || h.kind === shownScope) groups.set(h.kind, [...(groups.get(h.kind) ?? []), h]);
    const out: Section[] = [...groups].map(([kind, list]) => {
      const cap = shownScope === "All" ? PER_GROUP : PER_SCOPE;
      const rows = list.slice(0, cap).map(toRow);
      if (list.length > cap && shownScope === "All") {
        rows.push({ key: "more" + kind, title: plain(`Show all ${list.length} ${KIND[kind].many}`), type: "", sub: "", code: "", color: NEUTRAL, icon: Search, more: true, run: () => { setScope(kind); setSel(0); } });
      }
      return { section: KIND[kind].label, icon: KIND[kind].icon, rows, count: list.length };
    });
    if (inBrand && outside > 0) {
      out.push({ section: "Everywhere else", icon: Search, rows: [{
        key: "widen", title: plain(`Search everywhere: ${outside} more outside ${brandName}`), type: "", sub: "", code: "", color: NEUTRAL, icon: Search, more: true,
        run: () => { setInBrand(null); setSel(0); },
      }] });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hits, searching, shownScope, ws, inBrand, outside]);

  const flat = sections.flatMap((s) => s.rows);
  const total = searching ? hits.length : 0;
  const ownerName = owner ? ws.user(owner).name : "";

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const widen = () => { setInBrand(null); setSel(0); inputRef.current?.focus(); };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      // First Esc closes the results; a second one clears the box and leaves it.
      e.preventDefault(); e.stopPropagation();
      if (open) close(); else done();
      return;
    }
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") { e.preventDefault(); setCmdk(true); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); flat[sel]?.run(); }
    // With something typed, the first Tab widens a brand search to everything; otherwise Tab moves on as usual.
    else if (e.key === "Tab" && !e.shiftKey && inBrand && q.trim()) { e.preventDefault(); setInBrand(null); setSel(0); }
    else if (e.key === "Backspace" && !q && (owner || inBrand)) {
      e.preventDefault();
      if (owner) setOwner(null); else setInBrand(null);
      setSel(0);
    }
  };

  const pickScope = (k: SearchKind | "All") => { setScope(k); setSel(0); inputRef.current?.focus(); };
  const placeholder = owner ? `Search ${ownerName.split(" ")[0]}'s work` : inBrand && open ? `Search ${brandName}` : "Search everything";

  let i = -1;
  return (
    <div
      ref={wrapRef}
      // Focus moving to something outside (Tab) closes the results; clicks are handled by the listener above.
      onBlur={(e) => { if (e.relatedTarget && !wrapRef.current?.contains(e.relatedTarget as Node)) close(); }}
      className={cx(
        // Open, the box takes the room it needs, up to its widest.
        "relative flex h-10 min-w-0 max-w-2xl transition-[flex-grow] duration-200", open ? "flex-[4]" : "flex-1",
        // Phones: open, the box widens over the whole header row.
        open && "max-sm:fixed max-sm:inset-x-0 max-sm:top-0 max-sm:z-[2] max-sm:h-header max-sm:max-w-none max-sm:items-center max-sm:gap-2 max-sm:bg-surface max-sm:px-3 max-sm:pt-[env(safe-area-inset-top)]",
      )}
    >
      <div className={cx(
        "flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 text-body transition-colors duration-150",
        open ? "border-accent bg-surface shadow-card" : "border-line bg-wash hover:border-line-strong hover:bg-surface",
      )}>
        <Search aria-hidden className="h-[18px] w-[18px] flex-none text-mute-5" />
        {open && inBrand && <ScopeChip onClear={widen} label={`In ${brandName}`} clearLabel={`Search everything, not only ${brandName}`} />}
        {open && owner && <ScopeChip onClear={() => { setOwner(null); setSel(0); inputRef.current?.focus(); }} label={`Owned by ${ownerName}`} clearLabel={`Stop showing only ${ownerName}'s work`} icon />}
        <input
          ref={inputRef}
          id={SEARCH_INPUT_ID}
          type="text"
          role="combobox"
          aria-label="Search"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls={open ? "search-results" : undefined}
          aria-activedescendant={open && flat[sel] ? `search-opt-${sel}` : undefined}
          aria-describedby="search-help"
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); if (!open) setCmdk(true); }}
          onFocus={() => { if (!open) setCmdk(true); }}
          onClick={() => { if (!open) setCmdk(true); }}
          onKeyDown={onKey}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          className="min-w-[6ch] flex-1 border-0 bg-transparent py-1 text-body text-ink outline-none placeholder:text-mute-4"
        />
        {open
          ? <button type="button" onClick={done} className="kbd hidden h-6 flex-none px-1.5 text-mute-2 hover:text-ink sm:inline-flex">Esc<span className="sr-only"> (close search)</span></button>
          : <kbd aria-hidden className="kbd hidden flex-none sm:inline-flex">⌘K</kbd>}
      </div>
      {open && <button type="button" onClick={done} className="flex-none px-1 text-body font-medium text-accent sm:hidden">Cancel</button>}
      <span id="search-help" className="sr-only">
        Searches everything you can see as you type. Every word has to match. Use the up and down arrows to move through results and Enter to open one.{open && inBrand ? ` Results are only from ${brandName}; press Tab to search everything.` : ""}
      </span>

      {open && (
        <div
          // Clicks inside the results keep the typing focus in the box.
          onMouseDown={(e) => { if (!(e.target as HTMLElement).closest("input")) e.preventDefault(); }}
          className="absolute left-0 top-full z-10 mt-1.5 flex max-h-[70vh] min-w-full w-[min(640px,calc(100vw-5rem))] animate-pop flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card max-sm:right-0 max-sm:mt-0 max-sm:max-h-[calc(100dvh-60px-env(safe-area-inset-top))] max-sm:w-auto max-sm:rounded-none max-sm:border-x-0"
        >
          {searching && hits.length > 0 && (
            <div data-scroll className="flex flex-none items-center gap-1 overflow-x-auto border-b border-line px-2.5 py-1.5" role="group" aria-label="Show">
              <Chip on={shownScope === "All"} onClick={() => pickScope("All")} label="Everything" n={total} />
              {SEARCH_KINDS.filter((k) => counts.has(k)).map((k) => (
                <Chip key={k} on={shownScope === k} onClick={() => pickScope(k)} label={KIND[k].label} n={counts.get(k)!} />
              ))}
            </div>
          )}

          {/* Reachable with Tab too, so the list can be scrolled from the keyboard without the arrows. */}
          <div ref={listRef} data-scroll tabIndex={0} role="region" aria-label={searching ? "Results" : "Suggestions"} className="focus-inset min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
            {flat.length > 0 && <div id="search-results" role="listbox" aria-label={searching ? `${total} results` : "Suggestions"}>
            {sections.map((s) => (
              <div key={s.section} role="group" aria-label={s.section} className="mb-1 last:mb-0">
                <div aria-hidden className="eyebrow flex items-center gap-1.5 px-2.5 pb-1 pt-2">
                  <s.icon aria-hidden className="h-3.5 w-3.5" />{s.section}
                  {s.count !== undefined && <span className="tracking-normal text-mute-5">· {s.count}</span>}
                </div>
                {s.rows.map((r) => {
                  i++;
                  const idx = i;
                  const on = sel === idx;
                  return (
                    <div
                      key={r.key}
                      id={`search-opt-${idx}`}
                      data-i={idx}
                      role="option"
                      aria-selected={on}
                      onMouseMove={() => { if (sel !== idx) setSel(idx); }}
                      onClick={r.run}
                      className={cx("flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1 text-left transition-colors duration-100", on ? "bg-soft" : "hover:bg-hover")}
                    >
                      <RowMark row={r} />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {r.status && <span aria-hidden title={r.status} className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: ASSET_STATUS[r.status as keyof typeof ASSET_STATUS] ?? NEUTRAL }} />}
                          <span className={cx("truncate text-body leading-5", r.more ? "font-semibold text-accent" : "text-ink")}><Marked parts={r.title} /></span>
                          {r.status && <span className="sr-only">, {r.status}</span>}
                        </span>
                        {(r.type || r.sub) && (
                          <span className="block truncate text-small leading-4 text-mute-2">
                            {r.type && <span className="font-mono text-micro font-medium uppercase tracking-[0.08em] text-mute-3">{r.type}</span>}
                            {r.type && r.sub && " · "}{r.sub}
                          </span>
                        )}
                        {r.snippet && (
                          <span className="block truncate text-small leading-4 text-mute-2">
                            <span className="text-mute-4">{r.field}: </span><Marked parts={r.snippet} />
                          </span>
                        )}
                      </span>
                      {r.archived && <span className="flex-none rounded-full bg-chip px-2 py-0.5 text-micro font-medium text-mute-2">Archived</span>}
                      {on && <span aria-hidden className="kbd hidden flex-none gap-1 px-1.5 sm:inline-flex"><CornerDownLeft className="h-3 w-3" /></span>}
                    </div>
                  );
                })}
              </div>
            ))}
            </div>}
            {searching && total === 0 && (
              <div className="flex flex-col items-center px-6 py-8 text-center">
                <div className="text-body font-semibold text-ink">{q.trim() ? <>Nothing {inBrand ? `in ${brandName} ` : ""}matches &ldquo;{q.trim()}&rdquo;</> : `${ownerName} owns nothing you can see${inBrand ? ` in ${brandName}` : ""}`}</div>
                <div className="mt-1 max-w-[46ch] text-meta text-mute-2">
                  {inBrand && outside > 0 ? <><button type="button" onClick={widen} className="font-semibold text-accent hover:underline">Search everywhere</button>: {outside} more outside {brandName}.</>
                    : inBrand ? "Nothing outside it either. Every word has to match somewhere."
                    : owner ? <>Searching only {ownerName.split(" ")[0]}&apos;s work. <button type="button" onClick={() => setOwner(null)} className="font-semibold text-accent hover:underline">Search everyone&apos;s</button></>
                    : "Every word has to match somewhere. Try fewer words, or check the spelling."}
                </div>
              </div>
            )}
          </div>
          <div className="hidden flex-none items-center gap-4 whitespace-nowrap border-t border-line bg-wash-2 px-3.5 py-2 text-small text-mute-3 sm:flex">
            <Hint keys={["↑", "↓"]}>move</Hint>
            <Hint keys={["↵"]}>open</Hint>
            {inBrand && <Hint keys={["Tab"]}>search everywhere</Hint>}
            <Hint keys={["Esc"]}>close</Hint>
            <span className="flex-1" />
            <span>{searching ? `${total} result${total === 1 ? "" : "s"}` : "Type to search"}</span>
          </div>
        </div>
      )}
      <span className="sr-only" aria-live="polite">{searching ? `${total} result${total === 1 ? "" : "s"}` : ""}</span>
    </div>
  );
}

/** "In Quokka For Good ×": what the results are narrowed to, removable in one click. */
function ScopeChip({ label, clearLabel, onClear, icon }: { label: string; clearLabel: string; onClear: () => void; icon?: boolean }) {
  return (
    <span className="inline-flex min-w-0 max-w-[45%] flex-none items-center gap-1 rounded-full bg-soft py-0.5 pl-2.5 pr-1 text-small font-medium text-ink">
      {icon && <User aria-hidden className="h-3.5 w-3.5 flex-none text-mute-3" />}
      <span className="truncate">{label}</span>
      <button type="button" onClick={onClear} aria-label={clearLabel} className="flex h-5 w-5 flex-none items-center justify-center rounded-full text-mute-3 hover:bg-surface hover:text-ink">
        <X aria-hidden className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

function Chip({ on, onClick, label, n }: { on: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cx("focus-inset flex-none rounded-full px-2.5 py-0.5 text-small font-medium transition-colors duration-150", on ? "bg-ink text-white" : "text-mute-2 hover:bg-hover hover:text-ink")}>
      {label}<span className={cx("ml-1.5 font-mono text-micro", on ? "text-white/75" : "text-mute-4")}>{n}</span>
    </button>
  );
}

/** Text with the typed words in semibold: the match reads at a glance without a loud highlight. */
function Marked({ parts }: { parts: Part[] }) {
  return parts.map((p, i) => p.hit
    ? <mark key={i} className="bg-transparent font-semibold text-ink">{p.text}</mark>
    : <Fragment key={i}>{p.text}</Fragment>);
}

/** 32×24: an asset's picture when it has one, otherwise its code, an icon or a person's initials. */
function RowMark({ row }: { row: Row }) {
  if (row.icon) {
    const Icon = row.icon;
    return <span className="flex h-6 w-8 flex-none items-center justify-center rounded-lg border border-line bg-surface text-mute-2"><Icon aria-hidden className="h-3.5 w-3.5" /></span>;
  }
  if (row.avatar) return <span className="flex h-6 w-8 flex-none items-center justify-center"><Avatar initials={row.code} size={24} /></span>;
  // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file
  if (row.thumb) return <img src={row.thumb} alt="" className="h-6 w-8 flex-none rounded-lg border border-line object-cover" />;
  return <span className="flex h-6 w-8 flex-none items-center justify-center rounded-lg font-mono text-micro font-bold tracking-[0.02em]" style={{ background: hexA(row.color, 0.12), color: readable(row.color) }}>{row.code}</span>;
}

function Hint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      {keys.map((k) => <kbd key={k} className="kbd">{k}</kbd>)}
      <span>{children}</span>
    </span>
  );
}
