"use client";

import { deleteForever, restoreFromTrash } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { Btn, Card, Empty, Page, PageHead } from "@/components/ui";

type Entry = { id: string; kind: string; label: string; context: string; deletedBy: string | null; deletedAt: number; contains: string[] };

const KIND: Record<string, string> = { client: "Client", brand: "Brand", service: "Service", offer: "Offer", asset: "Asset", cta: "CTA", person: "Person", group: "Group" };

export function Trash({ entries, allowed, days }: { entries: Entry[]; allowed: boolean; days: number }) {
  const { ws, toast } = useApp();
  const [run, pending] = useAction();
  const left = (t: number) => Math.max(0, days - Math.floor((ws.d.now - t) / 86_400_000));
  return (
    <Page className="max-w-[860px]">
      <PageHead eyebrow="Deleted things" title="Recycle bin"
        actions={allowed && entries.length > 0 && (
          <Btn variant="danger" disabled={pending} onClick={() => { if (window.confirm("Delete everything in the bin for good? This cannot be undone.")) void run(deleteForever, "all"); }}>Empty the bin</Btn>
        )} />
      <p className="mb-7 mt-1 max-w-[62ch] text-[15px] text-mute-2">Anything deleted stays here for {days} days, with everything that was inside it. Restore puts it back exactly as it was.</p>
      {!allowed && <Empty title="Only admins can see the bin" body="Deleting and restoring is an admin job. Ask an admin if something went missing." />}
      {allowed && !entries.length && <Empty title="The bin is empty" body="Nothing has been deleted in the last 30 days." />}
      {allowed && entries.length > 0 && (
        <Card className="overflow-hidden">
          {entries.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-divider px-5 py-4 first:border-t-0">
              <span className="w-[72px] flex-none rounded-[5px] bg-chip px-2 py-1 text-center text-[12.5px] font-semibold text-mute-1">{KIND[e.kind] ?? e.kind}</span>
              <span className="min-w-[200px] flex-1">
                <span className="block text-[15px] font-semibold">{e.label}</span>
                <span className="block text-[13.5px] text-mute-2">
                  {[e.context, e.contains.join(", "), `deleted ${ws.ago(e.deletedAt)} by ${ws.first(e.deletedBy)}`].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="text-[13px] text-mute-3">{left(e.deletedAt)} days left</span>
              <Btn variant="primary" size="sm" disabled={pending} onClick={async () => { const r = await run(restoreFromTrash, e.id); if (r.ok) toast(`${e.label} is back`); }}>Restore</Btn>
              <button type="button" disabled={pending} onClick={() => { if (window.confirm(`Delete ${e.label} for good?`)) void run(deleteForever, e.id); }} className="text-[13px] text-danger hover:underline">Delete forever</button>
            </div>
          ))}
        </Card>
      )}
    </Page>
  );
}
