"use client";

import { can } from "@/lib/access";
import { plural } from "@/lib/ws";
import { useApp } from "@/components/app/provider";
import { useBulk } from "@/components/bulk";
import { Avatar, Btn } from "@/components/ui";
import { Footer, Modal } from "./frame";

type Props = { ids: string[]; onDone?: (keep: string[]) => void };

/** Send many assets to one reviewer. Assets they own themselves are skipped. */
export function BulkReviewModal({ ids, onDone }: Props) {
  const { ws, close } = useApp();
  const [go, pending] = useBulk((keep) => onDone?.(keep));
  const people = ws.d.users.filter((u) => can(u, "review"));
  return (
    <Modal title="Who should review these?" sub={`${plural(ids.length, "asset")} selected. Anything they own themselves is skipped.`} width={440}
      footer={<Btn variant="ghost" onClick={close}>Cancel</Btn>} bodyClass="gap-0 px-3 pb-3.5 pt-2">
      {people.map((u) => (
        <button key={u.id} type="button" disabled={pending} onClick={async () => { if (await go(ids, "review", { reviewerId: u.id })) close(); }}
          className="flex w-full items-center gap-[11px] rounded-[10px] px-3 py-2.5 text-left hover:bg-hover disabled:opacity-60">
          <Avatar initials={u.initials} size={28} />
          <span className="flex-1">
            <span className="block text-[16px] font-semibold">{u.name}{u.id === ws.me.id ? " (you)" : ""}</span>
            <span className="block text-[15px] text-mute-2">{u.role} · {u.access}</span>
          </span>
          <span className="font-mono text-[13.5px] text-mute-4" title="Items already waiting on them">{ws.d.queueCounts[u.id] ?? 0} waiting</span>
        </button>
      ))}
      {!people.length && <div className="p-6 text-center text-[15px] text-mute-2">Nobody can review yet. Give someone Reviewer access on the Team page.</div>}
    </Modal>
  );
}

export function BulkDeleteModal({ ids, onDone }: Props) {
  const { close } = useApp();
  const [go, pending] = useBulk((keep) => onDone?.(keep));
  return (
    <Modal title={`Delete ${plural(ids.length, "asset")}?`} width={420} onSubmit={async () => { if (await go(ids, "delete")) close(); }}
      footer={<Footer saveLabel={`Delete ${ids.length}`} pending={pending} saveVariant="danger-solid" />}>
      <div className="text-[15px] leading-[1.6] text-mute-1 text-pretty">Each one is unlinked from its offers, and its notes and earlier versions go with it.</div>
      <div className="text-[14px] text-mute-3">They go to the recycle bin for 30 days, and an admin can restore them from there.</div>
    </Modal>
  );
}
