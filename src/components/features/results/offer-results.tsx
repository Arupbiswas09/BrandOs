"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Offer, OfferResult } from "@/db/schema";
import { removeResult, saveResult } from "@/app/results-actions";
import { useAction, useApp } from "@/components/app/provider";
import { Btn, Empty, Field, IconBtn, Pills, cx } from "@/components/ui";
import { fmtDate, fmtMonth } from "@/lib/format";
import { toDateInput } from "@/lib/time";
import { MAX_LESSON, MAX_PERIOD, count, money, newestFirst, pct, ratesOf, totalsOf, trendOf, trendText } from "@/lib/results";

/*
 * The "Results" tab of an offer: one row per period, newest first, with the
 * totals underneath, and a form that opens in place to record or correct a
 * period. Anyone who can change the offer can record results; only admins
 * remove a period.
 */

const DAY = 86_400_000;

/** Turns one cell into "Label ........ value" on phones, where the table becomes a stack of cards. */
const STACK = "max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-3 max-md:p-0 max-md:text-left max-md:before:text-meta max-md:before:font-normal max-md:before:text-mute-2 max-md:before:content-[attr(data-label)]";
const CELL = "px-4 py-3 align-top";
const NUM = cx(CELL, "whitespace-nowrap text-right tabular-nums", STACK);
const ROW = "border-t border-divider max-md:grid max-md:grid-cols-2 max-md:gap-x-6 max-md:gap-y-1.5 max-md:px-4 max-md:py-3.5";

export function OfferResults({ offer }: { offer: Offer }) {
  const { ws } = useApp();
  const [run, pending] = useAction();
  const rows = useMemo(() => newestFirst(ws.d.offerResults.filter((r) => r.offerId === offer.id)), [ws, offer.id]);
  const canEdit = ws.canChange(offer);
  const canRemove = ws.can("del");
  /** "new", or the id of the period being corrected. */
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const headingId = useId();

  const totals = totalsOf(rows);
  const trend = trendOf(rows);
  const showCpl = totals.hasSpend;
  const showActions = canEdit || canRemove;
  const cols = 6 + (showCpl ? 1 : 0) + (showActions ? 1 : 0);

  const open = (what: string) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRemoving(null);
    setEditing(what);
  };
  const close = () => {
    setEditing(null);
    setRemoving(null);
    // Back to the button that opened the form, if it is still there.
    requestAnimationFrame(() => { if (opener.current?.isConnected) opener.current.focus(); });
  };
  const askRemove = (id: string) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditing(null);
    setRemoving(id);
  };
  const remove = async (r: OfferResult) => {
    const res = await run(removeResult, r.id);
    if (res.ok) {
      setRemoving(null);
      opener.current = null;
    }
  };

  const form = (row?: OfferResult) => (
    <ResultForm key={row?.id ?? "new"} offer={offer} row={row} periods={rows.filter((x) => x.id !== row?.id).map((x) => x.period)} onDone={close} />
  );

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={headingId} className="m-0 text-lead font-semibold">Results</h2>
          <p className="m-0 mt-1 max-w-[68ch] text-meta text-mute-2 text-pretty">
            {trend ? trendText(trend) : "What this offer achieved after launch, period by period, and what the team learned."}
          </p>
        </div>
        {canEdit && rows.length > 0 && !editing && (
          <Btn variant="primary" size="sm" onClick={() => open("new")}><Plus aria-hidden size={16} />Record results</Btn>
        )}
      </div>

      {editing === "new" && <div className="mb-4">{form()}</div>}

      {!rows.length && editing !== "new" && (
        <Empty compact body="After launch, record the leads, calls booked and conversions for each period, with one lesson learned.">
          {canEdit && <Btn variant="primary" onClick={() => open("new")}><Plus aria-hidden size={16} />Record the first results</Btn>}
        </Empty>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <table className="w-full border-collapse text-left max-md:block">
            <caption className="sr-only">Results for {offer.name}, newest period first</caption>
            <thead className="max-md:sr-only">
              <tr className="bg-wash text-small font-semibold text-mute-2">
                <th scope="col" className="px-4 py-2.5 font-semibold">Period</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Leads</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Calls booked</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Conversions</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Conversion</th>
                {showCpl && <th scope="col" className="px-4 py-2.5 text-right font-semibold">Cost per lead</th>}
                <th scope="col" className="w-[38%] px-4 py-2.5 font-semibold">Lesson learned</th>
                {showActions && <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody className="max-md:block">
              {rows.map((r) => {
                const rate = ratesOf(r);
                const active = editing === r.id || removing === r.id;
                return (
                  <Fragment key={r.id}>
                  <tr className={cx(ROW, "first:border-t-0 md:first:border-t", active && "bg-soft")}>
                    <th scope="row" className={cx(CELL, "text-left font-normal max-md:p-0 max-md:pb-1", showActions ? "max-md:col-start-1 max-md:row-start-1" : "max-md:col-span-2")}>
                      <span className="block text-body font-medium text-ink">{r.period}</span>
                      {r.endedOn && <span className="block text-small text-mute-2">Ended {fmtDate(r.endedOn, { short: true, now: ws.d.now })}</span>}
                    </th>
                    <td data-label="Leads" className={NUM}>{count(r.leads)}</td>
                    <td data-label="Calls booked" className={NUM}>{count(r.calls)}</td>
                    <td data-label="Conversions" className={NUM}>{count(r.conversions)}</td>
                    <td data-label="Conversion" className={cx(NUM, "font-semibold text-ink")}>{pct(rate.conversion)}</td>
                    {showCpl && <td data-label="Cost per lead" className={NUM}>{money(rate.costPerLead)}</td>}
                    <td className={cx(CELL, "text-meta leading-[1.5] text-ink-3 text-pretty max-md:col-span-2 max-md:p-0 max-md:pt-1.5", !r.lesson && "max-md:hidden")}>
                      {r.lesson || <span className="text-mute-2">No lesson written</span>}
                    </td>
                    {showActions && (
                      <td className={cx(CELL, "py-2 text-right max-md:col-start-2 max-md:row-start-1 max-md:-mr-1.5 max-md:-mt-1 max-md:flex max-md:items-start max-md:justify-end max-md:p-0")}>
                        <span className="inline-flex gap-0.5">
                          {canEdit && <IconBtn size="sm" label={`Edit results for ${r.period}`} aria-expanded={editing === r.id} onClick={() => (editing === r.id ? close() : open(r.id))}><Pencil /></IconBtn>}
                          {canRemove && <IconBtn size="sm" label={`Remove results for ${r.period}`} aria-expanded={removing === r.id} className="hover:text-danger" onClick={() => (removing === r.id ? close() : askRemove(r.id))}><Trash2 /></IconBtn>}
                        </span>
                      </td>
                    )}
                  </tr>
                  {editing === r.id && (
                    <tr className="max-md:block">
                      <td colSpan={cols} className="bg-soft px-3 pb-3 max-md:block">{form(r)}</td>
                    </tr>
                  )}
                  {removing === r.id && (
                    <tr className="max-md:block">
                      <td colSpan={cols} className="bg-soft px-3 pb-3 max-md:block">
                        <ConfirmRemove period={r.period} pending={pending} onRemove={() => void remove(r)} onKeep={close} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
            {rows.length > 1 && (
              <tfoot className="max-md:block">
                <tr className={cx(ROW, "border-line bg-wash max-md:border-t")}>
                  <th scope="row" className={cx(CELL, "text-left font-normal max-md:col-span-2 max-md:p-0 max-md:pb-1")}>
                    <span className="block text-body font-semibold text-ink">Total</span>
                    <span className="block text-small text-mute-2">{totals.periods} periods</span>
                  </th>
                  <td data-label="Leads" className={cx(NUM, "font-semibold text-ink")}>{count(totals.leads)}</td>
                  <td data-label="Calls booked" className={cx(NUM, "font-semibold text-ink")}>{count(totals.calls)}</td>
                  <td data-label="Conversions" className={cx(NUM, "font-semibold text-ink")}>{count(totals.conversions)}</td>
                  <td data-label="Conversion" className={cx(NUM, "font-semibold text-ink")}>{pct(totals.conversion)}</td>
                  {showCpl && <td data-label="Cost per lead" className={cx(NUM, "font-semibold text-ink")}>{money(totals.costPerLead)}</td>}
                  <td className={cx(CELL, "max-md:hidden")} />
                  {showActions && <td className={cx(CELL, "max-md:hidden")} />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
}

function ConfirmRemove({ period, pending, onRemove, onKeep }: { period: string; pending: boolean; onRemove: () => void; onKeep: () => void }) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => { keep.current?.focus(); }, []);
  return (
    <div role="group" aria-label={`Remove the results for ${period}`} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-lg border border-line bg-surface px-4 py-3"
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onKeep(); } }}>
      <span className="min-w-[200px] flex-1 text-body text-ink">Remove the results for {period}? This cannot be undone.</span>
      <span className="flex gap-2">
        <Btn variant="danger" size="sm" disabled={pending} onClick={onRemove}>Remove</Btn>
        <Btn ref={keep} variant="ghost" size="sm" onClick={onKeep}>Keep</Btn>
      </span>
    </div>
  );
}

/* ================================================================ the form */

type Preset = "this" | "last" | "launch" | "custom";
const PRESETS: { value: Preset; label: string }[] = [
  { value: "this", label: "This month" },
  { value: "last", label: "Last month" },
  { value: "launch", label: "Launch week" },
  { value: "custom", label: "Custom" },
];

/** What a preset fills in: the period's name and the day it ended. */
function presetValue(p: Preset, now: number, offer: Offer): { period: string; endedOn: string } | null {
  const today = new Date(now);
  if (p === "this") return { period: fmtMonth(today), endedOn: toDateInput(today) };
  if (p === "last") {
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { period: fmtMonth(end), endedOn: toDateInput(end) };
  }
  if (p === "launch") {
    // The week from the launch date; without one, the week up to today.
    const end = offer.dueAt ? new Date(new Date(offer.dueAt).getTime() + 6 * DAY) : today;
    return { period: "Launch week", endedOn: toDateInput(end) };
  }
  return null;
}

type Bad = "bad";
/** A whole number, allowing "1,234" and spaces; empty is "not recorded". */
function parseCount(v: string): number | null | Bad {
  const s = v.replace(/[\s,'’]/g, "");
  if (!s) return null;
  return /^\d+$/.test(s) ? Number(s) : "bad";
}
/** An amount: "1,234.50" or a European "12,50". */
function parseMoney(v: string): number | null | Bad {
  let s = v.replace(/\s/g, "");
  if (!s) return null;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : "bad";
}

type Fields = "period" | "leads" | "calls" | "conversions" | "spend";

function ResultForm({ offer, row, periods, onDone }: { offer: Offer; row?: OfferResult; periods: string[]; onDone: () => void }) {
  const { ws, toast } = useApp();
  const [run, pending] = useAction();
  const now = ws.d.now;
  const first: Preset = new Date(now).getDate() <= 7 ? "last" : "this";
  const start = row ? null : presetValue(first, now, offer);
  const [preset, setPreset] = useState<Preset>(row ? "custom" : first);
  const [period, setPeriod] = useState(row?.period ?? start?.period ?? "");
  const [endedOn, setEndedOn] = useState(row ? toDateInput(row.endedOn) : start?.endedOn ?? "");
  const [leads, setLeads] = useState(row?.leads != null ? String(row.leads) : "");
  const [calls, setCalls] = useState(row?.calls != null ? String(row.calls) : "");
  const [conversions, setConversions] = useState(row?.conversions != null ? String(row.conversions) : "");
  const [spend, setSpend] = useState(row?.spend != null && row.spend > 0 ? String(row.spend) : "");
  const [lesson, setLesson] = useState(row?.lesson ?? "");
  const [tried, setTried] = useState(false);
  const periodRef = useRef<HTMLInputElement>(null);
  const leadsRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  // Focus once, when the form opens; later snapshots must not pull focus away from what is being typed.
  const correcting = !!row;
  useEffect(() => { (correcting ? periodRef : leadsRef).current?.focus(); }, [correcting]);

  const n = { leads: parseCount(leads), calls: parseCount(calls), conversions: parseCount(conversions), spend: parseMoney(spend) };
  const errors: Partial<Record<Fields, string>> = {};
  if (!period.trim()) errors.period = "Say which period these numbers cover.";
  if (n.leads === "bad") errors.leads = "Leads must be a whole number.";
  if (n.calls === "bad") errors.calls = "Calls booked must be a whole number.";
  if (n.conversions === "bad") errors.conversions = "Conversions must be a whole number.";
  if (n.spend === "bad") errors.spend = "Spend must be an amount, like 250 or 249.50.";
  const num = (x: number | null | Bad) => (x === "bad" ? null : x);
  const L = num(n.leads), C = num(n.calls), V = num(n.conversions), S = num(n.spend);
  if (L !== null && V !== null && V > L) errors.conversions = "Conversions cannot be more than leads.";
  if (L !== null && C !== null && C > L) errors.calls = "Calls booked cannot be more than leads.";
  const empty = L === null && C === null && V === null && S === null && !lesson.trim();
  const shown = (f: Fields) => (tried || f === "conversions" || f === "calls" ? errors[f] : undefined);
  // The live rates only use numbers that can be right, so a typo never shows "120%".
  const rates = ratesOf({ leads: L, calls: errors.calls ? null : C, conversions: errors.conversions ? null : V, spend: S });
  const preview = [
    rates.conversion !== null && `Conversion ${pct(rates.conversion)}`,
    rates.callRate !== null && `${pct(rates.callRate)} booked a call`,
    rates.costPerLead !== null && `${money(rates.costPerLead)} per lead`,
  ].filter(Boolean).join(" · ");
  const duplicate = !!period.trim() && periods.some((p) => p.trim().toLowerCase() === period.trim().toLowerCase());

  const choose = (p: Preset) => {
    setPreset(p);
    const v = presetValue(p, now, offer);
    if (v) { setPeriod(v.period); setEndedOn(v.endedOn); }
    else requestAnimationFrame(() => { periodRef.current?.focus(); periodRef.current?.select(); });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errors).length || empty) return;
    const r = await run(saveResult, {
      id: row?.id, offerId: offer.id, period: period.trim(), endedOn: endedOn || null,
      leads: L, calls: C, conversions: V, spend: S, lesson: lesson.trim(),
    });
    if (r.ok) {
      toast(row ? `Results for ${period.trim()} updated` : `Results for ${period.trim()} recorded`);
      onDone();
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); onDone(); }
  };

  const numberField = (f: Exclude<Fields, "period">, label: string, value: string, set: (v: string) => void, opts: { decimal?: boolean; optional?: boolean; ref?: Ref<HTMLInputElement> } = {}) => (
    <Field label={label} error={shown(f)} hint={opts.optional ? <span className="font-normal text-mute-2">Optional</span> : undefined}>
      <input ref={opts.ref} value={value} onChange={(e) => set(e.target.value)} inputMode={opts.decimal ? "decimal" : "numeric"} autoComplete="off" spellCheck={false}
        aria-invalid={shown(f) ? true : undefined} className="field tabular-nums" />
    </Field>
  );

  const left = MAX_LESSON - lesson.length;
  return (
    <form onSubmit={submit} onKeyDown={onKey} aria-labelledby={titleId} noValidate className="rounded-lg border border-line bg-surface p-4 shadow-card sm:p-5">
      <h3 id={titleId} className="m-0 mb-4 text-body font-semibold text-ink">{row ? `Edit results for ${row.period}` : "Record results"}</h3>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <Field label="Period" required error={shown("period")}>
          <input ref={periodRef} value={period} maxLength={MAX_PERIOD} autoComplete="off" aria-invalid={shown("period") ? true : undefined}
            onChange={(e) => { setPeriod(e.target.value); setPreset("custom"); }} className="field" />
        </Field>
        <Field label="Ended on" hint={<span className="font-normal text-mute-2">Optional</span>}>
          <input type="date" value={endedOn} onChange={(e) => setEndedOn(e.target.value)} className="field" />
        </Field>
      </div>
      <Pills label="Fill in the period" options={PRESETS} value={preset} onChange={choose} className="mt-2.5" />
      {duplicate && <p className="m-0 mt-2 text-meta text-warn-text">{period.trim()} is already recorded here. Saving adds a second entry; edit the first one to correct it.</p>}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {numberField("leads", "Leads", leads, setLeads, { ref: leadsRef })}
        {numberField("calls", "Calls booked", calls, setCalls)}
        {numberField("conversions", "Conversions", conversions, setConversions)}
        {numberField("spend", "Spend", spend, setSpend, { decimal: true, optional: true })}
      </div>
      <p className="m-0 mt-2 min-h-[1.45em] text-meta tabular-nums text-mute-2">{preview}</p>

      <Field label="Lesson learned" className="mt-3" hint={left <= 100 ? <span className="font-normal tabular-nums text-mute-2">{left} left</span> : undefined}>
        <textarea value={lesson} onChange={(e) => setLesson(e.target.value)} maxLength={MAX_LESSON} rows={3}
          placeholder="One thing to repeat, or to do differently, next time." className="field leading-[1.5]" />
      </Field>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Btn type="submit" variant="primary" disabled={pending}>{row ? "Save changes" : "Save results"}</Btn>
        <Btn variant="ghost" onClick={onDone}>Cancel</Btn>
        {tried && empty && <span role="alert" className="text-meta font-medium text-danger">Add at least one number or a lesson.</span>}
      </div>
    </form>
  );
}
