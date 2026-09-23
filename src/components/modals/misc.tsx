"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { onColor } from "@/lib/color";
import { parsePath } from "@/lib/routes";
import { deleteGroup, deleteItem } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { Btn } from "@/components/ui";
import { Footer, Modal } from "./frame";
import type { DeleteKind } from "./types";

/** "What do you need?" — pick the thing, the system works out where it belongs. */
export function NewModal() {
  const { ws, open } = useApp();
  const pathname = usePathname();
  const p = parsePath(pathname);
  const active =
    p.view === "brand" ? ws.brand(p.id) :
    p.view === "offer" ? ws.brand(ws.offer(p.id)?.brandId) :
    p.view === "service" ? ws.brand(ws.service(p.id)?.brandId) : null;
  const b = active ?? ws.d.brands.find((x) => !x.archived) ?? null;
  const offerHere = p.view === "offer" ? ws.offer(p.id) : null;
  const serviceHere = p.view === "service" ? ws.service(p.id) : null;
  const clientId = active?.clientId ?? (p.view === "client" ? p.id : undefined) ?? ws.d.clients.find((c) => !c.archived)?.id;

  const options = [
    b && { label: "A landing page, email or ad", sub: "A campaign asset that supports an offer", run: () => open({ kind: "asset", draft: { brandId: b.id, status: "Draft", offerIds: offerHere ? [offerHere.id] : [] }, step: 0 }) },
    b && { label: "An offer", sub: "Positioning, goals, promise and proof", run: () => open({ kind: "offer", draft: { brandId: b.id, serviceId: serviceHere?.id ?? null, segment: "All segments", status: "Ideation" } }) },
    b && { label: "A service", sub: "A capability you sell, positioned per segment", run: () => open({ kind: "service", draft: { brandId: b.id } }) },
    b && { label: "A goal", sub: "A broad outcome offers can chase", run: () => open({ kind: "goal", brandId: b.id }) },
    { label: "A checklist or prompt", sub: "Reusable process, kept in the Global Library", run: () => open({ kind: "asset", draft: { brandId: null, type: "Checklist", status: "Live", offerIds: [] }, step: 3 }) },
    b && { label: "A CTA", sub: "Reusable button with real colours", run: () => open({ kind: "cta", draft: { brandId: b.id, bg: b.primary, fg: onColor(b.primary), style: "solid" } }) },
    clientId && { label: "A brand", sub: "A new building under a client", run: () => open({ kind: "brand", draft: { clientId } }) },
    { label: "A client", sub: "A new property on the street", run: () => open({ kind: "client" }) },
  ].filter(Boolean) as { label: string; sub: string; run: () => void }[];

  return (
    <Modal title="What do you need?" sub={`Pick the thing you actually want. The system works out where it belongs.${b ? ` New work goes into ${b.name}.` : ""}`} bodyClass="gap-0 px-3.5 pb-4 pt-2">
      {options.map((o, i) => (
        <button key={o.label} type="button" data-autofocus={i === 0 ? "" : undefined} onClick={o.run} className="w-full rounded-[10px] p-3 text-left hover:bg-hover focus-visible:bg-hover">
          <span className="mb-0.5 block text-[14px] font-semibold">{o.label}</span>
          <span className="block text-[13px] text-mute-2">{o.sub}</span>
        </button>
      ))}
    </Modal>
  );
}

const CONFIRM_BODY: Record<DeleteKind, string> = {
  asset: "The asset is removed and every link to it disappears. The offers stay.",
  offer: "The offer is removed. Its assets stay in the library — only the links go.",
  service: "The service goes. Its offers survive and become standalone.",
  cta: "The button is removed from every offer and asset that used it.",
  person: "They lose access straight away. What they made stays.",
  group: "The group goes. People in it lose whatever it gave them.",
  brand: "Everything inside it goes too — sub-brands, services, offers, assets and CTAs. This cannot be undone.",
  client: "Everything inside it goes too — every brand, offer and asset. This cannot be undone.",
};

export function ConfirmModal({ item, id, label, back }: { item: DeleteKind; id: string; label: string; back?: string }) {
  const { close, closeAsset, assetId } = useApp();
  const router = useRouter();
  const [run, pending] = useAction();
  const go = async () => {
    const r = item === "group" ? await run(deleteGroup, id) : await run(deleteItem, item, id);
    if (!r.ok) return;
    close();
    if (item === "asset" && assetId === id) closeAsset();
    if (back) router.push(back);
  };
  return (
    <Modal title={`Delete ${label}?`} width={420} onSubmit={go} footer={<Footer saveLabel="Delete" pending={pending} saveVariant="danger-solid" />}>
      <div className="text-[14px] leading-[1.6] text-mute-1 text-pretty">{CONFIRM_BODY[item]}</div>
      {(item === "brand" || item === "client") && <div className="text-[13.5px] text-mute-3">If you might want it back, archive it instead.</div>}
    </Modal>
  );
}

const KEYS: [string, string][] = [
  ["⌘ K  or  /", "Search everything"],
  ["N", "Create something new"],
  ["I", "Open your queue"],
  ["G then S", "Go to the Street"],
  ["G then L", "Go to the Global Library"],
  ["G then T", "Go to the Team"],
  ["G then P", "Your settings"],
  ["Esc", "Close whatever is on top"],
  ["⌘ ↵", "Post a note"],
  ["?", "This list"],
];

export function ShortcutsModal() {
  const { close } = useApp();
  return (
    <Modal title="Keyboard shortcuts" width={440} footer={<Btn variant="primary" onClick={close}>Done</Btn>} bodyClass="gap-0 py-3">
      {KEYS.map(([k, v]) => (
        <div key={k} className="flex items-center gap-3 border-t border-divider py-2.5 first:border-t-0">
          <kbd className="w-[110px] flex-none font-mono text-[12.5px] font-semibold text-ink-3">{k}</kbd>
          <span className="text-[14px] text-mute-1">{v}</span>
        </div>
      ))}
    </Modal>
  );
}

export function InstallModal() {
  const { close } = useApp();
  return (
    <Modal title="Install BrandOS" sub="Put BrandOS on your home screen. It opens full screen, like any other app." width={440} footer={<Btn variant="primary" onClick={close}>Got it</Btn>}>
      <ol className="m-0 flex list-decimal flex-col gap-2.5 pl-5 text-[14px] leading-[1.5] text-ink-3">
        <li>Tap the <strong>Share</strong> button in Safari&apos;s toolbar (the square with an arrow).</li>
        <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
        <li>Tap <strong>Add</strong>. BrandOS appears next to your other apps.</li>
      </ol>
      <div className="text-[13px] text-mute-2">On Chrome or Edge, use the install icon in the address bar instead.</div>
    </Modal>
  );
}
