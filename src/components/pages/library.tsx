"use client";

import { useState } from "react";
import { archivedOnly, live } from "@/lib/ws";
import { useApp } from "@/components/app/provider";
import { AssetCard } from "@/components/cards";
import { ArchExpander, Btn, Empty, Page, PageHead, Pills } from "@/components/ui";

const TABS = [
  { value: "All", label: "All" },
  { value: "Checklist", label: "Checklists" },
  { value: "Prompt", label: "Prompts" },
  { value: "Template", label: "Templates" },
  { value: "SOP", label: "SOPs" },
];

export function Library() {
  const { ws, open, openAsset } = useApp();
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");
  const all = ws.d.assets.filter((a) => !a.brandId);
  const t = q.toLowerCase();
  const filtered = all.filter((a) => (tab === "All" || a.type === tab) && (!t || `${a.name} ${a.short} ${a.tags.join(" ")}`.toLowerCase().includes(t)));
  const shown = live(filtered);
  const upload = () => open({ kind: "asset", draft: { brandId: null, type: tab === "All" ? "SOP" : tab, status: "Live", offerIds: [] }, step: 3 });
  return (
    <Page>
      <PageHead eyebrow="Shared across every client" title="Global Library" actions={ws.can("library") && <Btn variant="dark" size="lg" onClick={upload}>+ Add to library</Btn>}
        sub={<>{live(all).length} shared items — checklists, prompts, templates and SOPs. Nothing here belongs to a brand, so nothing here is themed. Clone one into a brand when you actually run it.</>}
      />
      <div className="mb-3.5 flex items-center gap-2.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the library" aria-label="Search the library" className="field max-w-[280px] flex-1 text-[15px]" />
      </div>
      <Pills className="mb-[26px]" tone="dark" value={tab} onChange={setTab} options={TABS.map((x) => ({ ...x, count: live(all).filter((a) => x.value === "All" || a.type === x.value).length }))} />
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4">
        {shown.map((a) => <AssetCard key={a.id} a={a} variant="library" />)}
      </div>
      <ArchExpander items={archivedOnly(filtered)} noun="item" onOpen={(a) => openAsset(a.id)} />
      {!shown.length && (
        <Empty title="Nothing here" body={q ? "Nothing matches that search." : "Checklists, prompts, templates and SOPs live in the library."}>
          {ws.can("library") && <Btn variant="dark" size="lg" onClick={upload}>Add something</Btn>}
        </Empty>
      )}
    </Page>
  );
}
