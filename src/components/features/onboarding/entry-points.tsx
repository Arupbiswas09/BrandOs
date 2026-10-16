"use client";

import Link from "next/link";
import { FileSpreadsheet, Globe, type LucideIcon } from "lucide-react";
import type { ImportKind } from "@/lib/import-plan";
import { useApp } from "@/components/app/provider";
import { cx } from "@/components/ui";

/*
 * Where people find onboarding from the rest of the app: the New menu,
 * the empty dashboard, and a quiet Import on a brand's Offers and Assets.
 */

export const fromWebsiteHref = (clientId?: string) => `/brands/new/from-website${clientId ? `?client=${encodeURIComponent(clientId)}` : ""}`;
export const importHref = (o: { brandId?: string; kind?: ImportKind; mode?: "sheet" | "drive"; offerId?: string } = {}) => {
  const q = new URLSearchParams();
  if (o.brandId) q.set("brand", o.brandId);
  if (o.kind && o.kind !== "offers") q.set("kind", o.kind);
  if (o.mode === "drive") q.set("mode", "drive");
  if (o.offerId) q.set("offer", o.offerId);
  const s = q.toString();
  return `/import${s ? `?${s}` : ""}`;
};

export type NewMenuLink = { key: string; label: string; hint: string; icon: LucideIcon; href: string };

/**
 * The two entries for the header's "+ New" menu, for what this person may do.
 * Inside a brand, the import goes to that brand; inside a client, the new brand goes under it.
 */
export function useOnboardingMenuItems(here: { brandId?: string | null; clientId?: string | null }): NewMenuLink[] {
  const { ws } = useApp();
  const out: NewMenuLink[] = [];
  if (ws.can("structure")) out.push({ key: "from-website", label: "Brand from a website", hint: "A draft kit from the brand's own site, for you to check", icon: Globe, href: fromWebsiteHref(here.clientId ?? undefined) });
  if (ws.can("edit") && ws.d.brands.some((b) => !b.archived)) {
    const b = ws.brand(here.brandId);
    out.push({ key: "import", label: "Import from a spreadsheet", hint: b ? `Offers or assets into ${b.name}, from a CSV or pasted rows` : "Offers or assets from a CSV or pasted rows", icon: FileSpreadsheet, href: importHref({ brandId: b?.id }) });
  }
  return out;
}

/** The quiet "Import" link for a brand's Offers or Assets tab, next to its own actions. */
export function ImportLink({ brandId, kind, className }: { brandId: string; kind: ImportKind; className?: string }) {
  const { ws } = useApp();
  if (!ws.can("edit")) return null;
  return (
    <Link href={importHref({ brandId, kind })} className={cx("inline-flex h-8 items-center rounded-lg px-2 text-meta font-medium text-mute-2 transition-colors duration-150 hover:bg-hover hover:text-ink", className)}>
      Import
    </Link>
  );
}

/** For a dashboard with nothing in it yet: two calm ways to start. */
export function StartFromExisting() {
  const { ws } = useApp();
  const items = [
    ws.can("structure") && { key: "site", icon: Globe, title: "Start a brand from its website", body: "Paste the address and get the logo, colours, fonts and services to check.", href: fromWebsiteHref() },
    ws.can("edit") && ws.d.brands.some((b) => !b.archived) && { key: "sheet", icon: FileSpreadsheet, title: "Import from a spreadsheet", body: "Bring in offers and assets you already track, from a CSV or pasted rows.", href: importHref() },
  ].filter(Boolean) as { key: string; icon: LucideIcon; title: string; body: string; href: string }[];
  if (!items.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((it) => (
        <Link key={it.key} href={it.href} className="group flex items-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors duration-150 hover:border-line-strong">
          <span aria-hidden className="flex size-8 flex-none items-center justify-center rounded-lg border border-line text-mute-2 group-hover:text-accent"><it.icon className="size-4" /></span>
          <span className="min-w-0">
            <span className="block text-body font-semibold text-ink">{it.title}</span>
            <span className="mt-0.5 block text-meta text-mute-2 text-pretty">{it.body}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
