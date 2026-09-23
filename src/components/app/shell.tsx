"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useStored } from "@/lib/stored";
import { BRAND_TABS, href, parsePath } from "@/lib/routes";
import { live } from "@/lib/ws";
import { ACCESS_COLOR } from "@/lib/constants";
import { hexA, readable } from "@/lib/color";
import { resetDemo, signOut, switchUser } from "@/app/actions";
import { useAction, useApp } from "./provider";
import { themeVars, type Takeover } from "./theme";
import { Avatar, Mark, cx } from "@/components/ui";
import { AssetDrawer } from "@/components/drawer/asset-drawer";
import { CommandPalette } from "./command-palette";
import { Inbox } from "./inbox";
import { ModalHost } from "@/components/modals/host";
import { Toasts } from "./toasts";
import { Shortcuts } from "./shortcuts";
import { useInstall } from "./pwa";

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
  return useStored<Takeover>("bos.takeover", "bold", ["bold", "moderate", "off"]);
}

export function AppShell({ children }: { children: ReactNode }) {
  const brand = useActiveBrand();
  const [mode] = useTakeover();
  const vars = themeVars(brand, mode);
  return (
    <div
      style={{ ...vars, background: "linear-gradient(var(--bos-tint),var(--bos-tint)), #fff" }}
      className="theme-fade min-h-screen"
    >
      <Sidebar />
      <Header inBrand={!!brand && mode !== "off"} mark={brand?.mark ?? ""} />
      <main className="pt-header lg:ml-[288px]">{children}</main>
      <AssetDrawer />
      <CommandPalette />
      <Inbox />
      <ModalHost />
      <Shortcuts />
      <Toasts />
    </div>
  );
}

/* ================================================================ sidebar */

function navRow(active: boolean) {
  return active ? "bg-soft font-semibold text-ink" : "font-medium text-mute-1 hover:bg-hover";
}

function Sidebar() {
  const { ws, setCmdk, setInbox, nav, setNav, open } = useApp();
  const pathname = usePathname();
  const p = parsePath(pathname);
  const me = ws.me;
  const myQueue = ws.d.queueCounts[me.id] ?? 0;
  const unread = ws.d.unreadMentions.length;
  const [whoOpen, setWhoOpen] = useState(false);
  const overdueCount = useMemo(() => {
    const t = new Date(ws.d.now); const start = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return ws.dated().filter((x) => !x.done && x.dueAt < start).length;
  }, [ws]);
  const [run] = useAction();
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) { setLastPath(pathname); setWhoOpen(false); }

  const activeBrandId = p.view === "brand" ? p.id : p.view === "offer" ? ws.offer(p.id)?.brandId : p.view === "service" ? ws.service(p.id)?.brandId : undefined;
  const brands = live(ws.d.brands);

  const clients = live(ws.d.clients).map((c) => ({
    c,
    count: brands.filter((b) => b.clientId === c.id).length,
    tops: brands.filter((b) => b.clientId === c.id && !b.parentId),
  }));

  const tabs = (bid: string, indent: number) => (
    <div className="mb-[5px] mt-px">
      {BRAND_TABS.map(([key, label]) => {
        const on = p.view === "brand" && p.id === bid && p.tab === key;
        return (
          <Link
            key={key}
            href={href.brand(bid, key)}
            className={cx("block w-full border-l-2 py-[5px] pr-2.5 text-left text-[14.5px]", on ? "border-accent bg-soft font-semibold text-ink" : "border-[#E8EDEB] font-medium text-[#5C6A64] hover:text-ink")}
            style={{ paddingLeft: indent }}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );

  const content = (
    <aside className="safe-top flex h-full w-[288px] flex-col border-r border-line bg-white theme-fade">
      <div className="flex items-center gap-2.5 px-4 pb-3.5 pl-[18px] pt-5">
        <Link href="/" className="flex items-center gap-2.5 text-left">
          <Mark mark="B" color="var(--bos-accent)" fg="var(--bos-on)" size={26} radius={7} />
          <span className="text-[16px] font-semibold tracking-[-0.015em] text-ink">BrandOS</span>
        </Link>
      </div>
      <div className="px-3 pb-2.5">
        <button type="button" onClick={() => setCmdk(true)} className="flex w-full items-center gap-2 rounded-[9px] border border-line bg-[#FBFCFC] px-2.5 py-2 text-left text-[15px] text-[#566560] transition hover:border-line-strong hover:bg-white">
          <span className="flex-1">Search everything</span>
          <kbd className="font-mono text-[13.5px] tracking-[0.04em] text-mute-1">/</kbd>
        </button>
      </div>
      <div className="px-3 pb-2.5">
        <button type="button" onClick={() => setInbox(true)} className="flex w-full items-center gap-[9px] rounded-[9px] border border-line bg-white px-2.5 py-2 text-left text-[15px] font-medium text-ink-3 hover:border-mute-2">
          <span className="flex-1">{myQueue ? "Your queue" : unread ? "New mentions" : "Nothing on you"}</span>
          {unread > 0 && <span className="h-[7px] w-[7px] rounded-full bg-change" title={`${unread} unread mention${unread === 1 ? "" : "s"}`} />}
          <span className="flex h-[19px] min-w-[19px] items-center justify-center rounded-[10px] px-1.5 font-mono text-[13px] font-bold theme-fade" style={myQueue ? { background: "var(--bos-accent)", color: "var(--bos-on)" } : { background: "#E4EAE7", color: "#5C6A64" }}>
            {myQueue}
          </span>
        </button>
      </div>
      <nav data-scroll className="flex-1 overflow-y-auto px-3 pb-3 pt-1" aria-label="Main">
        <Link href="/" className={cx("mb-0.5 flex w-full items-center gap-[9px] rounded-lg px-2.5 py-[7px] text-[15px]", navRow(p.view === "street"))}>
          <span className="w-3.5 text-center text-[13.5px] opacity-55">◻</span><span>The Street</span>
        </Link>
        <Link href="/calendar" className={cx("mb-0.5 flex w-full items-center gap-[9px] rounded-lg px-2.5 py-[7px] text-[15px]", navRow(p.view === "calendar"))}>
          <span className="w-3.5 text-center text-[12px] opacity-55">◷</span><span className="flex-1">Calendar</span>
          {overdueCount > 0 && <span className="rounded-full bg-[rgba(180,35,24,.1)] px-1.5 font-mono text-[12px] font-semibold text-[#B42318]" title={`${overdueCount} overdue`}>{overdueCount}</span>}
        </Link>
        <Link href="/library" className={cx("mb-0.5 flex w-full items-center gap-[9px] rounded-lg px-2.5 py-[7px] text-[15px]", navRow(p.view === "library"))}>
          <span className="w-3.5 text-center text-[13.5px] opacity-55">◫</span><span>Global Library</span>
        </Link>
        <Link href="/team" className={cx("mb-4 flex w-full items-center gap-[9px] rounded-lg px-2.5 py-[7px] text-[15px]", navRow(p.view === "team"))}>
          <span className="w-3.5 text-center text-[13.5px] opacity-55">◐</span><span className="flex-1">Team</span>
          <span className="font-mono text-[13.5px] text-mute-4">{ws.d.users.length}</span>
        </Link>
        <div className="eyebrow px-2.5 pb-[7px] tracking-[0.11em]">Clients</div>
        {clients.map(({ c, count, tops }) => (
          <div key={c.id} className="mb-[3px]">
            <Link href={href.client(c.id)} className={cx("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[15px] font-semibold", p.view === "client" && p.id === c.id ? "bg-soft text-ink" : "text-mute-1 hover:bg-hover")}>
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-[13px] font-medium text-mute-4">{count}</span>
            </Link>
            {tops.map((b) => {
              const on = activeBrandId === b.id;
              const subs = brands.filter((x) => x.parentId === b.id);
              return (
                <div key={b.id}>
                  <Link href={href.brand(b.id)} className={cx("flex w-full items-center gap-[9px] rounded-lg py-1.5 pl-5 pr-2.5 text-[15px]", navRow(on))}>
                    <span className="h-[7px] w-[7px] flex-none rounded-[2px]" style={{ background: b.primary }} />
                    <span className="flex-1 truncate">{b.name}</span>
                  </Link>
                  {on && tabs(b.id, 36)}
                  {subs.map((sb) => {
                    const son = activeBrandId === sb.id;
                    return (
                      <div key={sb.id}>
                        <Link href={href.brand(sb.id)} className={cx("flex w-full items-center gap-[9px] rounded-lg py-1.5 pl-8 pr-2.5 text-[15px]", navRow(son))}>
                          <span className="h-[7px] w-[7px] flex-none rounded-[2px]" style={{ background: sb.primary }} />
                          <span className="flex-1 truncate">{sb.name}</span>
                        </Link>
                        {son && tabs(sb.id, 48)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
        {ws.can("edit") && (
          <button type="button" onClick={() => open({ kind: "client" })} className="mt-1.5 w-full rounded-lg px-2.5 py-[7px] text-left text-[15px] text-mute-2 hover:bg-chip hover:text-ink">+ Add client</button>
        )}
      </nav>
      <div className="safe-bottom relative flex items-center gap-[9px] border-t border-line px-3.5 py-[11px] theme-fade">
        <Avatar initials={me.initials} size={25} className="bg-[#E4EAE7] text-[#4A5A53]" />
        <button type="button" onClick={() => setWhoOpen((v) => !v)} aria-expanded={whoOpen} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[14.5px] font-semibold">{me.name} ⌄</span>
          <span className="flex items-center gap-1.5 text-[13px] text-mute-4">
            <span>{me.role}</span>
            <span className="rounded-[4px] px-1 font-mono text-[12px] font-bold" style={{ background: hexA(ACCESS_COLOR[me.access], 0.14), color: readable(ACCESS_COLOR[me.access]) }}>{me.access}</span>
          </span>
        </button>
        {ws.d.authMode === "demo" && (
          <button type="button" title="Reset demo data" onClick={() => run(resetDemo)} className="p-1 text-[13.5px] text-mute-5 hover:text-ink">Reset</button>
        )}
        {whoOpen && <WhoMenu onClose={() => setWhoOpen(false)} onSwitch={(id) => run(switchUser, id)} />}
      </div>
    </aside>
  );

  return (
    <>
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">{content}</div>
      {nav && (
        <div className="fixed inset-0 z-[65] lg:hidden">
          <div className="absolute inset-0 animate-fade bg-[rgba(16,22,20,.3)]" onClick={() => setNav(false)} />
          <div className="absolute inset-y-0 left-0 animate-slide-left shadow-[16px_0_44px_rgba(16,22,20,.12)]">{content}</div>
        </div>
      )}
    </>
  );
}

function WhoMenu({ onClose, onSwitch }: { onClose: () => void; onSwitch: (id: string) => void }) {
  const { ws, open } = useApp();
  const [mode, setMode] = useTakeover();
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-[58px] left-3 right-3 z-50 animate-pop rounded-xl border border-line bg-white p-1.5 shadow-[0_12px_32px_rgba(16,22,20,.14)]">
        {ws.d.authMode === "demo" && (
          <>
            <div className="eyebrow px-2.5 pb-[5px] pt-[7px] text-[12px] tracking-[0.11em]">Viewing as</div>
            <div data-scroll className="max-h-[300px] overflow-y-auto">
              {ws.d.users.map((u) => (
                <button key={u.id} type="button" onClick={() => { onClose(); onSwitch(u.id); }} className={cx("flex w-full items-center gap-[9px] rounded-lg px-2.5 py-[7px] text-left hover:bg-chip", u.id === ws.me.id && "bg-soft")}>
                  <Avatar initials={u.initials} size={22} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold">{u.name}</span>
                    <span className="block text-[13px] text-mute-4">{u.role} · {u.access}</span>
                  </span>
                  <span className="flex-none text-[13px] text-mute-2">{ws.d.queueCounts[u.id] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="my-1.5 h-px bg-divider" />
          </>
        )}
        <div className="px-2.5 pb-1 pt-1.5 text-[12px] eyebrow tracking-[0.11em]">Brand colours</div>
        <div className="flex gap-1 px-2 pb-1.5">
          {(["bold", "moderate", "off"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={cx("flex-1 rounded-md border px-2 py-1 text-[13.5px] capitalize", mode === m ? "border-accent bg-soft font-semibold text-ink" : "border-line text-mute-1 hover:border-mute-4")}>{m}</button>
          ))}
        </div>
        <button type="button" onClick={() => { onClose(); open({ kind: "shortcuts" }); }} className="flex w-full items-center rounded-lg px-2.5 py-[7px] text-left text-[14.5px] text-mute-1 hover:bg-chip">
          <span className="flex-1">Keyboard shortcuts</span><kbd className="font-mono text-[13px] text-mute-4">?</kbd>
        </button>
        <Link href="/settings" onClick={onClose} className="flex w-full items-center rounded-lg px-2.5 py-[7px] text-left text-[14.5px] text-mute-1 hover:bg-chip">Settings</Link>
        <InstallItem onDone={onClose} />
        <form action={signOut}>
          <button type="submit" className="w-full rounded-lg px-2.5 py-[7px] text-left text-[14.5px] text-mute-1 hover:bg-chip">Sign out</button>
        </form>
      </div>
    </>
  );
}

/* ================================================================ header */

function useCrumbs() {
  const { ws } = useApp();
  const pathname = usePathname();
  const p = parsePath(pathname);
  return useMemo(() => {
    const out: { label: string; href?: string }[] = [];
    const street = { label: "The Street", href: "/" };
    const clientOf = (bid: string | undefined) => {
      const b = ws.brand(bid); const c = ws.client(b?.clientId);
      return c && b && c.name !== b.name ? { label: c.name, href: href.client(c.id) } : null;
    };
    switch (p.view) {
      case "street": out.push({ label: "The Street" }); break;
      case "library": out.push(street, { label: "Global Library" }); break;
      case "team": out.push(street, { label: "Team" }); break;
      case "settings": out.push(street, { label: "Settings" }); break;
      case "calendar": out.push(street, { label: "Calendar" }); break;
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
      default: out.push(street);
    }
    return out;
  }, [ws, p.view, p.id, p.tab]);
}

function Header({ inBrand, mark }: { inBrand: boolean; mark: string }) {
  const { ws, open, setNav } = useApp();
  const crumbs = useCrumbs();
  const me = ws.me;
  const readOnly = !ws.can("edit");
  return (
    <header className="safe-top h-header fixed left-0 right-0 top-0 z-[35] flex items-center gap-3.5 border-b border-line bg-white/92 px-4 backdrop-blur-[10px] theme-fade sm:px-7 lg:left-[288px]">
      <div className="absolute inset-x-0 bottom-[-1px] h-0.5 bg-accent transition-opacity duration-300" style={{ opacity: inBrand ? 1 : 0 }} />
      <button type="button" aria-label="Open navigation" onClick={() => setNav(true)} className="-ml-1 flex h-8 w-8 flex-none items-center justify-center rounded-lg text-mute-1 hover:bg-hover lg:hidden">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
      {inBrand && <Mark mark={mark} color="var(--bos-accent)" fg="var(--bos-on)" size={24} radius={6} />}
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-[7px] overflow-hidden">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={i} className={cx("flex items-center gap-[7px]", last ? "min-w-0 flex-none" : "hidden min-w-0 shrink sm:flex")} style={last ? undefined : { flex: `0 ${Math.max(1, c.label.length - 6)} auto` }}>
              {c.href && !last ? (
                <Link href={c.href} className="block min-w-0 truncate text-[15px] font-medium tracking-[-0.005em] text-[#5C6A64] hover:text-ink">{c.label}</Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cx("block min-w-0 truncate text-[15px] tracking-[-0.005em]", last ? "font-semibold text-ink" : "font-medium text-[#5C6A64]")}>{c.label}</span>
              )}
              {!last && <span className="flex-none text-[13.5px] text-line-strong">/</span>}
            </span>
          );
        })}
      </nav>
      {!readOnly && (
        <button type="button" onClick={() => open({ kind: "new" })} className="flex-none rounded-lg bg-accent px-[13px] py-[7px] text-[15px] font-semibold text-on-accent transition hover:brightness-110 theme-fade">+ New</button>
      )}
      {readOnly && (
        <span className="hidden flex-none items-center gap-2 rounded-[7px] px-[11px] py-[5px] text-[14.5px] font-semibold md:flex" style={{ background: hexA(ACCESS_COLOR[me.access], 0.14), color: readable(ACCESS_COLOR[me.access]) }}>
          {me.access === "Reviewer" ? "Reviewer — you can approve, send back and comment, but not edit." : "Viewer — read only. Ask an admin if you need to change something."}
        </span>
      )}
    </header>
  );
}

function InstallItem({ onDone }: { onDone: () => void }) {
  const { canPrompt, standalone, ios, install } = useInstall();
  const { open } = useApp();
  if (standalone || (!canPrompt && !ios)) return null;
  return (
    <button type="button" onClick={async () => { if (canPrompt) await install(); else { onDone(); open({ kind: "install" }); } }}
      className="flex w-full items-center rounded-lg px-2.5 py-[7px] text-left text-[14.5px] font-semibold text-accent hover:bg-chip">
      <span className="flex-1">Install the app</span><span aria-hidden>↓</span>
    </button>
  );
}
