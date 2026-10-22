"use client";

import { useRouter } from "next/navigation";
import { NEVER_DELETED_NOTE, neverDeleted } from "@/lib/access";
import type { WS } from "@/lib/ws";
import { deleteGroup, deleteItem } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { Btn } from "@/components/ui";
import { Footer, Modal } from "./frame";
import type { DeleteKind } from "./types";

/** What deleting each kind does. Clients, brands, services and offers are never deleted, so they have no entry. */
const CONFIRM_BODY: Partial<Record<DeleteKind, string>> = {
  asset: "The asset and its files are removed, and every link to it disappears. The offers stay.",
  cta: "The button is removed from every offer and asset that used it.",
  person: "They lose access straight away. What they made stays.",
  group: "The group goes. People in it lose whatever it gave them.",
};

/** Said once it is done: where it went and how to get it back, the same for every kind. */
function doneNote(item: DeleteKind, label: string, canOpenBin: boolean): string {
  const who = item === "person" ? "them" : "it";
  const back = canOpenBin ? `You can restore ${who} from the Recycle bin for 30 days.` : `An admin can restore ${who} from the Recycle bin for 30 days.`;
  return `${item === "person" ? `Removed ${label} from the team` : `Deleted ${label}`}. ${back}`;
}

export function ConfirmModal({ item, id, label, back }: { item: DeleteKind; id: string; label: string; back?: string }) {
  const { ws, close, closeAsset, assetId, toast } = useApp();
  const router = useRouter();
  const [run, pending] = useAction();
  const body = CONFIRM_BODY[item];
  // Anything that still asks to delete a client, brand, service or offer gets the rule instead of a Delete button.
  if (neverDeleted(item) || !body) {
    return (
      <Modal title={`${label} is never deleted`} width={420} footer={<Btn variant="primary" onClick={close}>Got it</Btn>}>
        <div className="text-body leading-[1.6] text-mute-1 text-pretty">{NEVER_DELETED_NOTE}</div>
      </Modal>
    );
  }
  const go = async () => {
    const r = item === "group" ? await run(deleteGroup, id) : await run(deleteItem, item, id);
    if (!r.ok) return;
    close();
    if (item === "asset" && assetId === id) closeAsset();
    if (back) router.push(back);
    // The Recycle bin is the way back, so the person is told it is there.
    toast(doneNote(item, label, ws.can("del")));
  };
  return (
    <Modal title={item === "person" ? `Remove ${label}?` : `Delete ${label}?`} width={420} onSubmit={go}
      footer={<Footer saveLabel={item === "person" ? "Remove" : "Delete"} pending={pending} saveVariant="danger-solid" />}>
      <div className="text-body leading-[1.6] text-mute-1 text-pretty">{body}</div>
      <div className="text-meta text-mute-3">It goes to the recycle bin for 30 days, and an admin can restore it from there.</div>
    </Modal>
  );
}

/** Every key, and who it does something for: a key that does nothing for this person is not listed. */
const KEYS: [string, string, ((ws: WS) => boolean)?][] = [
  ["⌘ K  or  /", "Search everything"],
  ["⌘ C", "Copy the link of the search result you are on"],
  // The New menu is there only for people who can create something.
  ["N", "Open the New menu", (ws) => ws.can("structure") || (ws.can("edit") && ws.d.brands.some((b) => !b.archived))],
  ["I", "Open your queue"],
  ["S", "Star or unstar this page"],
  ["[", "Fold or unfold the sidebar"],
  ["G then S", "Go to the Dashboard"],
  ["G then L", "Go to the Global Library"],
  ["G then T", "Go to Team and access", (ws) => ws.can("access")],
  ["G then C", "Go to Launches"],
  ["G then P", "Go to Settings"],
  ["Esc", "Close whatever is on top"],
  ["⌘ ↵", "Post a note", (ws) => ws.can("comment")],
  ["⌘ Z", "Undo a delete on the funnel board", (ws) => ws.can("edit")],
  ["?", "This list"],
];

export function ShortcutsModal() {
  const { ws, close } = useApp();
  return (
    <Modal title="Keyboard shortcuts" width={440} footer={<Btn variant="primary" onClick={close}>Done</Btn>} bodyClass="gap-0 py-2">
      {KEYS.filter(([, , who]) => !who || who(ws)).map(([k, v]) => (
        <div key={k} className="flex items-center gap-3 border-t border-divider py-2 first:border-t-0">
          <kbd className="w-[110px] flex-none font-mono text-meta font-semibold text-ink-3">{k}</kbd>
          <span className="text-body text-mute-1">{v}</span>
        </div>
      ))}
    </Modal>
  );
}

export function InstallModal() {
  const { close } = useApp();
  return (
    <Modal title="Install BrandOS" sub="Put BrandOS on your home screen. It opens full screen, like any other app." width={440} footer={<Btn variant="primary" onClick={close}>Got it</Btn>}>
      <ol className="m-0 flex list-decimal flex-col gap-2.5 pl-5 text-body leading-[1.5] text-ink-3">
        <li>Tap the <strong>Share</strong> button in Safari&apos;s toolbar (the square with an arrow).</li>
        <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
        <li>Tap <strong>Add</strong>. BrandOS appears next to your other apps.</li>
      </ol>
      <div className="text-body text-mute-2">On Chrome or Edge, use the install icon in the address bar instead.</div>
    </Modal>
  );
}
