"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, Search, Upload } from "lucide-react";
import type { Asset } from "@/db/schema";
import { ASSET_TYPES } from "@/lib/constants";
import { archivedOnly, live, plural } from "@/lib/ws";
import { useApp } from "@/components/app/provider";
import { AssetCard } from "@/components/cards";
import { BulkBar, SelectToggle, canBulk, useSelection } from "@/components/bulk";
import { ArchExpander, Btn, Card, CodeTile, Empty, Page, PageHead, Tick, cx } from "@/components/ui";
import { DropHint, useFileDrop } from "@/components/app/file-drop";
import { BulkUpload } from "@/components/features/files/bulk-upload";

/** What the Global Library holds. Each is a filter pill, an entry in the "Add to library" menu and an empty state. */
const KINDS = [
  { type: "Checklist", plural: "Checklists", noun: "checklist", many: "checklists", one: "a checklist", holds: "Step-by-step checks the team runs before work goes out: launch checks, QA, handovers." },
  { type: "Prompt", plural: "Prompts", noun: "prompt", many: "prompts", one: "a prompt", holds: "The finalised AI prompts the team reuses, with [BRACKETS] for the parts that change per job." },
  { type: "Template", plural: "Templates", noun: "template", many: "templates", one: "a template", holds: "Starting points such as docs, decks and layouts. Clone one into a brand when you run it." },
  { type: "SOP", plural: "SOPs", noun: "SOP", many: "SOPs", one: "an SOP", holds: "How we do repeatable work, written down once so nobody has to ask twice." },
  { type: "Ad creative", plural: "Ad creatives", noun: "ad creative", many: "ad creatives", one: "an ad creative", holds: "Ads that worked, with their images, video and copy, ready to adapt for another client." },
] as const;
type Kind = (typeof KINDS)[number];

const slug = (k: Kind) => `lib-${k.noun.replace(/\W+/g, "-")}`;

export function Library() {
  const { ws, open, openAsset } = useApp();
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");
  const all = ws.d.assets.filter((a) => !a.brandId);
  const t = q.trim().toLowerCase();
  const filtered = all.filter((a) => (tab === "All" || a.type === tab) && (!t || `${a.name} ${a.short} ${a.tags.join(" ")}`.toLowerCase().includes(t)));
  const shown = live(filtered);
  const sel = useSelection();
  // In select mode archived items join the list, so they can be restored in bulk too.
  const list = sel.on ? [...shown, ...archivedOnly(filtered)] : shown;
  const add = (type: string) => open({ kind: "asset", draft: { brandId: null, type, status: "Live", offerIds: [] }, step: 3 });
  const kind = KINDS.find((k) => k.type === tab);
  const has = (type: string) => live(all).some((a) => a.type === type);
  // A group per kind that has something in it; one kind when a pill is on.
  const groups = KINDS.filter((k) => tab === "All" || k === kind)
    .map((k) => ({ k, items: list.filter((a) => a.type === k.type) }))
    .filter((g) => g.items.length > 0);
  const row = (a: Asset) => <LibraryRow key={a.id} a={a} selecting={sel.on} selected={sel.sel.has(a.id)} onToggle={() => sel.toggle(a.id)} onOpen={() => openAsset(a.id)} />;
  // Many files at once, each its own library item: pictures and video as ad creatives, documents as templates.
  const canUpload = ws.can("library") && ws.can("edit") && ws.can("upload");
  const [adding, setAdding] = useState(false);
  const [dropped, setDropped] = useState<{ n: number; files: File[] }>({ n: 0, files: [] });
  const drop = useFileDrop(canUpload && !adding, (files) => { setDropped((d) => ({ n: d.n + 1, files })); setAdding(true); });

  return (
    <Page>
      <div {...drop.bind} className={cx("rounded-xl", drop.over && "outline-2 outline-offset-8 outline-accent outline-dashed")}>
        <DropHint show={drop.over} where="the Global Library" />
        <PageHead eyebrow="Shared across every client" title="Global Library" actions={(ws.can("library") || canBulk(ws, true)) && (
            <>
              {canBulk(ws, true) && all.length > 0 && <SelectToggle s={sel} />}
              {canUpload && <Btn aria-expanded={adding} onClick={() => { if (!adding) setDropped((d) => ({ n: d.n + 1, files: [] })); setAdding(!adding); }}><Upload aria-hidden className="h-4 w-4" />Upload files</Btn>}
              {ws.can("library") && <AddMenu label="Add to library" onPick={add} first={kind?.type} />}
            </>
          )}
          sub="Checklists, prompts, templates, SOPs and ad creatives for every client. Nothing here belongs to a brand: clone one into a brand when you run it."
        />
        {adding && <BulkUpload key={dropped.n} brandId={null} initialFiles={dropped.files} onClose={() => setAdding(false)} className="mb-6" />}
        {all.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <label className="relative block w-full max-w-[300px]">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute-2" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the library" aria-label="Search the library" className="field py-2 pl-9 text-body" />
            </label>
            {/* Every kind stays, as the library's categories; empty ones are quiet. The counts sit once, on the groups below. */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type">
              {[{ type: "All", plural: "All" }, ...KINDS].map((k) => {
                const on = tab === k.type;
                const empty = k.type !== "All" && !has(k.type);
                return (
                  <button key={k.type} type="button" aria-pressed={on} onClick={() => setTab(k.type)}
                    className={cx("min-h-8 rounded-full border px-3 py-1 text-body transition-colors duration-150",
                      on ? "border-accent bg-soft font-semibold text-accent"
                        : empty ? "border-dashed border-line-strong text-mute-2 hover:text-ink"
                          : "border-line bg-surface font-medium text-mute-1 hover:border-line-strong hover:text-ink")}>
                    {k.plural}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tab === "All" ? groups.length > 0 && (
          <div className="gap-x-5 lg:columns-2">
            {groups.map(({ k, items }) => (
              <section key={k.type} aria-labelledby={slug(k)} className="mb-6 break-inside-avoid">
                <h2 id={slug(k)} className="m-0 mb-2 flex items-baseline gap-2 text-body font-semibold text-ink">
                  {k.plural}<span className="text-meta font-normal tabular-nums text-mute-2">{items.length}</span>
                </h2>
                <KindList k={k} items={items} row={row} />
              </section>
            ))}
          </div>
        ) : kind && groups[0] && <KindList k={kind} items={groups[0].items} row={row} />}

        {!sel.on && <ArchExpander items={archivedOnly(filtered)} noun="item" onOpen={(a) => openAsset(a.id)} />}
        {sel.on && <BulkBar s={sel} shown={list} library />}
        {!list.length && (t ? (
          <Empty title="Nothing matches that search" body={`Try another word, or clear the search to see every ${kind ? kind.noun : "item"}.`}>
            <Btn onClick={() => setQ("")}>Clear the search</Btn>
          </Empty>
        ) : kind ? (
          <Empty title={`No ${kind.many} yet`} body={kind.holds}>
            {ws.can("library") && <Btn onClick={() => add(kind.type)}><Plus aria-hidden className="h-4 w-4" />Add {kind.one}</Btn>}
          </Empty>
        ) : (
          <Empty title="Nothing in the library yet" body="Checklists, prompts, templates, SOPs and ad creatives that every client can use live here, files included." />
        ))}
      </div>
    </Page>
  );
}

/** One kind's items as compact rows. Ad creatives with a picture keep their picture cards. */
function KindList({ k, items, row }: { k: Kind; items: Asset[]; row: (a: Asset) => ReactNode }) {
  const { ws } = useApp();
  const pictures = k.type === "Ad creative" ? items.filter((a) => ws.previewOf(a)) : [];
  const rows = items.filter((a) => !pictures.includes(a));
  return (
    <>
      {pictures.length > 0 && (
        <div className={cx("grid grid-cols-2 gap-3 sm:grid-cols-3", rows.length > 0 && "mb-3")}>
          {pictures.map((a) => <AssetCard key={a.id} a={a} variant="library" />)}
        </div>
      )}
      {rows.length > 0 && <Card className="overflow-hidden">{rows.map(row)}</Card>}
    </>
  );
}

/** One library item on one line: its code, its name and what it is for. */
function LibraryRow({ a, selecting, selected, onToggle, onOpen }: { a: Asset; selecting: boolean; selected: boolean; onToggle: () => void; onOpen: () => void }) {
  const { ws } = useApp();
  const meta = a.type === "Checklist" ? plural((a.items ?? []).length, "check") : a.type === "Prompt" ? a.promptFor : "";
  return (
    <button type="button" onClick={selecting ? onToggle : onOpen} {...(selecting && { role: "checkbox", "aria-checked": selected })}
      className={cx("focus-inset flex min-h-14 w-full items-center gap-3 border-t border-divider px-4 py-2 text-left transition-colors duration-150 first:border-t-0 hover:bg-hover", selected && "bg-soft", a.archived && "opacity-60")}>
      {selecting && <Tick on={selected} />}
      <CodeTile code={ws.codeOf(a)} color={ws.colorOf(a)} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-ink">{a.name}{a.archived && <span className="font-normal text-mute-2"> (archived)</span>}</span>
        {a.short && <span className="block truncate text-meta text-mute-2">{a.short}</span>}
      </span>
      {meta && <span className="hidden flex-none text-meta text-mute-2 sm:block">{meta}</span>}
    </button>
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
      <Btn ref={btn} variant="primary" onClick={toggle} aria-haspopup="menu" aria-expanded={on} aria-controls={on ? id : undefined}>
        <Plus aria-hidden className="h-4 w-4" />{label}<ChevronDown aria-hidden className={cx("h-4 w-4 transition-transform duration-150 ease-snap motion-reduce:transition-none", on && "rotate-180")} />
      </Btn>
      {at && createPortal(
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setAt(null)} />
          <div ref={menu} id={id} role="menu" aria-label="What to add" style={{ top: at.top, left: at.left, width: Math.min(MENU_W, window.innerWidth - 32) }}
            className="fixed z-[71] origin-top-right animate-pop rounded-lg border border-line bg-surface p-1.5 text-left shadow-pop">
            {kinds.map((k) => (
              <button key={k.type} type="button" role="menuitem" onClick={() => { setAt(null); onPick(k.type); }}
                className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-hover focus-visible:bg-hover focus-visible:outline-none">
                <span aria-hidden className="flex h-8 w-11 flex-none items-center justify-center rounded-lg bg-chip font-mono text-micro font-bold tracking-[0.05em] text-mute-1">{ASSET_TYPES[k.type]?.code}</span>
                <span className="min-w-0 flex-1 text-body font-medium text-ink">{k.type}</span>
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
