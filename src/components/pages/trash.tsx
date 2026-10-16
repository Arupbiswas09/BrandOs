"use client";

import { Clock, RotateCcw, Trash2 } from "lucide-react";
import { deleteForever, restoreFromTrash } from "@/app/actions";
import { neverDeleted } from "@/lib/access";
import { useAction, useApp } from "@/components/app/provider";
import { Btn, Card, Empty, Page, PageHead, cx } from "@/components/ui";

type Entry = { id: string; kind: string; label: string; context: string; deletedBy: string | null; deletedAt: number; contains: string[] };

const KIND: Record<string, string> = { client: "Client", brand: "Brand", service: "Service", offer: "Offer", asset: "Asset", cta: "CTA", person: "Person", group: "Group" };

export function Trash({ entries, allowed, days }: { entries: Entry[]; allowed: boolean; days: number }) {
  const { ws, toast } = useApp();
  const [run, pending] = useAction();
  const left = (t: number) => Math.max(0, days - Math.floor((ws.d.now - t) / 86_400_000));
  // Clients, brands, services and offers from before they became undeletable can only be restored.
  const kept = entries.filter((e) => neverDeleted(e.kind)).length;
  const removable = entries.length - kept;
  const empty = async () => {
    const ask = kept
      ? "Delete everything else in the bin for good? Clients, brands, services and offers stay. This cannot be undone."
      : "Delete everything in the bin for good? This cannot be undone.";
    if (!window.confirm(ask)) return;
    const r = await run(deleteForever, "all");
    if (r.ok) toast(kept ? "Emptied. Clients, brands, services and offers stay until someone restores them." : "The bin is empty");
  };
  return (
    <Page className="max-w-[860px]">
      <PageHead eyebrow="Deleted things" title="Recycle bin"
        actions={allowed && removable > 0 && (
          <Btn variant="danger" disabled={pending} onClick={() => void empty()}><Trash2 aria-hidden className="h-4 w-4" />Empty the bin</Btn>
        )}
        sub={<>Deleted assets, CTAs, people and groups wait here for {days} days. Restore puts one back exactly as it was, files and notes included. Clients, brands, services and offers are never deleted: they are archived instead.</>}
      />
      {!allowed && <Empty title="Only admins can see the bin" body="Deleting and restoring is an admin job. Ask an admin if something went missing." />}
      {allowed && !entries.length && <Empty title="The bin is empty" body={`Nothing has been deleted in the last ${days} days.`} />}
      {allowed && entries.length > 0 && (
        <Card className="overflow-hidden">
          {entries.map((e) => {
            const keep = neverDeleted(e.kind);
            return (
              <div key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-divider px-5 py-3.5 transition-colors first:border-t-0 hover:bg-wash">
                <span className="eyebrow w-[84px] flex-none rounded-sm bg-chip px-2 py-1 text-center text-mute-1">{KIND[e.kind] ?? e.kind}</span>
                <span className="min-w-[200px] flex-1">
                  <span className="block text-body font-semibold">{e.label}</span>
                  <span className="block text-meta text-mute-2">
                    {[e.context, e.contains.join(", "), `deleted ${ws.ago(e.deletedAt)} by ${ws.first(e.deletedBy)}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className={cx("inline-flex items-center gap-1 text-small", left(e.deletedAt) <= 3 ? "font-semibold text-[#B42318]" : "text-mute-3")}><Clock aria-hidden className="h-3.5 w-3.5" />{left(e.deletedAt)} days left</span>
                <Btn variant="primary" size="sm" disabled={pending} aria-label={`Restore ${e.label}`} onClick={async () => { const r = await run(restoreFromTrash, e.id); if (r.ok) toast(`${e.label} is back`); }}><RotateCcw aria-hidden className="h-3.5 w-3.5" />Restore</Btn>
                {keep
                  ? <span className="px-1.5 py-1 text-small text-mute-3">Restore only</span>
                  : <button type="button" disabled={pending} aria-label={`Delete ${e.label} forever`} onClick={() => { if (window.confirm(`Delete ${e.label} for good? This cannot be undone.`)) void run(deleteForever, e.id); }} className="rounded-md px-1.5 py-1 text-small font-medium text-danger hover:underline">Delete forever</button>}
              </div>
            );
          })}
        </Card>
      )}
    </Page>
  );
}
