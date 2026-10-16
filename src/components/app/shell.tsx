"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from "react";
import {
  BookOpen, CalendarDays, ChevronDown, ChevronRight, Download, Inbox as InboxIcon, Keyboard, LayoutDashboard, LogOut, Menu, Palette as PaletteIcon, Plus,
  PanelLeftClose, PanelLeftOpen, RotateCcw, Settings, ShieldCheck, Trash2, Users, X,
} from "lucide-react";
import { useStored } from "@/lib/stored";
import { BRAND_TABS, href, parsePath } from "@/lib/routes";
import { live } from "@/lib/ws";
import { onColor } from "@/lib/color";
import { resetDemo, signOut, switchUser } from "@/app/actions";
import { useAction, useApp } from "./provider";
import { PALETTE_KEYS, themeVars, type Palette, type Takeover } from "./theme";
import { Avatar, IconBtn, Mark, cx } from "@/components/ui";
import { AssetDrawer } from "@/components/drawer/asset-drawer";
import { HeaderSearch } from "./command-palette";
import { NewMenu } from "./new-menu";
import { Inbox, useOnYou } from "./inbox";
import { ModalHost } from "@/components/modals/host";
import { Toasts } from "./toasts";
import { Shortcuts } from "./shortcuts";
import { useInstall } from "./pwa";
import { LiveSync } from "./live";
import { useNavMode } from "./nav-mode";
import { Notifier } from "./notifier";

function useActiveBrand() {
  const { ws, assetId } = useApp();
  const pathname = usePathname();
  const p = parsePath(pathname);
  // The Global Library and the team page belong to no brand, so they are never themed.
  if (p.view === "library" || p.view === "team") return null;
  if (assetId) {
    const a = ws.asset(assetId);
    if (a?.brandId) return ws.brand(a.brandId);
  }
  if (p.view === "brand") return ws.brand(p.id);
  if (p.view === "offer") return ws.brand(ws.offer(p.id)?.brandId);
  if (p.view === "service") return ws.brand(ws.service(p.id)?.brandId);
  return null;
}

/**
 * How far a brand's colour takes over inside that brand. By default it leads:
 * header rule, primary buttons, a soft tint on the page and borders. Anyone
 * who picked a setting in this browser keeps it. Set in Settings → Appearance.
 */
export function useTakeover(): [Takeover, (t: Takeover) => void] {
  return useStored<Takeover>("bos.takeover", "bold", ["bold", "moderate", "off"]);
}

export function usePalette(): [Palette, (p: Palette) => void] {
  return useStored<Palette>("bos.palette", "petrol", PALETTE_KEYS);
}

/**
 * How many things are on you: the inbox's "On you", item for item. Shown in
 * exactly one place per screen size: the sidebar's "Your queue" on desktop,
 * the bottom bar's Inbox on phones and tablets.
 */
function useWaiting() {
  return useOnYou().length;
}

/** What a limited role can do, said once in the header so nobody wonders why a button is missing. */
const ROLE_NOTE: Partial<Record<string, string>> = {
  Reviewer: "Reviewer: approve, send back, comment",
  Viewer: "Viewer: read only",
  Contributor: "Contributor: edit your own work",
};

export function AppShell({ children }: { children: ReactNode }) {
  const brand = useActiveBrand();
  const [mode] = useTakeover();
  const [palette] = usePalette();
  const vars = themeVars(brand, mode, palette);
  const [navMode] = useNavMode();
  const mini = navMode === "mini";
  return (
    <div style={{ ...vars, background: "var(--bos-tint)" }} className="theme-fade min-h-screen" data-nav={navMode}>
      <Sidebar mini={mini} />
      <Header mini={mini} />
      <main className={cx("pt-header pb-mobile-nav [overflow-x:clip] transition-[margin] duration-200", mini ? "lg:ml-18" : "lg:ml-66")}>
        <Crumbs />
        {children}
      </main>
      <MobileNav />
      <AssetDrawer />
      <Inbox />
      <ModalHost />
      <Shortcuts />
      <LiveSync />
      <Notifier />
      <Toasts />
    </div>
  );
}

/* ================================================================ sidebar */

/** One sidebar row: 32px, 14px text, a tint of the accent when it is where you are. */
const itemCls = (active: boolean) =>
  cx(
    "group/nav flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-meta font-medium transition-colors duration-150",
    active ? "bg-hl text-hl-ink" : "text-mute-1 hover:bg-hover hover:text-ink",
  );

/** A quiet label over a group of rows. */
function NavLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pb-1 pt-5 text-micro font-medium text-mute-3">{children}</div>;
}

function Sidebar({ mini }: { mini: boolean }) {
  const { nav, setNav } = useApp();
  return (
    <>
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block"><SidebarBody mini={mini} /></div>
      {nav && (
        <div className="fixed inset-0 z-[65] lg:hidden">
          <div className="absolute inset-0 animate-fade bg-[rgba(16,22,20,.35)]" onClick={() => setNav(false)} />
          <div className="absolute inset-y-0 left-0 max-w-[88vw] animate-slide-left shadow-pop"><SidebarBody mini={false} drawer /></div>
        </div>
      )}
    </>
  );
}

type TipProps = {
  onMouseEnter: (e: MouseEvent<HTMLElement>) => void; onMouseLeave: () => void;
  onFocus: (e: FocusEvent<HTMLElement>) => void; onBlur: () => void;
};
type TipBind = (label: string) => Partial<TipProps>;

/**
 * Labels for the folded sidebar. The nav scrolls, which would clip a CSS
 * tooltip, so this one is placed with fixed coordinates beside the row.
 * The row keeps its own (screen-reader) name; the tip is only visual.
 */
function useMiniTip(on: boolean): [ReactNode, TipBind, () => void] {
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null);
  const hide = useCallback(() => setTip(null), []);
  const bind = useCallback<TipBind>((label) => {
    if (!on) return {};
    const show = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      setTip({ label, top: r.top + r.height / 2, left: r.right + 10 });
    };
    return { onMouseEnter: (e) => show(e.currentTarget), onMouseLeave: hide, onFocus: (e) => show(e.currentTarget), onBlur: hide };
  }, [on, hide]);
  const node = on && tip ? (
    <span aria-hidden className="pointer-events-none fixed z-[70] -translate-y-1/2 animate-fade whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-small font-medium text-white shadow-pop" style={{ top: tip.top, left: tip.left }}>
      {tip.label}
    </span>
  ) : null;
  return [node, bind, hide];
}

/** One nav row. When the sidebar is folded the label becomes a tooltip. */
function NavItem({ href: to, icon, label, name, active, mini, badge, onClick, dialog, tip }: { href?: string; icon: ReactNode; label: string; name?: string; active?: boolean; mini: boolean; badge?: ReactNode; onClick?: () => void; dialog?: boolean; tip: TipBind }) {
  const cls = cx(itemCls(!!active), "text-left", mini && "h-9 justify-center px-0");
  const body = (
    <>
      <span className={cx("relative flex flex-none [&>svg]:size-4", !active && "text-mute-3 group-hover/nav:text-ink")}>{icon}{mini && badge && <span className="absolute -right-2 -top-2">{badge}</span>}</span>
      {mini ? <span className="sr-only">{label}</span> : <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!mini && badge}
    </>
  );
  const tipProps = mini ? tip(label) : {};
  return to
    ? <Link href={to} className={cls} aria-current={active ? "page" : undefined} aria-label={name} {...tipProps}>{body}</Link>
    : <button type="button" onClick={onClick} className={cls} aria-label={name} aria-haspopup={dialog ? "dialog" : undefined} {...tipProps}>{body}</button>;
}

/**
 * "Your queue": what is on you. The label never changes; the count shows only
 * when something is waiting, tinted with the accent (never red). It opens
 * the inbox. On desktop this is the one place the count appears.
 */
function QueueNav({ mini, drawer, tip }: { mini: boolean; drawer?: boolean; tip: TipBind }) {
  const { inbox, setInbox, setNav } = useApp();
  const n = useWaiting();
  const badge = n > 0 && (mini
    ? <span aria-hidden className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-micro font-semibold leading-none tabular-nums text-on-accent ring-2 ring-surface theme-fade">{n}</span>
    : <span aria-hidden className="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-accent/12 px-1.5 text-micro font-semibold tabular-nums text-accent theme-fade">{n}</span>);
  return (
    <NavItem mini={mini} tip={tip} dialog active={inbox} icon={<InboxIcon />}
      label="Your queue" name={n ? `Your queue, ${n} waiting` : "Your queue"} badge={badge || undefined}
      onClick={() => { if (drawer) setNav(false); setInbox(true); }} />
  );
}

function SidebarBody({ mini, drawer }: { mini: boolean; drawer?: boolean }) {
  const { ws, open, setNav } = useApp();
  const pathname = usePathname();
  const p = parsePath(pathname);
  const [, setNavMode] = useNavMode();
  const [tipNode, tip, hideTip] = useMiniTip(mini);

  const activeBrandId = p.view === "brand" ? p.id : p.view === "offer" ? ws.offer(p.id)?.brandId : p.view === "service" ? ws.service(p.id)?.brandId : undefined;
  // Which section of the brand you are in; offers and services belong to their lists.
  const activeSection = p.view === "brand" ? (p.tab === "ctas" ? "kit" : p.tab ?? "home") : p.view === "offer" ? "offers" : p.view === "service" ? "services" : undefined;
  const brands = live(ws.d.brands);
  const clients = live(ws.d.clients).map((c) => ({ c, tops: brands.filter((b) => b.clientId === c.id && !b.parentId) }));

  const brandRow = (b: (typeof brands)[number], depth: number) => mini ? (
    <Link key={b.id} href={href.brand(b.id)} aria-current={activeBrandId === b.id ? "page" : undefined} {...tip(b.name)}
      className={cx("mx-auto flex size-8 items-center justify-center rounded-lg text-micro font-bold", activeBrandId === b.id && "ring-2 ring-accent ring-offset-2")}
      style={{ background: b.primary, color: onColor(b.primary) }}>
      {b.mark}<span className="sr-only"> {b.name}</span>
    </Link>
  ) : (
    <div key={b.id}>
      {/* When the brand is open its sections below carry the highlight; the brand itself just goes bold. */}
      <Link href={href.brand(b.id)} className={cx(itemCls(false), activeBrandId === b.id && "font-semibold text-ink")} style={{ paddingLeft: 10 + depth * 12 }}>
        <span aria-hidden className="size-2 flex-none rounded-sm" style={{ background: b.primary }} />
        <span className="min-w-0 flex-1 truncate">{b.name}</span>
      </Link>
      {/* The brand you are in shows its sections underneath. */}
      {activeBrandId === b.id && (
        <div className="my-0.5 flex flex-col gap-px" role="group" aria-label={`${b.name} sections`}>
          {BRAND_TABS.map(([k, label]) => (
            <Link key={k} href={href.brand(b.id, k)} aria-current={activeSection === k ? "page" : undefined}
              className={cx("flex h-7 items-center rounded-lg pr-2.5 text-meta transition-colors duration-150", activeSection === k ? "bg-hl font-medium text-hl-ink" : "text-mute-2 hover:bg-hover hover:text-ink")}
              style={{ paddingLeft: 28 + depth * 12 }}>
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <aside className={cx("safe-top flex h-full flex-col border-r border-line bg-surface transition-[width] duration-200", mini ? "w-18" : "w-66")}>
      <div className={cx("flex h-15 flex-none items-center border-b border-line", mini ? "justify-center px-2" : "justify-between pl-4 pr-3")}>
        <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="BrandOS, go to the Dashboard">
          <span aria-hidden className="flex size-7 items-center justify-center rounded-lg bg-accent text-meta font-bold text-on-accent theme-fade">B</span>
          {!mini && <span aria-hidden className="text-body font-semibold tracking-[-0.01em] text-ink">BrandOS</span>}
        </Link>
        {!mini && !drawer && (
          <IconBtn label="Collapse the sidebar" title="Collapse the sidebar ( [ )" onClick={() => setNavMode("mini")}><PanelLeftClose aria-hidden /></IconBtn>
        )}
        {drawer && <IconBtn label="Close navigation" onClick={() => setNav(false)}><X aria-hidden /></IconBtn>}
      </div>
      <nav data-scroll onScroll={hideTip} className={cx("flex-1 overflow-y-auto pb-3 pt-2", mini ? "px-3" : "px-2")} aria-label="Main">
        <div className="flex flex-col gap-px">
          <NavItem mini={mini} tip={tip} href="/" icon={<LayoutDashboard />} label="Dashboard" active={p.view === "street"} />
          <QueueNav mini={mini} drawer={drawer} tip={tip} />
          {/* Launch dates only: ClickUp and Asana own tasks and deadlines. */}
          <NavItem mini={mini} tip={tip} href="/calendar" icon={<CalendarDays />} label="Launches" active={p.view === "calendar"} />
          <NavItem mini={mini} tip={tip} href="/library" icon={<BookOpen />} label="Global Library" active={p.view === "library"} />
          {ws.can("access") && <NavItem mini={mini} tip={tip} href="/team" icon={<Users />} label="Team and access" active={p.view === "team"} />}
        </div>

        {mini ? <div aria-hidden className="mx-2 my-3 border-t border-line" /> : <NavLabel>Clients</NavLabel>}
        <div className={cx("flex flex-col", mini ? "gap-2" : "gap-px")}>
          {clients.map(({ c, tops }) => (
            <div key={c.id} className={mini ? "flex flex-col gap-2" : "flex flex-col gap-px"}>
              {!mini && (
                <Link href={href.client(c.id)} aria-current={p.view === "client" && p.id === c.id ? "page" : undefined}
                  className={cx(itemCls(p.view === "client" && p.id === c.id), "font-semibold", !(p.view === "client" && p.id === c.id) && "text-ink-3")}>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                </Link>
              )}
              {tops.map((b) => (
                <div key={b.id} className={mini ? "flex flex-col gap-2" : "flex flex-col gap-px"}>
                  {brandRow(b, 1)}
                  {brands.filter((x) => x.parentId === b.id).map((sb) => brandRow(sb, 2))}
                </div>
              ))}
            </div>
          ))}
          {ws.can("structure") && <NavItem mini={mini} tip={tip} icon={<Plus />} label="Add client" onClick={() => open({ kind: "client" })} />}
        </div>
      </nav>
      <div className={cx("safe-bottom flex flex-none flex-col gap-px border-t border-line py-2", mini ? "px-3" : "px-2")}>
        {ws.can("del") && <NavItem mini={mini} tip={tip} href="/trash" icon={<Trash2 />} label="Recycle bin" active={p.view === "trash"} />}
        {ws.can("access") && <NavItem mini={mini} tip={tip} href="/audit" icon={<ShieldCheck />} label="Audit log" active={p.view === "audit"} />}
        <NavItem mini={mini} tip={tip} href="/settings" icon={<Settings />} label="Settings" active={p.view === "settings"} />
        {mini && !drawer && <NavItem mini tip={tip} icon={<PanelLeftOpen />} label="Expand the sidebar" onClick={() => setNavMode("full")} />}
      </div>
      {tipNode}
    </aside>
  );
}

/* ================================================================ mobile bottom bar */

/**
 * Phones and tablets: the everyday destinations under the thumb. Menu opens
 * the full navigation; search lives in the header.
 */
function MobileNav() {
  const { inbox, setInbox, nav, setNav } = useApp();
  const p = parsePath(usePathname());
  const waiting = useWaiting();
  const item = (active: boolean) => cx("flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-micro font-medium transition-colors duration-150", active ? "text-ink" : "text-mute-3 hover:text-ink");
  const pill = (active: boolean) => cx("relative flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150 [&>svg]:size-5", active && "bg-hl text-hl-ink");
  return (
    <nav aria-label="Quick navigation" className="h-mobile-nav safe-bottom fixed inset-x-0 bottom-0 z-[34] border-t border-line bg-surface lg:hidden">
      <div className="mx-auto flex h-16 max-w-[560px] items-stretch gap-1 px-2 py-1.5">
        <Link href="/" className={item(p.view === "street")} aria-current={p.view === "street" ? "page" : undefined}>
          <span className={pill(p.view === "street")}><LayoutDashboard aria-hidden /></span>Dashboard
        </Link>
        <Link href="/calendar" className={item(p.view === "calendar")} aria-current={p.view === "calendar" ? "page" : undefined}>
          <span className={pill(p.view === "calendar")}><CalendarDays aria-hidden /></span>Launches
        </Link>
        <button type="button" onClick={() => setInbox(true)} aria-haspopup="dialog" className={item(inbox)}>
          <span className={pill(inbox)}>
            <InboxIcon aria-hidden />
            {waiting > 0 && <span aria-hidden className="absolute -top-1 right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-micro font-semibold leading-none tabular-nums text-on-accent ring-2 ring-surface theme-fade">{waiting}</span>}
          </span>
          Inbox{waiting > 0 && <span className="sr-only">, {waiting} waiting</span>}
        </button>
        <button type="button" onClick={() => setNav(true)} aria-expanded={nav} aria-haspopup="dialog" className={item(nav)}>
          <span className={pill(nav)}><Menu aria-hidden /></span>Menu
        </button>
      </div>
    </nav>
  );
}

/* ================================================================ header */

/**
 * Brand mark (inside a brand), search, "+ New" (the one primary action in the
 * chrome) and the user menu. The queue count lives in the sidebar on desktop
 * and in the bottom bar on smaller screens, so the header has no bell.
 */
function Header({ mini }: { mini: boolean }) {
  const { ws } = useApp();
  const brand = useActiveBrand();
  const [mode] = useTakeover();
  const themed = mode !== "off" ? brand : null;
  const me = ws.me;
  const readOnly = ROLE_NOTE[me.access];
  const [menu, setMenu] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) { setLastPath(pathname); setMenu(false); }
  const trigger = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback((refocus = true) => { setMenu(false); if (refocus) trigger.current?.focus(); }, []);

  return (
    <header className={cx("safe-top h-header fixed left-0 right-0 top-0 z-[35] flex items-center gap-2 border-b border-line bg-surface px-3 transition-[left] duration-200 sm:gap-3 sm:px-6", mini ? "lg:left-18" : "lg:left-66")}>
      {themed && <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 bg-accent theme-fade" />}
      {/* Phones and tablets have no sidebar, so the header carries the way home. */}
      {!themed && (
        <Link href="/" aria-label="BrandOS, go to the Dashboard" className="flex flex-none items-center rounded-lg lg:hidden">
          <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-accent text-meta font-bold text-on-accent theme-fade">B</span>
        </Link>
      )}
      {themed && <span aria-hidden title={themed.name} className="flex-none"><Mark mark={themed.mark} color={themed.primary} size={30} radius={8} className="text-micro" /></span>}
      <HeaderSearch />
      <span className="flex-1 max-sm:hidden" />
      {readOnly && (
        <span className="hidden flex-none rounded-sm bg-chip px-2 py-1 text-small font-medium text-mute-1 xl:inline">{readOnly}</span>
      )}
      <NewMenu />
      <div className="relative flex-none">
        <button ref={trigger} type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-haspopup="menu" aria-controls={menu ? "user-menu" : undefined}
          className="flex items-center gap-2 rounded-lg p-1 transition-colors duration-150 hover:bg-hover md:pr-2">
          <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-accent text-small font-semibold text-on-accent theme-fade">{me.initials}</span>
          {/* Read out at every size; seen from tablets up. */}
          <span className="sr-only text-left md:not-sr-only md:block">
            <span className="block text-meta font-semibold leading-tight text-ink">{me.name}</span>
            <span className="block text-small leading-tight text-mute-3">{me.role}</span>
          </span>
          <ChevronDown aria-hidden className="hidden size-4 text-mute-3 md:block" />
        </button>
        {menu && <UserMenu onClose={closeMenu} />}
      </div>
    </header>
  );
}

/**
 * Who you are and the few things about your own account: Settings (where the
 * colours and brand strength live), keyboard shortcuts, installing the app
 * and signing out. In the demo, switching teammate and resetting the data.
 */
function UserMenu({ onClose }: { onClose: (refocus?: boolean) => void }) {
  const { ws, open } = useApp();
  const [run] = useAction();
  const box = useRef<HTMLDivElement>(null);
  const me = ws.me;
  const demo = ws.d.authMode === "demo";
  // People with the old Client role cannot sign in, so they are not offered.
  const teammates = ws.d.users.filter((u) => u.access !== "Client");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const keys = (e: ReactKeyboardEvent) => {
    if (e.key === "Tab") { onClose(false); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const all = Array.from(box.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const i = all.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : (i + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length;
    all[next]?.focus();
  };

  const reset = () => { onClose(false); if (window.confirm("Reset the demo to its starting data?")) void run(resetDemo); };
  const row = "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-meta text-ink-3 outline-none transition-colors duration-100 hover:bg-hover focus-visible:bg-hover [&>svg]:size-4 [&>svg]:flex-none [&>svg]:text-mute-3";
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => onClose(false)} />
      <div ref={box} id="user-menu" role="menu" aria-label="Your account" onKeyDown={keys}
        className="absolute right-0 top-[calc(100%+6px)] z-50 w-72 origin-top-right animate-pop rounded-xl border border-line bg-surface p-1.5 shadow-pop">
        <div className="flex items-center gap-3 px-2.5 pb-2.5 pt-1.5">
          <span aria-hidden className="flex size-9 flex-none items-center justify-center rounded-full bg-accent text-meta font-semibold text-on-accent">{me.initials}</span>
          <span className="min-w-0">
            <span className="block truncate text-body font-semibold text-ink">{me.name}</span>
            <span className="block truncate text-small text-mute-3">{me.access}{me.email ? ` · ${me.email}` : ""}</span>
          </span>
        </div>
        <div className="mx-1 mb-1 h-px bg-divider" />
        <Link href="/settings" onClick={() => onClose(false)} className={row} role="menuitem"><Settings aria-hidden />Settings</Link>
        <Link href="/settings?section=appearance" onClick={() => onClose(false)} className={row} role="menuitem"><PaletteIcon aria-hidden /><span className="flex-1">Appearance</span><span className="text-small text-mute-3">In Settings</span></Link>
        <button type="button" role="menuitem" onClick={() => { onClose(false); open({ kind: "shortcuts" }); }} className={row}><Keyboard aria-hidden /><span className="flex-1">Keyboard shortcuts</span><kbd className="kbd">?</kbd></button>
        <InstallItem onDone={() => onClose(false)} className={row} />
        {demo && (
          <>
            <div className="mx-1 my-1 h-px bg-divider" />
            <div role="group" aria-label="View as a teammate">
              <div aria-hidden className="px-2.5 pb-1 pt-1.5 text-micro font-medium text-mute-3">View as a teammate</div>
              <div data-scroll className="max-h-56 overflow-y-auto">
                {teammates.map((u) => (
                  <button key={u.id} type="button" role="menuitem" onClick={() => { onClose(false); void run(switchUser, u.id); }} className={cx(row, "h-11", u.id === me.id && "bg-soft")}>
                    <Avatar initials={u.initials} size={24} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{u.name}</span><span className="block truncate text-small text-mute-3">{u.role} · {u.access}</span></span>
                  </button>
                ))}
              </div>
            </div>
            {/* Demo mode only. Production runs with passwords, where this never shows (and the server refuses it). */}
            <button type="button" role="menuitem" onClick={reset} className={row}><RotateCcw aria-hidden />Reset demo data</button>
          </>
        )}
        <div className="mx-1 my-1 h-px bg-divider" />
        <form action={signOut}>
          <button type="submit" role="menuitem" className={row}><LogOut aria-hidden />Sign out</button>
        </form>
        <p className="m-0 border-t border-divider px-2.5 pb-1 pt-2 text-micro text-mute-3">BrandOS · Developed by Arup</p>
      </div>
    </>
  );
}

function InstallItem({ onDone, className }: { onDone: () => void; className: string }) {
  const { canPrompt, standalone, ios, install } = useInstall();
  const { open } = useApp();
  if (standalone || (!canPrompt && !ios)) return null;
  return (
    <button type="button" role="menuitem" onClick={async () => { if (canPrompt) await install(); else { onDone(); open({ kind: "install" }); } }} className={className}>
      <Download aria-hidden />Install the app
    </button>
  );
}

/* ================================================================ breadcrumbs */

function useCrumbs() {
  const { ws } = useApp();
  const pathname = usePathname();
  const p = parsePath(pathname);
  return useMemo(() => {
    const out: { label: string; href?: string }[] = [];
    const street = { label: "Dashboard", href: "/" };
    const clientOf = (bid: string | undefined) => {
      const b = ws.brand(bid); const c = ws.client(b?.clientId);
      return c && b && c.name !== b.name ? { label: c.name, href: href.client(c.id) } : null;
    };
    switch (p.view) {
      case "street": return [];
      case "library": out.push(street, { label: "Global Library" }); break;
      case "team": out.push(street, { label: "Team and access" }); break;
      case "settings": out.push(street, { label: "Settings" }); break;
      case "calendar": out.push(street, { label: "Launches" }); break;
      case "trash": out.push(street, { label: "Recycle bin" }); break;
      case "audit": out.push(street, { label: "Audit log" }); break;
      case "client": out.push(street, { label: ws.client(p.id)?.name ?? "Client" }); break;
      case "brand": {
        const b = ws.brand(p.id);
        out.push(street);
        const c = clientOf(p.id); if (c) out.push(c);
        const parent = ws.brand(b?.parentId);
        if (parent) out.push({ label: parent.name, href: href.brand(parent.id) });
        const tab = BRAND_TABS.find(([k]) => k === p.tab);
        if (p.tab && p.tab !== "home" && tab) out.push({ label: b?.name ?? "Brand", href: href.brand(p.id!) }, { label: tab[1] });
        else out.push({ label: b?.name ?? "Brand" });
        break;
      }
      case "offer": {
        const o = ws.offer(p.id); const b = ws.brand(o?.brandId);
        out.push(street);
        const c = clientOf(o?.brandId); if (c) out.push(c);
        if (b) out.push({ label: b.name, href: href.brand(b.id) });
        const sv = ws.service(o?.serviceId);
        if (sv && b) out.push({ label: "Services", href: href.brand(b.id, "services") }, { label: sv.name, href: href.service(sv.id) });
        else if (b) out.push({ label: "Offers", href: href.brand(b.id, "offers") });
        out.push({ label: o?.name ?? "Offer" });
        break;
      }
      case "service": {
        const v = ws.service(p.id); const b = ws.brand(v?.brandId);
        out.push(street);
        const c = clientOf(v?.brandId); if (c) out.push(c);
        if (b) out.push({ label: b.name, href: href.brand(b.id) }, { label: "Services", href: href.brand(b.id, "services") });
        out.push({ label: v?.name ?? "Service" });
        break;
      }
      default: return [];
    }
    return out;
  }, [ws, p.view, p.id, p.tab]);
}

function Crumbs() {
  const crumbs = useCrumbs();
  if (!crumbs.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="border-b border-line bg-surface px-4 py-2 sm:px-8">
      <ol className="mx-auto flex max-w-[1180px] items-center gap-1.5 overflow-hidden text-meta">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={i} className={cx("flex min-w-0 items-center gap-1.5", !last && i < crumbs.length - 2 && "hidden sm:flex")}>
              {c.href && !last ? (
                <Link href={c.href} className="truncate text-mute-3 hover:text-ink">{c.label}</Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cx("truncate", last ? "font-medium text-ink" : "text-mute-3")}>{c.label}</span>
              )}
              {!last && <ChevronRight aria-hidden className="size-3.5 flex-none text-mute-3" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
