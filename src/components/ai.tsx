"use client";

import { useState, useTransition } from "react";
import { draftCopy, useCopy as applyCopy, type CopyOption } from "@/app/ai-actions";
import { useApp } from "@/components/app/provider";
import { Btn } from "@/components/ui";
import { Modal } from "@/components/modals/frame";

/** Opens a panel that drafts three copy options in the brand's voice. */
export function AiDraftButton({ assetId, label = "Draft with AI" }: { assetId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Btn variant="outline-accent" onClick={() => setOpen(true)}>✦ {label}</Btn>
      {open && <DraftPanel assetId={assetId} onClose={() => setOpen(false)} />}
    </>
  );
}

function DraftPanel({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const { ws, toast } = useApp();
  const a = ws.asset(assetId);
  const [steer, setSteer] = useState("");
  const [options, setOptions] = useState<CopyOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saving, startSave] = useTransition();

  const run = () => start(async () => {
    setError(null);
    const r = await draftCopy(assetId, steer);
    if (r.ok) setOptions(r.options); else setError(r.error);
  });
  const pick = (o: CopyOption) => startSave(async () => {
    const r = await applyCopy(assetId, o);
    if (r.ok) { toast("Copy saved as a new version"); onClose(); } else toast(r.error, "error");
  });

  return (
      <Modal onClose={onClose} title="Draft copy with AI" sub={`${a?.name} · written in ${ws.brand(a?.brandId)?.name}'s voice from the offers it supports. Nothing is saved until you pick one.`} width={680}
        footer={<><span className="flex-1 text-[14px] text-mute-4">The current copy is kept as an earlier version.</span><Btn onClick={onClose}>Close</Btn><Btn variant="primary" onClick={run} disabled={pending}>{pending ? "Writing…" : options ? "Try again" : "Write three options"}</Btn></>}
        bodyClass="max-h-[62vh] overflow-y-auto">
        <label className="block">
          <span className="label">Direction <span className="font-normal text-mute-4">optional</span></span>
          <input className="field" value={steer} onChange={(e) => setSteer(e.target.value)} placeholder="Shorter. Lead with the number. Aim at treasurers, not vicars." />
        </label>
        {error && <div role="alert" className="rounded-[9px] bg-[rgba(194,65,18,.07)] px-3 py-2 text-[15px] text-change-ink">{error}</div>}
        {pending && <div className="rounded-xl border border-dashed border-line-strong p-8 text-center text-[15px] text-mute-2">Reading the brief and writing… this takes a few seconds.</div>}
        {!pending && options?.map((o, i) => (
          <div key={i} className="rounded-xl border border-line p-4">
            <div className="mb-1.5 text-[16px] font-semibold leading-[1.4]">{o.headline}</div>
            <div className="mb-2 whitespace-pre-wrap text-[15px] leading-[1.6] text-ink-3">{o.body}</div>
            <div className="mb-3 text-[15px] font-semibold">CTA · {o.cta || "—"}</div>
            <div className="flex items-center gap-3 border-t border-divider pt-2.5">
              <span className="flex-1 text-[14.5px] italic text-mute-3">{o.why}</span>
              <Btn size="sm" variant="primary" disabled={saving} onClick={() => pick(o)}>Use this</Btn>
            </div>
          </div>
        ))}
      </Modal>
  );
}
