"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, Search } from "lucide-react";
import { ASSET_TYPES } from "@/lib/constants";
import { archivedOnly, live } from "@/lib/ws";
import { useApp } from "@/components/app/provider";
import { AssetCard } from "@/components/cards";
import { BulkBar, SelectToggle, canBulk, useSelection } from "@/components/bulk";
import { ArchExpander, Btn, Empty, Page, PageHead, Pills, cx } from "@/components/ui";

/** What the Global Library holds. Each is a filter pill, an entry in the "Add to library" menu and an empty state. */
const KINDS = [
  { type: "Checklist", plural: "Checklists", noun: "checklist", many: "checklists", one: "a checklist", holds: "Step-by-step checks the team runs before work goes out: launch checks, QA, handovers." },
  { type: "Prompt", plural: "Prompts", noun: "prompt", many: "prompts", one: "a prompt", holds: "The finalised AI prompts the team reuses, with [BRACKETS] for the parts that change per job." },
  { type: "Template", plural: "Templates", noun: "template", many: "templates", one: "a template", holds: "Starting points such as docs, decks and layouts. Clone one into a brand when you run it." },
  { type: "SOP", plural: "SOPs", noun: "SOP", many: "SOPs", one: "an SOP", holds: "How we do repeatable work, written down once so nobody has to ask twice." },
  { type: "Ad creative", plural: "Ad creatives", noun: "ad creative", many: "ad creatives", one: "an ad creative", holds: "Ads that worked, with their images, video and copy, ready to adapt for another client." },
] as const;

const TABS = [{ value: "All", label: "All" }, ...KINDS.map((k) => ({ value: k.type as string, label: k.plural }))];

export function Library() {
  const { ws, open, openAsset } = useApp();
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");
  const all = ws.d.assets.filter((a) => !a.brandId);
  const t = q.toLowerCase();
  const filtered = all.filter((a) => (tab === "All" || a.type === tab) && (!t || `${a.name} ${a.short} ${a.tags.join(" ")}`.toLowerCase().includes(t)));
  const shown = live(filtered);
  const sel = useSelection();
  // In select mode archived items join the grid, so they can be restored in bulk too.
  const grid = sel.on ? [...shown, ...archivedOnly(filtered)] : shown;
  const add = (type: string) => open({ kind: "asset", draft: { brandId: null, type, status: "Live", offerIds: [] }, step: 3 });
  const kind = KINDS.find((k) => k.type === tab);
  return (
    <Page>
      <PageHead eyebrow="Shared across every client" title="Global Library" actions={(ws.can("library") || canBulk(ws, true)) && (
          <>
            {canBulk(ws, true) && all.length > 0 && <SelectToggle s={sel} />}
            {ws.can("library") && <AddMenu label="Add to library" onPick={add} first={kind?.type} />}
          </>
        )}
        sub={<>{live(all).length} shared items — checklists, prompts, templates, SOPs and ad creatives. Nothing here belongs to a brand, so nothing here is themed. Clone one into a brand when you actually run it.</>}
      />
      {all.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <label className="relative block w-full max-w-[300px]">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute-4" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the library" aria-label="Search the library" className="field pl-9 text-[15px]" />
          </label>
          {/* Every kind shows, even at 0: they are the library's categories, not search results. */}
          <Pills tone="dark" value={tab} onChange={setTab} options={TABS.map((x) => ({ ...x, count: live(all).filter((a) => x.value === "All" || a.type === x.value).length }))} label="Type" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4">
        {grid.map((a) => <AssetCard key={a.id} a={a} variant="library" selecting={sel.on} selected={sel.sel.has(a.id)} onToggle={() => sel.toggle(a.id)} />)}
      </div>
      {!sel.on && <ArchExpander items={archivedOnly(filtered)} noun="item" onOpen={(a) => openAsset(a.id)} />}
      {sel.on && <BulkBar s={sel} shown={grid} library />}
      {!grid.length && (q ? (
        <Empty art="search" title="Nothing matches that search" body={`Try another word, or clear the search to see every ${kind ? kind.noun : "item"}.`}>
          <Btn onClick={() => setQ("")}>Clear the search</Btn>
        </Empty>
      ) : kind ? (
        <Empty art="folder" title={`No ${kind.many} yet`} body={kind.holds}>
          {ws.can("library") && <Btn variant="dark" size="lg" onClick={() => add(kind.type)}><Plus aria-hidden className="h-4 w-4" />Add {kind.one}</Btn>}
        </Empty>
      ) : (
        <Empty art="folder" title="Nothing in the library yet" body="Checklists, prompts, templates, SOPs and ad creatives that every client can use live here. Upload the files with them.">
          {ws.can("library") && <AddMenu label="Add something" onPick={add} />}
        </Empty>
      ))}
    </Page>
  );
}

const MENU_W = 280;

/**
 * "Add to library" opens a short menu of kinds, so a new item starts as the right type.
 * The menu is portalled to <body>: the page header is its own stacking context, so a
 * menu inside it would slide under the search box and cards below.
 */
function AddMenu({ label, onPick, first }: { label: string; onPick: (type: string) => void; first?: string }) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const on = !!at;
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  // The kind of the pill you are on comes first, so it is one Enter away.
  const kinds = first ? [...KINDS.filter((k) => k.type === first), ...KINDS.filter((k) => k.type !== first)] : [...KINDS];

  useEffect(() => {
    if (!on) return;
    const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    items()[0]?.focus({ preventScroll: true });
    const shut = (refocus: boolean) => { setAt(null); if (refocus) btn.current?.focus(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); shut(true); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLElement);
      const next = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
      list[next]?.focus();
    };
    // It is pinned to where the button was, so it closes rather than drift when the page moves.
    const onMove = () => shut(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [on]);

  const toggle = () => {
    if (on || !btn.current) { setAt(null); return; }
    const r = btn.current.getBoundingClientRect();
    const w = Math.min(MENU_W, window.innerWidth - 32);
    // Right-aligned to the button where there is room, otherwise kept inside the screen.
    setAt({ top: r.bottom + 6, left: Math.max(16, Math.min(r.right - w, window.innerWidth - 16 - w)) });
  };

  return (
    <>
      <Btn ref={btn} variant="dark" size="lg" onClick={toggle} aria-haspopup="menu" aria-expanded={on} aria-controls={on ? id : undefined}>
        <Plus aria-hidden className="h-4 w-4" />{label}<ChevronDown aria-hidden className={cx("h-4 w-4 transition-transform motion-reduce:transition-none", on && "rotate-180")} />
      </Btn>
      {at && createPortal(
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setAt(null)} />
          <div ref={menu} id={id} role="menu" aria-label="What to add" style={{ top: at.top, left: at.left, width: Math.min(MENU_W, window.innerWidth - 32) }}
            className="fixed z-[71] animate-pop rounded-lg border border-line bg-white p-1.5 text-left shadow-[0_16px_40px_rgba(15,23,42,.14)]">
            {kinds.map((k) => (
              <button key={k.type} type="button" role="menuitem" onClick={() => { setAt(null); onPick(k.type); }}
                className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-hover focus-visible:bg-hover focus-visible:outline-none">
                <span aria-hidden className="flex h-8 w-11 flex-none items-center justify-center rounded-[7px] bg-chip font-mono text-[11.5px] font-bold tracking-[0.05em] text-mute-1">{ASSET_TYPES[k.type]?.code}</span>
                <span className="min-w-0 flex-1 text-[14.5px] font-medium text-ink">{k.type}</span>
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
