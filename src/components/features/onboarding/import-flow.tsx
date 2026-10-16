"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ImportResult } from "@/app/import-actions";
import { offerTypesOf } from "@/lib/constants";
import type { BrandFacts, ImportKind } from "@/lib/import-plan";
import { href } from "@/lib/routes";
import { useApp } from "@/components/app/provider";
import { Btn, Card, Empty, Field, Pills, Select } from "@/components/ui";
import { DriveImport } from "./drive-import";
import { SheetImport } from "./sheet-import";
import { StepTitle, plural } from "./parts";

/*
 * "Bring in existing offers and assets": from a spreadsheet (a .csv file or
 * pasted rows), or a list of Google Drive links. Pick the brand, check every
 * row, import. A true Google Drive folder import needs Google API
 * credentials on the server; pasted links work today.
 */

export type ImportMode = "sheet" | "drive";

export function ImportFlow({ brandId: initialBrand, kind: initialKind = "offers", mode: initialMode = "sheet", offerId }: {
  /** Pre-picks the brand (from a brand's Offers or Assets tab). */
  brandId?: string;
  kind?: ImportKind;
  mode?: ImportMode;
  /** Drive links mode: pre-picks the offer the links are linked to. */
  offerId?: string;
}) {
  const { ws } = useApp();
  const brands = useMemo(() => ws.d.brands.filter((b) => !b.archived), [ws]);
  const [brandId, setBrandId] = useState(initialBrand && brands.some((b) => b.id === initialBrand) ? initialBrand : "");
  const [mode, setMode] = useState<ImportMode>(initialMode);
  const [kind, setKind] = useState<ImportKind>(initialKind);
  const [done, setDone] = useState<Extract<ImportResult, { ok: true }> | null>(null);
  const [round, setRound] = useState(0);

  const brand = ws.brand(brandId);
  const facts: BrandFacts | null = useMemo(() => brand && {
    services: ws.servicesOf(brand.id).map((v) => ({ id: v.id, name: v.name, archived: v.archived })),
    segments: brand.segments.map((x) => x.name),
    offerTypes: offerTypesOf(brand),
    goals: brand.goals.map((g) => g.name),
    offers: ws.offersOf(brand.id).map((o) => ({ id: o.id, name: o.name })),
    assets: ws.assetsOf(brand.id).map((a) => ({ id: a.id, name: a.name, url: a.url })),
  }, [ws, brand]);
  const powers = useMemo(() => ({ shape: ws.can("structure") || ws.can("kit"), publish: ws.can("publish") }), [ws]);

  if (!ws.can("edit")) {
    return <Empty title="Your role cannot add work" body="Importing creates offers and assets, which needs a role that can edit. Ask an admin if you need it." />;
  }
  if (!brands.length) {
    return <Empty title="There are no brands yet" body="Imports go into a brand. Set one up first, then come back with the spreadsheet." />;
  }

  if (done && brand) return <Result r={done} brandName={brand.name} onMore={() => { setDone(null); setRound((n) => n + 1); }} />;

  const clientOf = (id: string) => ws.client(id)?.name;
  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <StepTitle n={1}>Where they go</StepTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand">
            <Select value={brandId} onChange={setBrandId}
              options={[{ value: "", label: "Choose a brand" }, ...brands.map((b) => {
                const c = clientOf(b.clientId);
                const parent = ws.brand(b.parentId);
                return { value: b.id, label: [parent?.name, b.name].filter(Boolean).join(" › ") + (c && c !== b.name && c !== parent?.name ? ` (${c})` : "") };
              })]} />
          </Field>
          <div>
            <div className="label">Bring in</div>
            <Pills label="Bring in" value={mode} onChange={setMode}
              options={[{ value: "sheet", label: "Rows from a spreadsheet" }, { value: "drive", label: "Google Drive links" }]} />
          </div>
        </div>
        {mode === "drive" && (
          <p className="mb-0 mt-4 max-w-[64ch] text-meta text-mute-2 text-pretty">
            Paste links to files and folders. Bringing in a whole Drive folder in one go needs Google access set up for this workspace, which an admin can ask for.
          </p>
        )}
      </Card>

      {brand && facts && (mode === "sheet"
        ? <SheetImport key={`s${brand.id}${round}`} brandId={brand.id} brandName={brand.name} facts={facts} powers={powers} kind={kind} onKind={setKind} onDone={setDone} />
        : <DriveImport key={`d${brand.id}${round}`} brandId={brand.id} brandName={brand.name} facts={facts} offers={ws.offersOf(brand.id).filter((o) => !o.archived).map((o) => ({ id: o.id, name: o.name }))} offerId={offerId} onDone={setDone} />)}
    </div>
  );
}

function Result({ r, brandName, onMore }: { r: Extract<ImportResult, { ok: true }>; brandName: string; onMore: () => void }) {
  const noun = r.kind === "offers" ? "offer" : "asset";
  const link = (id: string) => (r.kind === "offers" ? href.offer(id) : `${href.brand(r.brandId, "assets")}?asset=${id}`);
  const shown = r.created.slice(0, 12);
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="m-0 text-title font-semibold text-ink">Imported {plural(r.created.length, noun)} into {brandName}</h2>
      <p className="mb-0 mt-1.5 text-body text-mute-2 text-pretty">
        {[r.skipped ? `${plural(r.skipped, "row")} skipped.` : "Nothing was skipped.", r.added.length ? `Also added ${r.added.join(", ")}.` : ""].filter(Boolean).join(" ")}
      </p>
      <ul className="m-0 mt-4 list-none divide-y divide-divider rounded-lg border border-line p-0">
        {shown.map((c) => (
          <li key={c.id}><Link href={link(c.id)} className="block px-4 py-2.5 text-body font-medium text-ink hover:bg-hover">{c.name}</Link></li>
        ))}
      </ul>
      {r.created.length > shown.length && <p className="mb-0 mt-2 text-meta text-mute-2">and {r.created.length - shown.length} more.</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={href.brand(r.brandId, r.kind === "offers" ? "offers" : "assets")} className="inline-flex h-10 items-center rounded-lg border border-transparent bg-accent px-4 text-body font-semibold text-on-accent transition-[filter,transform] duration-150 ease-snap hover:brightness-110 active:scale-[0.97] theme-fade">
          Open {brandName}&apos;s {r.kind === "offers" ? "offers" : "assets"}
        </Link>
        <Btn variant="secondary" size="lg" onClick={onMore}>Import more</Btn>
      </div>
    </Card>
  );
}
