"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import { Building2, FileText, Layers, Megaphone, Palette, Plus, type LucideIcon } from "lucide-react";
import type { ModalSpec } from "@/components/modals/types";
import { cx } from "@/components/ui";
import { useApp } from "./provider";
import { whereAmI } from "./here";

/** Anything that used to open the "What do you need?" chooser (the N key, search) opens this menu instead. */
export const NEW_MENU_EVENT = "bos:new-menu";

type Item = { key: string; label: string; hint: string; icon: LucideIcon; spec: ModalSpec };

/**
 * "+ New" in the header: a short menu of what this person may create. Inside
 * a brand, new offers, assets and services go to that brand; choosing one
 * opens its usual form.
 */
export function NewMenu() {
  const { ws, open } = useApp();
  const pathname = usePathname();
  const [shown, setShown] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const h = whereAmI(ws, pathname);
  const b = h.brand;
  const items: Item[] = [
    ...(b && ws.can("edit") ? [
      { key: "offer", label: "New offer", hint: "Positioning, goals, promise and proof", icon: Megaphone, spec: { kind: "offer", draft: { brandId: b.id, serviceId: h.service?.id ?? null, segment: "All segments", status: "Ideation" } } } as Item,
      { key: "asset", label: "New asset", hint: h.offer ? `A page, email, ad or file for ${h.offer.name}` : "A landing page, email, ad or file", icon: FileText, spec: { kind: "asset", draft: { brandId: b.id, status: "Draft", offerIds: h.offer ? [h.offer.id] : [] }, step: 0 } } as Item,
      { key: "service", label: "New service", hint: "A capability you sell, positioned per segment", icon: Layers, spec: { kind: "service", draft: { brandId: b.id } } } as Item,
    ] : []),
    ...(h.clientId && ws.can("structure") ? [{ key: "brand", label: "New brand", hint: `A brand or sub-brand under ${ws.client(h.clientId)?.name ?? "a client"}`, icon: Palette, spec: { kind: "brand", draft: { clientId: h.clientId } } } as Item] : []),
    ...(ws.can("structure") ? [{ key: "client", label: "New client", hint: "A new organisation you work for", icon: Building2, spec: { kind: "client" } } as Item] : []),
  ];

  const focusItem = (i: number) => {
    const nodes = list.current?.querySelectorAll<HTMLElement>("[role=menuitem]");
    if (!nodes?.length) return;
    nodes[(i + nodes.length) % nodes.length].focus();
  };
  const hide = (refocus = true) => { setShown(false); if (refocus) button.current?.focus(); };

  // Opened from elsewhere (the N key), the menu opens with its first item focused.
  useEffect(() => {
    const on = () => setShown(true);
    window.addEventListener(NEW_MENU_EVENT, on);
    return () => window.removeEventListener(NEW_MENU_EVENT, on);
  }, []);
  useEffect(() => {
    if (!shown) return;
    focusItem(0);
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setShown(false); };
    document.addEventListener("mousedown", down, true);
    return () => document.removeEventListener("mousedown", down, true);
  }, [shown]);
  // The menu closes when the page changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) { setLastPath(pathname); setShown(false); }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const nodes = Array.from(list.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const at = nodes.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); focusItem(at + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusItem(at - 1); }
    else if (e.key === "Home") { e.preventDefault(); focusItem(0); }
    else if (e.key === "End") { e.preventDefault(); focusItem(nodes.length - 1); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hide(); }
    else if (e.key === "Tab") setShown(false);
  };

  if (!items.length) return null;
  return (
    <div ref={wrap} className="relative flex-none">
      <button ref={button} type="button" aria-haspopup="menu" aria-expanded={shown} aria-controls={shown ? "new-menu" : undefined}
        onClick={() => setShown((v) => !v)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setShown(true); } }}
        className="flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-[14.5px] font-semibold text-on-accent transition hover:brightness-110 theme-fade">
        <Plus aria-hidden className="h-4 w-4" /><span className="sr-only sm:not-sr-only">New</span>
      </button>
      {shown && (
        <div ref={list} id="new-menu" role="menu" aria-label="New" onKeyDown={onKey}
          className="absolute right-0 top-full z-10 mt-1.5 w-[320px] max-w-[calc(100vw-24px)] animate-pop overflow-hidden rounded-xl border border-line bg-white p-1.5 shadow-[0_16px_48px_rgba(16,22,20,.18)]">
          {b && ws.can("edit") && <div aria-hidden className="eyebrow truncate px-2.5 pb-1 pt-1.5">New work goes into {b.name}</div>}
          {items.map((it) => (
            <button key={it.key} type="button" role="menuitem" tabIndex={-1}
              onClick={() => { hide(false); open(it.spec); }}
              className={cx("flex w-full items-center gap-3 rounded-[9px] px-2.5 py-2 text-left outline-none transition-colors duration-100 hover:bg-hover focus-visible:bg-soft focus:bg-soft")}>
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-line bg-white text-mute-2"><it.icon aria-hidden className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-medium leading-5 text-ink">{it.label}</span>
                <span className="block truncate text-[12.5px] leading-4 text-mute-2">{it.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
