"use client";

import { useMemo, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { importRows, type ImportResult } from "@/app/import-actions";
import { parseTable } from "@/lib/csv";
import { ASSET_TYPES } from "@/lib/constants";
import {
  fieldsOf, guessColumns, planImport, unknownLabel, MAX_IMPORT_ROWS,
  type BrandFacts, type Choices, type FieldKey, type ImportKind, type Plan, type Powers,
} from "@/lib/import-plan";
import { Btn, Card, Field, Pills, Select, cx } from "@/components/ui";
import { Choice, IssueList, RowState, StepTitle, plural } from "./parts";

/*
 * Rows from a spreadsheet: a .csv file or cells pasted from Excel or Google
 * Sheets. The person says what the rows are, checks what each column holds,
 * decides about values the brand does not have yet, and sees every row
 * before anything is imported. The server plans the same rows again.
 */

const MAX_FILE = 2 * 1024 * 1024;
/** Server actions take up to 1 MB; leave room for the rest of the request. */
const MAX_PAYLOAD = 950_000;
const SHOWN = 60;

export function SheetImport({ brandId, brandName, facts, powers, kind, onKind, onDone }: {
  brandId: string; brandName: string; facts: BrandFacts; powers: Powers;
  kind: ImportKind; onKind: (k: ImportKind) => void; onDone: (r: Extract<ImportResult, { ok: true }>) => void;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<{ key: string; cols: (FieldKey | null)[] } | null>(null);
  const [create, setCreate] = useState<Record<string, boolean>>({});
  const [types, setTypes] = useState<Record<string, string>>({});
  const [dupes, setDupes] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const table = useMemo(() => parseTable(text), [text]);
  const width = Math.max(0, ...table.rows.map((r) => r.length));
  const headers = useMemo(() => (hasHeader ? table.rows[0] ?? [] : Array.from({ length: width }, (_, i) => `Column ${i + 1}`)), [hasHeader, table, width]);
  const rows = useMemo(() => (hasHeader ? table.rows.slice(1) : table.rows), [hasHeader, table]);
  const mapKey = `${kind}|${hasHeader}|${headers.join("\u0001")}`;
  const cols = useMemo(() => (mapping?.key === mapKey ? mapping.cols : guessColumns(kind, headers)), [mapping, mapKey, kind, headers]);

  const plan: Plan = useMemo(() => {
    const first = planImport(kind, cols, rows, facts, powers, { create: {}, types, duplicates: [...dupes] });
    const chosen: Choices["create"] = {};
    for (const u of first.unknowns) {
      if (u.field === "type" || !u.canCreate) continue;
      if (create[`${u.field}:${u.key}`] ?? true) (chosen[u.field] ??= []).push(u.key);
    }
    return planImport(kind, cols, rows, facts, powers, { create: chosen, types, duplicates: [...dupes] });
  }, [kind, cols, rows, facts, powers, create, types, dupes]);

  const noun = kind === "offers" ? "offer" : "asset";
  const fields = fieldsOf(kind);
  const setCol = (i: number, f: FieldKey | null) => {
    const next = cols.map((c, j) => (j === i ? f : c === f && f ? null : c));
    setMapping({ key: mapKey, cols: next });
  };
  const reset = () => { setMapping(null); setDupes(new Set()); setShowAll(false); setError(null); };

  const readFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (/\.(xlsx?|numbers|ods)$/i.test(file.name)) {
      setFileError("Save the sheet as CSV first (in Google Sheets: File, Download, CSV; in Excel: Save As, CSV), or copy the rows and paste them below.");
      return;
    }
    if (file.size > MAX_FILE) { setFileError(`${file.name} is over 2 MB. Split it, or paste the rows below.`); return; }
    setText(await file.text());
    setFileName(file.name);
    reset();
  };

  const submit = async () => {
    // Only the columns in use travel, which keeps big sheets under the request limit.
    const used = cols.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    const choices: Choices = {
      create: Object.fromEntries((["service", "segment", "offerType", "goal"] as const).map((f) => [f, plan.unknowns.filter((u) => u.field === f && u.create).map((u) => u.key)])),
      types, duplicates: [...dupes],
    };
    const payload = { brandId, kind, columns: used.map((i) => cols[i]), rows: rows.map((r) => used.map((i) => r[i] ?? "")), choices };
    if (JSON.stringify(payload).length > MAX_PAYLOAD) { setError("That is a lot of text for one import. Import the rows in two halves."); return; }
    setPending(true);
    setError(null);
    try {
      const r = await importRows(payload);
      if (r.ok) onDone(r);
      else setError(r.error);
    } catch {
      setError("The import did not finish, and nothing was changed. Try again in a moment.");
    } finally {
      setPending(false);
    }
  };

  const hasRows = rows.length > 0;
  const shown = showAll ? plan.rows : plan.rows.slice(0, SHOWN);

  return (
    <>
      <Card className="p-5 sm:p-6">
        <StepTitle n={2} sub="Upload a .csv file, or copy the rows (headings included) from Excel or Google Sheets and paste them here.">The rows</StepTitle>
        <div className="mb-4">
          <div className="label">What are these rows?</div>
          <Pills label="What are these rows?" value={kind} onChange={(v) => { onKind(v); reset(); }}
            options={[{ value: "offers", label: "Offers" }, { value: "assets", label: "Assets" }]} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" className="sr-only" tabIndex={-1} aria-hidden
            onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ""; }} />
          <Btn variant="secondary" onClick={() => fileRef.current?.click()}><FileUp aria-hidden className="size-4" />Choose a .csv file</Btn>
          {fileName && <span className="min-w-0 truncate text-meta text-mute-2">{fileName}</span>}
        </div>
        {fileError && <p role="alert" className="mb-0 mt-2 text-meta font-medium text-danger">{fileError}</p>}
        <Field label="Or paste the rows" className="mt-4">
          <textarea rows={6} className="field font-code text-meta leading-[1.5]" spellCheck={false} value={text}
            placeholder={kind === "offers" ? "Offer name\tService\tSegment\tPromise\nSpring appeal\tAnnual Giving\tDonors\tDouble the gift" : "Asset name\tType\tLink\tOffers\nSpring email\tEmail\thttps://…\tSpring appeal"}
            onChange={(e) => { setText(e.target.value); setFileName(null); reset(); }} />
        </Field>
        {hasRows && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-meta text-mute-2">{plural(rows.length, "row")}, {plural(headers.length, "column")}, {table.delimiter === "\t" ? "tab separated" : table.delimiter === ";" ? "semicolon separated" : "comma separated"}</span>
            <label className="flex cursor-pointer items-center gap-2 text-meta text-ink-3">
              <input type="checkbox" className="size-4 accent-accent" checked={hasHeader} onChange={(e) => { setHasHeader(e.target.checked); reset(); }} />
              The first row has the column names
            </label>
          </div>
        )}
        {rows.length > MAX_IMPORT_ROWS && <p role="alert" className="mb-0 mt-2 text-meta font-medium text-danger">That is {rows.length} rows. Import up to {MAX_IMPORT_ROWS} at a time.</p>}
      </Card>

      {hasRows && (
        <Card className="p-5 sm:p-6">
          <StepTitle n={3} sub={`BrandOS guessed from the headings. Pick "Leave out" for anything that should not come in.`}>What each column holds</StepTitle>
          <ul className="m-0 list-none divide-y divide-divider p-0">
            {headers.map((h, i) => {
              const sample = rows.slice(0, 4).map((r) => (r[i] ?? "").trim()).filter(Boolean).slice(0, 2).join(" · ");
              return (
                <li key={i} className="grid gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center sm:gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-body font-medium text-ink">{h || `Column ${i + 1}`}</div>
                    <div className="truncate text-small text-mute-2">{sample || "empty"}</div>
                  </div>
                  <Select aria-label={`What ${h || `column ${i + 1}`} holds`} value={cols[i] ?? ""} onChange={(v) => setCol(i, (v || null) as FieldKey | null)}
                    className={cx("h-9 py-1 text-meta", cols[i] && "border-accent")}
                    options={[{ value: "", label: "Leave out" }, ...fields.map((f) => ({ value: f.key, label: `${f.label}${f.required ? " (needed)" : ""}` }))]} />
                </li>
              );
            })}
          </ul>
          {!cols.includes("name") && <p role="alert" className="mb-0 mt-3 text-meta font-medium text-danger">Pick the column with each {noun}&apos;s name.</p>}
        </Card>
      )}

      {hasRows && plan.unknowns.length > 0 && (
        <Card className="p-5 sm:p-6">
          <StepTitle n={4} sub={`The sheet names things ${brandName} does not have yet. Create them, or leave them empty on the rows that use them.`}>New to this brand</StepTitle>
          <ul className="m-0 list-none divide-y divide-divider p-0">
            {plan.unknowns.map((u) => (
              <li key={`${u.field}:${u.key}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
                <div className="min-w-0">
                  <div className="text-body text-ink"><span className="text-mute-2">{unknownLabel(u.field).replace(/^./, (c) => c.toUpperCase())}</span> <span className="font-medium">{u.value}</span></div>
                  <div className="text-small text-mute-2">{plural(u.rows, "row")}{u.why ? ` · ${u.why}` : ""}</div>
                </div>
                {u.field === "type" ? (
                  <Select aria-label={`Bring ${u.value} in as`} value={u.mappedTo ?? "Document"} onChange={(v) => setTypes({ ...types, [u.key]: v })}
                    className="h-9 w-auto py-1 pr-8 text-meta" options={Object.keys(ASSET_TYPES).map((t) => ({ value: t, label: `As ${t}` }))} />
                ) : (
                  <Choice label={`${u.value}: create it or leave it empty`} disabled={!u.canCreate} value={u.create ? "create" : "empty"}
                    onChange={(v) => setCreate({ ...create, [`${u.field}:${u.key}`]: v === "create" })}
                    options={[{ value: "create", label: "Create it" }, { value: "empty", label: "Leave empty" }]} />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {hasRows && cols.includes("name") && (
        <Card className="overflow-hidden">
          <div className="p-5 pb-3 sm:p-6 sm:pb-3">
            <StepTitle n={plan.unknowns.length ? 5 : 4}
              sub={[`${plural(plan.counts.ready, noun)} ready`, plan.counts.duplicates ? `${plural(plan.counts.duplicates, "name")} already here` : "", plan.counts.errors ? `${plural(plan.counts.errors, "row")} cannot come in` : ""].filter(Boolean).join(" · ")}>
              Check the rows
            </StepTitle>
          </div>
          <ul className="m-0 list-none border-t border-divider p-0">
            {shown.map((r) => {
              const detail = r.offer
                ? [facts.services.find((v) => v.id === r.offer!.serviceId)?.name ?? r.offer.newService, r.offer.segment !== "All segments" ? r.offer.segment : "", r.offer.offerType, r.offer.status !== "Ideation" ? r.offer.status : ""].filter(Boolean).join(" · ")
                : r.asset ? [r.asset.type, r.asset.channel !== "Owned" ? r.asset.channel : "", r.asset.offerIds.length ? `linked to ${plural(r.asset.offerIds.length, "offer")}` : "", r.asset.url ? safeHost(r.asset.url) : ""].filter(Boolean).join(" · ") : "";
              return (
                <li key={r.index} className={cx("flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-divider px-5 py-3 last:border-b-0 sm:px-6", !r.include && "bg-wash")}>
                  <span className="w-14 flex-none pt-0.5 font-mono text-micro text-mute-2">Row {r.index + (hasHeader ? 2 : 1)}</span>
                  <div className="min-w-0 flex-1 basis-[220px]">
                    <div className={cx("break-words text-body font-medium", r.include ? "text-ink" : "text-mute-2")}>{r.name || "No name"}</div>
                    {detail && <div className="break-words text-small text-mute-2">{detail}</div>}
                    {r.duplicate && <div className="text-small text-ink-3">{r.duplicate === "existing" ? `${brandName} already has an ${noun} with this name.` : "An earlier row has the same name."}</div>}
                    <IssueList issues={r.issues} />
                  </div>
                  <div className="flex flex-none items-center gap-3">
                    {r.duplicate && !r.issues.some((i) => i.level === "error") && (
                      <Choice label={`Row ${r.index + (hasHeader ? 2 : 1)}: skip or import anyway`} value={dupes.has(r.index) ? "import" : "skip"}
                        onChange={(v) => { const next = new Set(dupes); if (v === "import") next.add(r.index); else next.delete(r.index); setDupes(next); }}
                        options={[{ value: "skip", label: "Skip" }, { value: "import", label: "Import anyway" }]} />
                    )}
                    <RowState include={r.include} issues={r.issues} duplicate={r.duplicate} />
                  </div>
                </li>
              );
            })}
          </ul>
          {plan.rows.length > SHOWN && !showAll && (
            <div className="border-t border-divider px-5 py-3 sm:px-6">
              <Btn variant="ghost" size="sm" className="px-1" onClick={() => setShowAll(true)}>Show all {plan.rows.length} rows</Btn>
            </div>
          )}
          <div className="flex flex-col-reverse gap-3 border-t border-divider bg-wash px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="m-0 text-meta text-mute-2 text-pretty">
              {plan.blocked ?? (plan.counts.ready
                ? `Adds ${plural(plan.counts.ready, noun)} to ${brandName}${addsText(plan)}.${plan.counts.skipped ? ` ${plural(plan.counts.skipped, "row")} ${plan.counts.skipped === 1 ? "is" : "are"} skipped.` : ""}`
                : "Nothing to import yet.")}
            </p>
            <Btn variant="primary" size="lg" disabled={pending || !!plan.blocked || !plan.counts.ready} onClick={() => void submit()}>
              {pending ? "Importing" : `Import ${plural(plan.counts.ready, noun)}`}
            </Btn>
          </div>
          {error && <p role="alert" className="m-0 border-t border-divider px-5 py-3 text-meta font-medium text-danger sm:px-6">{error}</p>}
        </Card>
      )}
    </>
  );
}

function addsText(plan: Plan) {
  const a = plan.adds;
  const parts = [a.services.length && plural(a.services.length, "new service"), a.segments.length && plural(a.segments.length, "new segment"), a.goals.length && plural(a.goals.length, "new goal"), a.offerTypes.length && plural(a.offerTypes.length, "new offer type")].filter(Boolean);
  if (!parts.length) return "";
  return `, with ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]}`;
}

function safeHost(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
