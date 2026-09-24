"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bell, BookOpen, CalendarDays, ChevronDown, ChevronRight, Download, Keyboard, LayoutDashboard, LogOut, Menu, Plus,
  PanelLeftClose, PanelLeftOpen, RotateCcw, Search, Settings, Trash2, Users,
} from "lucide-react";
import { useStored } from "@/lib/stored";
import { BRAND_TABS, href, parsePath } from "@/lib/routes";
import { live } from "@/lib/ws";
import { ACCESS_COLOR } from "@/lib/constants";
import { hexA, onColor, readable } from "@/lib/color";
import { resetDemo, signOut, switchUser } from "@/app/actions";
import { useAction, useApp } from "./provider";
import { PALETTES, PALETTE_KEYS, themeVars, type Palette, type Takeover } from "./theme";
import { Avatar, cx } from "@/components/ui";
import { AssetDrawer } from "@/components/drawer/asset-drawer";
import { CommandPalette } from "./command-palette";
import { Inbox } from "./inbox";
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
  if (assetId) {
    const a = ws.asset(assetId);
    if (a?.brandId) return ws.brand(a.brandId);
  }
  if (p.view === "brand") return ws.brand(p.id);
  if (p.view === "offer") return ws.brand(ws.offer(p.id)?.brandId);
  if (p.view === "service") return ws.brand(ws.service(p.id)?.brandId);
  return null;
}

export function useTakeover(): [Takeover, (t: Takeover) => void] {
  return useStored<Takeover>("bos.takeover", "off", ["bold", "moderate", "off"]);
}

export function usePalette(): [Palette, (p: Palette) => void] {
  return useStored<Palette>("bos.palette", "azure", PALETTE_KEYS);
}

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
      <main className={cx("pt-header [overflow-x:clip] transition-[margin] duration-200", mini ? "lg:ml-[72px]" : "lg:ml-[264px]")}>
        <Crumbs />
        {children}
      </main>
      <AssetDrawer />
      <CommandPalette />
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

const itemCls = (active: boolean) =>
  cx(
    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-[14.5px] font-medium transition-colors",
    active ? "bg-hl text-hl-ink" : "text-mute-1 hover:bg-hover hover:text-ink",
  );

function Sidebar({ mini }: { mini: boolean }) {
  const { nav, setNav } = useApp();
  return (
    <>
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block"><SidebarBody mini={mini} /></div>
      {nav && (
        <div className="fixed inset-0 z-[65] lg:hidden">
          <div className="absolute inset-0 animate-fade bg-[rgba(15,23,42,.35)]" onClick={() => setNav(false)} />
          <div className="absolute inset-y-0 left-0 animate-slide-left shadow-[16px_0_44px_rgba(15,23,42,.16)]"><SidebarBody mini={false} drawer /></div>
        </div>
      )}
    </>
  );
}

/** One nav row. When the sidebar is folded the label becomes a tooltip. */
function NavItem({ href: to, icon, label, active, mini, badge, onClick }: { href?: string; icon: ReactNode; label: string; active?: boolean; mini: boolean; badge?: ReactNode; onClick?: () => void }) {
  const cls = cx(itemCls(!!active), "text-left", mini && "justify-center px-0");
  const body = (
    <>
      <span className="relative flex flex-none">{icon}{mini && badge && <span className="absolute -right-1.5 -top-1.5">{badge}</span>}</span>
      {mini ? <span className="sr-only">{label}</span> : <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!mini && badge}
    </>
  );
  return to
    ? <Link href={to} className={cls} title={mini ? label : undefined} aria-current={active ? "page" : undefined}>{body}</Link>
    : <button type="button" onClick={onClick} className={cls} title={mini ? label : undefined}>{body}</button>;
}

function SidebarBody({ mini, drawer }: { mini: boolean; drawer?: boolean }) {
  const { ws, open } = useApp();
  const pathname = usePathname();
  const p = parsePath(pathname);
  const [run] = useAction();
  const [, setNavMode] = useNavMode();
  const overdueCount = useMemo(() => {
    const t = new Date(ws.d.now); const start = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return ws.dated().filter((x) => !x.done && x.dueAt < start).length;
  }, [ws]);

  const activeBrandId = p.view === "brand" ? p.id : p.view === "offer" ? ws.offer(p.id)?.brandId : p.view === "service" ? ws.service(p.id)?.brandId : undefined;
  const brands = live(ws.d.brands);
  const clients = live(ws.d.clients).map((c) => ({ c, tops: brands.filter((b) => b.clientId === c.id && !b.parentId) }));
  const ic = "h-[18px] w-[18px] flex-none";

  const brandRow = (b: (typeof brands)[number], depth: number) => mini ? (
    <Link key={b.id} href={href.brand(b.id)} title={b.name} aria-current={activeBrandId === b.id ? "page" : undefined}
      className={cx("mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-[11.5px] font-bold transition", activeBrandId === b.id ? "ring-2 ring-accent ring-offset-2" : "hover:scale-105")}
      style={{ background: b.primary, color: onColor(b.primary) }}>
      {b.mark}<span className="sr-only"> {b.name}</span>
    </Link>
  ) : (
    <Link key={b.id} href={href.brand(b.id)} className={cx(itemCls(activeBrandId === b.id), "py-1.5")} style={{ paddingLeft: 12 + depth * 14 }} aria-current={activeBrandId === b.id ? "page" : undefined}>
      <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: b.primary }} />
      <span className="min-w-0 flex-1 truncate">{b.name}</span>
    </Link>
  );

  const overdue = overdueCount > 0 && <span className="rounded-full bg-[#FEE4E2] px-1.5 text-[11.5px] font-semibold leading-[18px] text-[#B42318]" title={`${overdueCount} overdue`}>{overdueCount}</span>;

  return (
    <aside className={cx("safe-top flex h-full flex-col border-r border-line bg-white transition-[width] duration-200", mini ? "w-[72px]" : "w-[264px]")}>
      <div className={cx("flex h-16 flex-none items-center border-b border-line", mini ? "justify-center px-2" : "justify-between px-4")}>
        <Link href="/" className="flex items-center gap-2.5" title="BrandOS — Dashboard">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-[15px] font-bold text-on-accent theme-fade">B</span>
          {!mini && <span className="text-[16px] font-semibold tracking-[-0.01em] text-ink">BrandOS</span>}
        </Link>
        {!mini && !drawer && (
          <button type="button" onClick={() => setNavMode("mini")} aria-label="Collapse the sidebar" title="Collapse the sidebar ( [ )" className="flex h-8 w-8 items-center justify-center rounded-md text-mute-3 hover:bg-hover hover:text-ink">
            <PanelLeftClose className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
      <nav data-scroll className={cx("flex-1 overflow-y-auto py-3", mini ? "px-3" : "px-2")} aria-label="Main">
        <div className="flex flex-col gap-0.5">
          <NavItem mini={mini} href="/" icon={<LayoutDashboard className={ic} />} label="Dashboard" active={p.view === "street"} />
          <NavItem mini={mini} href="/calendar" icon={<CalendarDays className={ic} />} label="Calendar" active={p.view === "calendar"} badge={overdue || undefined} />
          {!ws.isGuest && <NavItem mini={mini} href="/library" icon={<BookOpen className={ic} />} label="Global Library" active={p.view === "library"} />}
          {!ws.isGuest && <NavItem mini={mini} href="/team" icon={<Users className={ic} />} label="Team and access" active={p.view === "team"} badge={mini ? undefined : <span className="text-[12.5px] text-mute-4">{ws.d.users.length}</span>} />}
        </div>

        {mini ? <div className="mx-2 my-4 border-t border-line" /> : <div className="eyebrow mb-1.5 mt-6 px-3">Clients</div>}
        <div className={cx("flex flex-col", mini ? "gap-2" : "gap-0.5")}>
          {clients.map(({ c, tops }) => (
            <div key={c.id} className={mini ? "flex flex-col gap-2" : "mb-1"}>
              {!mini && (
                <Link href={href.client(c.id)} className={cx(itemCls(p.view === "client" && p.id === c.id), "py-1.5 font-semibold text-ink-3")}>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                </Link>
              )}
              {tops.map((b) => (
                <div key={b.id} className={mini ? "flex flex-col gap-2" : undefined}>
                  {brandRow(b, 1)}
                  {brands.filter((x) => x.parentId === b.id).map((sb) => brandRow(sb, 2))}
                </div>
              ))}
            </div>
          ))}
          {ws.can("structure") && <NavItem mini={mini} icon={<Plus className={ic} />} label="Add client" onClick={() => open({ kind: "client" })} />}
        </div>
      </nav>
      <div className={cx("safe-bottom flex flex-none flex-col gap-0.5 border-t border-line py-2", mini ? "px-3" : "px-2")}>
        {ws.can("del") && <NavItem mini={mini} href="/trash" icon={<Trash2 className={ic} />} label="Recycle bin" active={p.view === "trash"} />}
        <NavItem mini={mini} href="/settings" icon={<Settings className={ic} />} label="Settings" active={p.view === "settings"} />
        {/* Demo mode only. Production runs with passwords, where this never shows (and the server refuses it). */}
        {ws.d.authMode === "demo" && (
          <NavItem mini={mini} icon={<RotateCcw className={ic} />} label="Reset demo data" onClick={() => { if (window.confirm("Reset the demo to its starting data?")) void run(resetDemo); }} />
        )}
        {mini && !drawer && (
          <NavItem mini icon={<PanelLeftOpen className={ic} />} label="Expand the sidebar" onClick={() => setNavMode("full")} />
        )}
        {!mini && <p className="m-0 px-3 pb-1 pt-2 text-[12px] text-mute-4">Developed by <span className="font-semibold text-mute-2">Arup</span></p>}
      </div>
    </aside>
  );
}

/* ================================================================ header */

function Header({ mini }: { mini: boolean }) {
  const { ws, open, setNav, setCmdk, setInbox } = useApp();
  const me = ws.me;
  const roleNote: Partial<Record<typeof me.access, string>> = {
    Reviewer: "Reviewer — approve, send back, comment",
    Viewer: "Viewer — read only",
    Contributor: "Contributor — edit your own work",
    Client: "Client — shared work only",
  };
  const readOnly = roleNote[me.access];
  // Same sources as the inbox: work assigned to me, plus mentions I have not read.
  const waiting = ws.queue().filter((q) => q.who === me.id).length + ws.d.unreadMentions.length;
  const [menu, setMenu] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) { setLastPath(pathname); setMenu(false); }

  return (
    <header className={`safe-top h-header fixed left-0 right-0 top-0 z-[35] flex items-center gap-3 border-b border-line bg-white px-3 transition-[left] duration-200 sm:px-6 ${mini ? "lg:left-[72px]" : "lg:left-[264px]"}`}>
      <button type="button" aria-label="Open navigation" onClick={() => setNav(true)} className="flex h-9 w-9 flex-none items-center justify-center rounded-md text-mute-1 hover:bg-hover lg:hidden">
        <Menu className="h-5 w-5" />
      </button>
      <button type="button" onClick={() => setCmdk(true)} className="flex h-10 min-w-0 max-w-2xl flex-1 items-center gap-2.5 rounded-md border border-line bg-wash px-3 text-left text-[14.5px] text-mute-4 transition hover:border-line-strong hover:bg-white">
        <Search className="h-[18px] w-[18px] flex-none text-mute-5" />
        <span className="min-w-0 flex-1 truncate">Search clients, brands, offers, assets…</span>
        <kbd className="hidden flex-none rounded border border-line bg-white px-1.5 text-[12px] font-medium text-mute-3 sm:inline">⌘K</kbd>
      </button>
      <span className="flex-1" />
      {readOnly && (
        <span className="hidden flex-none rounded-md px-2.5 py-1 text-[13px] font-semibold xl:inline" style={{ background: hexA(ACCESS_COLOR[me.access], 0.12), color: readable(ACCESS_COLOR[me.access], 0.12) }}>
          {readOnly}
        </span>
      )}
      {ws.can("edit") && (
        <button type="button" onClick={() => open({ kind: "new" })} className="flex h-10 flex-none items-center gap-2 rounded-md bg-accent px-4 text-[14.5px] font-semibold text-on-accent transition hover:brightness-110 theme-fade">
          <Plus className="h-4 w-4" /><span className="hidden sm:inline">New</span>
        </button>
      )}
      <button type="button" onClick={() => setInbox(true)} aria-label={waiting ? `Inbox, ${waiting} waiting` : "Inbox"} className="relative flex h-10 w-10 flex-none items-center justify-center rounded-md text-mute-1 hover:bg-hover">
        <Bell className="h-5 w-5" />
        {waiting > 0 && <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#E11D48] px-1 text-[11px] font-bold text-white">{waiting}</span>}
      </button>
      <div className="relative flex-none">
        <button type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-haspopup="menu" className="flex items-center gap-2 rounded-md p-1.5 hover:bg-hover">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-on-accent theme-fade">{me.initials}</span>
          <span className="hidden text-left md:block">
            <span className="block text-[14px] font-semibold leading-tight text-ink">{me.name}</span>
            <span className="block text-[12.5px] leading-tight text-mute-3">{me.role}</span>
          </span>
          <ChevronDown className="hidden h-4 w-4 text-mute-4 md:block" />
        </button>
        {menu && <UserMenu onClose={() => setMenu(false)} />}
      </div>
    </header>
  );
}

function UserMenu({ onClose }: { onClose: () => void }) {
  const { ws, open } = useApp();
  const [run] = useAction();
  const [mode, setMode] = useTakeover();
  const [palette, setPalette] = usePalette();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    box.current?.querySelector<HTMLElement>("button, a")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const me = ws.me;
  const row = "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[14px] text-ink-3 hover:bg-hover";
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div ref={box} role="menu" className="absolute right-0 top-[calc(100%+8px)] z-50 w-[300px] animate-pop rounded-lg border border-line bg-white p-1.5 shadow-[0_16px_40px_rgba(15,23,42,.14)]">
        <div className="flex items-center gap-3 px-3 pb-3 pt-2">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-accent text-[14px] font-semibold text-on-accent">{me.initials}</span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">{me.name}</span>
            <span className="block truncate text-[13px] text-mute-3">{me.email ?? me.role}</span>
          </span>
          <span className="ml-auto flex-none rounded px-1.5 py-0.5 text-[11.5px] font-semibold" style={{ background: hexA(ACCESS_COLOR[me.access], 0.12), color: readable(ACCESS_COLOR[me.access], 0.12) }}>{me.access}</span>
        </div>
        <div className="mx-1 mb-1 h-px bg-divider" />
        {ws.d.authMode === "demo" && (
          <>
            <div className="eyebrow px-3 pb-1 pt-2">View as a teammate</div>
            <div data-scroll className="max-h-[220px] overflow-y-auto">
              {ws.d.users.map((u) => (
                <button key={u.id} type="button" role="menuitem" onClick={() => { onClose(); void run(switchUser, u.id); }} className={cx(row, u.id === me.id && "bg-soft")}>
                  <Avatar initials={u.initials} size={26} />
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{u.name}</span><span className="block text-[12.5px] text-mute-3">{u.role} · {u.access}</span></span>
                  {(ws.d.queueCounts[u.id] ?? 0) > 0 && <span className="text-[12.5px] text-mute-3">{ws.d.queueCounts[u.id]}</span>}
                </button>
              ))}
            </div>
            <div className="mx-1 my-1 h-px bg-divider" />
          </>
        )}
        <div className="eyebrow px-3 pb-1.5 pt-2">Colours</div>
        <div className="flex gap-1.5 px-3 pb-2" role="radiogroup" aria-label="Colour set">
          {PALETTE_KEYS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={palette === k} title={`${PALETTES[k].name} — ${PALETTES[k].note}`} onClick={() => setPalette(k)}
              className={cx("flex h-8 flex-1 overflow-hidden rounded-md border-2", palette === k ? "border-ink" : "border-transparent")}>
              <span className="flex-[3]" style={{ background: PALETTES[k].accent }} /><span className="flex-[2]" style={{ background: PALETTES[k].hl }} />
            </button>
          ))}
        </div>
        <div className="flex gap-1 px-3 pb-2" role="radiogroup" aria-label="Brand colour intensity">
          {(["bold", "moderate", "off"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cx("flex-1 rounded-md border px-2 py-1 text-[12.5px] capitalize", mode === m ? "border-accent bg-soft font-semibold text-ink" : "border-line text-mute-2 hover:border-mute-4")}>
              {m === "off" ? "House blue" : m === "moderate" ? "Brand accent" : "Brand tint"}
            </button>
          ))}
        </div>
        <div className="mx-1 my-1 h-px bg-divider" />
        <Link href="/settings" onClick={onClose} className={row} role="menuitem"><Settings className="h-4 w-4 text-mute-3" />Settings</Link>
        <button type="button" role="menuitem" onClick={() => { onClose(); open({ kind: "shortcuts" }); }} className={row}><Keyboard className="h-4 w-4 text-mute-3" /><span className="flex-1">Keyboard shortcuts</span><kbd className="text-[12px] text-mute-4">?</kbd></button>
        <InstallItem onDone={onClose} className={row} />
        <form action={signOut}>
          <button type="submit" role="menuitem" className={row}><LogOut className="h-4 w-4 text-mute-3" />Sign out</button>
        </form>
      </div>
    </>
  );
}

function InstallItem({ onDone, className }: { onDone: () => void; className: string }) {
  const { canPrompt, standalone, ios, install } = useInstall();
  const { open } = useApp();
  if (standalone || (!canPrompt && !ios)) return null;
  return (
    <button type="button" role="menuitem" onClick={async () => { if (canPrompt) await install(); else { onDone(); open({ kind: "install" }); } }} className={cx(className, "font-medium text-accent")}>
      <Download className="h-4 w-4" />Install the app
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
      case "calendar": out.push(street, { label: "Calendar" }); break;
      case "trash": out.push(street, { label: "Recycle bin" }); break;
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
    <nav aria-label="Breadcrumb" className="border-b border-line bg-white px-4 py-2.5 sm:px-8">
      <ol className="mx-auto flex max-w-[1180px] items-center gap-1.5 overflow-hidden text-[13.5px]">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={i} className={cx("flex min-w-0 items-center gap-1.5", !last && i < crumbs.length - 2 && "hidden sm:flex")}>
              {c.href && !last ? (
                <Link href={c.href} className="truncate text-mute-3 hover:text-ink">{c.label}</Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cx("truncate", last ? "font-medium text-ink" : "text-mute-3")}>{c.label}</span>
              )}
              {!last && <ChevronRight className="h-3.5 w-3.5 flex-none text-mute-5" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

