"use client";

import { useState } from "react";
import { createShareLink, revokeShareLink } from "@/app/actions";
import { useAction, useApp } from "@/components/app/provider";
import { Btn, Hint } from "@/components/ui";
import { Modal } from "./frame";

export function ShareModal({ brandId }: { brandId: string }) {
  const { ws, close, toast } = useApp();
  const [run, pending] = useAction();
  const [label, setLabel] = useState("");
  const b = ws.brand(brandId);
  const links = ws.d.shareLinks.filter((l) => l.brandId === brandId);
  const cleared = ws.assetsOf(brandId).filter((a) => a.clientVisible && !a.archived);
  const unapproved = cleared.filter((a) => a.review !== "Approved").length;
  const url = (token: string) => `${window.location.origin}/share/${token}`;
  const copy = async (token: string) => {
    try { await navigator.clipboard.writeText(url(token)); toast("Link copied"); } catch { window.prompt("Copy this link", url(token)); }
  };
  const create = async () => {
    const r = await run(createShareLink, brandId, label || "Client link");
    if (r.ok && r.id) { setLabel(""); void copy(r.id); }
  };
  return (
    <Modal title="Share with the client" sub={`A private page showing the ${cleared.length} ${b?.name} asset${cleared.length === 1 ? "" : "s"} marked Cleared to send, with their copy and files. No login needed.`}
      width={560} footer={<Btn variant="primary" onClick={close}>Done</Btn>}>
      {unapproved > 0 && <Hint className="bg-[rgba(201,154,46,.08)] text-warn-ink">{unapproved} cleared asset{unapproved === 1 ? " has" : "s have"} not been approved yet. The client will still see {unapproved === 1 ? "it" : "them"}.</Hint>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <input className="field flex-1" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Who is it for? e.g. Rev. Hall, parish office" aria-label="Link label" />
        <Btn type="submit" variant="primary" size="lg" disabled={pending}>Create link</Btn>
      </form>
      {links.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-line">
          {links.map((l) => (
            <div key={l.token} className="flex items-center gap-3 border-t border-divider px-4 py-3 first:border-t-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{l.label || "Client link"}</span>
                <span className="block text-[11.5px] text-mute-3">
                  made {ws.ago(l.createdAt)} by {ws.first(l.createdBy)} · {l.views ? `opened ${l.views} time${l.views === 1 ? "" : "s"}, last ${ws.ago(l.lastViewedAt ?? l.createdAt)}` : "not opened yet"}
                </span>
              </span>
              <a href={`/share/${l.token}`} target="_blank" rel="noreferrer" className="flex-none text-[11.5px] text-mute-2 hover:text-ink">Preview</a>
              <Btn size="sm" onClick={() => copy(l.token)}>Copy</Btn>
              <button type="button" disabled={pending} onClick={() => run(revokeShareLink, l.token)} className="flex-none px-1 text-[11.5px] text-danger hover:underline">Revoke</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[12.5px] text-mute-3">No live links. Anyone with a link can open it until you revoke it.</div>
      )}
    </Modal>
  );
}
