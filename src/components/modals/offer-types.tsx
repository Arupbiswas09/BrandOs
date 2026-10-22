"use client";

import { useEffect, useRef, useState } from "react";
import { deleteOfferType, saveOfferType } from "@/app/actions";
import { offerTypesOf } from "@/lib/constants";
import { plural } from "@/lib/ws";
import { useAction, useApp } from "@/components/app/provider";
import { Btn, cx } from "@/components/ui";
import { Modal } from "./frame";

/** Why a type cannot be removed right now, or "" when it can. Archived offers count too, and the reason says so, since the type's count leaves them out. */
function removeBlock(type: string, types: string[], used: number, archived: number) {
  if (used && used === archived) return `${used === 1 ? "An archived offer still uses" : `${used} archived offers still use`} ${type}. Give ${used === 1 ? "it" : "them"} another type first: archived offers are listed at the foot of Offers.`;
  if (used) return `${plural(used, "offer")} still ${used === 1 ? "uses" : "use"} ${type}. Give ${used === 1 ? "it" : "them"} another type before removing it.`;
  if (types.length < 2) return "A brand needs at least one offer type. Add another before removing this one.";
  return "";
}

/**
 * Removes one of a brand's offer types. Stays visible but inert while offers
 * still use the type, with the reason on hover and for screen readers.
 */
export function RemoveOfferType({ brandId, type, className, onRemoved }: { brandId: string; type: string; className?: string; onRemoved?: () => void }) {
  const { ws } = useApp();
  const [run, pending] = useAction();
  const types = offerTypesOf(ws.brand(brandId));
  const using = ws.offersOf(brandId).filter((o) => o.offerType === type);
  const blocked = removeBlock(type, types, using.length, using.filter((o) => o.archived).length);
  const off = !!blocked || pending;
  return (
    <Btn
      size="sm"
      variant="danger"
      aria-disabled={off || undefined}
      title={blocked || undefined}
      onClick={async () => { if (off) return; const r = await run(deleteOfferType, brandId, type); if (r.ok) onRemoved?.(); }}
      className={cx("aria-disabled:cursor-not-allowed aria-disabled:opacity-50", className)}
    >
      Remove<span className="sr-only"> {type}</span>
    </Btn>
  );
}

/** Add, rename and remove a brand's offer types. Opened from the Strategy tab and the Services coverage grid. */
export function OfferTypesModal({ brandId, edit, add }: { brandId: string; edit?: string; add?: boolean }) {
  const { ws, close } = useApp();
  const [run, pending] = useAction();
  const [editing, setEditing] = useState<string | null>(edit ?? null);
  const [name, setName] = useState(edit ?? "");
  const [fresh, setFresh] = useState("");
  const freshRef = useRef<HTMLInputElement>(null);
  const editBtns = useRef(new Map<string, HTMLButtonElement>());
  // Where focus goes once the list re-renders: a row's Edit button, or the new-type field.
  const focusNext = useRef<string | null>(null);

  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    const el = target === "" ? freshRef.current : editBtns.current.get(target);
    if (el) { el.focus(); focusNext.current = null; }
  });

  useEffect(() => { if (add) freshRef.current?.focus(); }, [add]);

  const b = ws.brand(brandId);
  if (!b) return null;
  const types = offerTypesOf(b);
  const offers = ws.offersOf(brandId);
  const live = (t: string) => offers.filter((o) => o.offerType === t && !o.archived).length;

  const stopEditing = (focus: string) => { focusNext.current = focus; setEditing(null); };
  const rename = async () => {
    if (!editing) return;
    const nm = name.trim();
    if (!nm || nm === editing) return stopEditing(editing);
    const r = await run(saveOfferType, brandId, nm, editing);
    if (r.ok) stopEditing(nm);
  };
  const addType = async () => {
    const nm = fresh.trim();
    if (!nm) return;
    const r = await run(saveOfferType, brandId, nm);
    if (r.ok) { setFresh(""); freshRef.current?.focus(); }
  };

  return (
    <Modal
      title="Offer types"
      sub={`In ${b.name}. What an offer physically is. Renaming a type moves its offers with it.`}
      width={520}
      footer={<Btn variant="primary" onClick={close}>Done</Btn>}
      bodyClass="gap-3"
    >
      <ul aria-label={`Offer types in ${b.name}`} className="m-0 flex list-none flex-col gap-2 p-0">
        {types.map((t) => {
          const n = live(t);
          return (
            <li key={t} className="flex min-h-[48px] items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-1.5">
              {editing === t ? (
                <>
                  <input
                    autoFocus
                    aria-label={`New name for ${t}`}
                    className="field min-w-0 flex-1 py-1.5"
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); void rename(); }
                      if (e.key === "Escape") { e.stopPropagation(); stopEditing(t); }
                    }}
                  />
                  <Btn size="sm" variant="primary" disabled={pending || !name.trim()} onClick={rename}>Save</Btn>
                  <Btn size="sm" onClick={() => stopEditing(t)}>Cancel</Btn>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-body font-semibold">{t}</span>
                  <span className="flex-none text-meta font-medium" style={{ color: n ? "#46534D" : "#8A6A12" }}>{n ? plural(n, "offer") : "None yet"}</span>
                  <Btn
                    size="sm"
                    ref={(el) => { if (el) editBtns.current.set(t, el); else editBtns.current.delete(t); }}
                    onClick={() => { setEditing(t); setName(t); }}
                  >
                    Edit<span className="sr-only"> {t}</span>
                  </Btn>
                  <RemoveOfferType brandId={brandId} type={t} className="flex-none" onRemoved={() => { focusNext.current = ""; }} />
                </>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2">
        <input
          ref={freshRef}
          aria-label="New offer type"
          className="field min-w-0 flex-1"
          maxLength={80}
          placeholder="New type, e.g. Workshop"
          value={fresh}
          onChange={(e) => setFresh(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addType(); } }}
        />
        <Btn disabled={pending || !fresh.trim()} onClick={addType}>Add type</Btn>
      </div>
    </Modal>
  );
}
