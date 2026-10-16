"use client";

import { useMemo, useState } from "react";
import { importDriveLinks, type ImportResult } from "@/app/import-actions";
import { driveKind, isDriveUrl, parseDriveLines, planDriveLinks, MAX_IMPORT_ROWS, type BrandFacts } from "@/lib/import-plan";
import { Btn, Card, Field, Select, cx } from "@/components/ui";
import { Choice, IssueList, RowState, StepTitle, plural } from "./parts";

/*
 * Many Google Drive, Docs, Sheets or Slides links at once, each becoming a
 * "Drive link" asset in the brand, optionally linked to one offer. Nothing
 * is fetched from Google: the link is stored as it was pasted.
 */

export function DriveImport({ brandId, brandName, facts, offers, offerId: initialOffer, onDone }: {
  brandId: string; brandName: string; facts: BrandFacts;
  /** The brand's offers that new links may be linked to. */
  offers: { id: string; name: string }[];
  offerId?: string;
  onDone: (r: Extract<ImportResult, { ok: true }>) => void;
}) {
  const [text, setText] = useState("");
  const [names, setNames] = useState<Record<number, string>>({});
  const [dupes, setDupes] = useState<Set<number>>(new Set());
  const [offerId, setOfferId] = useState(initialOffer && offers.some((o) => o.id === initialOffer) ? initialOffer : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = useMemo(() => parseDriveLines(text).map((l, i) => (names[i] !== undefined ? { ...l, name: names[i] } : l)), [text, names]);
  const plan = useMemo(() => planDriveLinks(lines, facts, [...dupes]), [lines, facts, dupes]);
  const ready = plan.rows.filter((r) => r.include).length;

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await importDriveLinks({ brandId, offerId: offerId || null, links: plan.rows.map((r) => ({ name: r.name, url: r.url })), duplicates: [...dupes] });
      if (r.ok) onDone(r);
      else setError(r.error);
    } catch {
      setError("The import did not finish, and nothing was changed. Try again in a moment.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Card className="p-5 sm:p-6">
        <StepTitle n={2} sub="One link per line. Put a name before the link if you like, as in: Spring brief, https://docs.google.com/document/d/…">The links</StepTitle>
        <Field label="Google Drive, Docs, Sheets or Slides links">
          <textarea rows={6} className="field font-code text-meta leading-[1.5]" spellCheck={false} value={text}
            placeholder={"Spring brief, https://docs.google.com/document/d/…\nhttps://drive.google.com/drive/folders/…"}
            onChange={(e) => { setText(e.target.value); setNames({}); setDupes(new Set()); setError(null); }} />
        </Field>
        <Field label="Link them to an offer" className="mt-4" hint={<span className="font-normal text-mute-2">optional</span>}>
          <Select value={offerId} onChange={setOfferId} options={[{ value: "", label: "No offer, just the brand" }, ...offers.map((o) => ({ value: o.id, label: o.name }))]} />
        </Field>
        {lines.length > MAX_IMPORT_ROWS && <p role="alert" className="mb-0 mt-2 text-meta font-medium text-danger">That is {lines.length} links. Import up to {MAX_IMPORT_ROWS} at a time.</p>}
      </Card>

      {plan.rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-5 pb-3 sm:p-6 sm:pb-3">
            <StepTitle n={3} sub="Name each one the way the team will look for it.">Check the links</StepTitle>
          </div>
          <ul className="m-0 list-none border-t border-divider p-0">
            {plan.rows.map((r) => (
              <li key={r.index} className={cx("flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-divider px-5 py-3 last:border-b-0 sm:px-6", !r.include && "bg-wash")}>
                <div className="min-w-0 flex-1 basis-[240px]">
                  <input aria-label={`Name for link ${r.index + 1}`} className="field h-9 py-1 font-medium" value={r.name} maxLength={200}
                    onChange={(e) => setNames({ ...names, [r.index]: e.target.value })} />
                  <div className="mt-1 break-all text-small text-mute-2">{r.url ? `${isDriveUrl(r.url) ? driveKind(r.url) : "Not a Drive link"} · ${r.url.replace(/^https?:\/\//, "").slice(0, 80)}` : "No link on this line"}</div>
                  {r.duplicate && <div className="text-small text-ink-3">{r.duplicate === "existing" ? `${brandName} already has this link or name.` : "An earlier line has the same link."}</div>}
                  <IssueList issues={r.issues} />
                </div>
                <div className="flex flex-none items-center gap-3 pt-1.5">
                  {r.duplicate && !r.issues.some((i) => i.level === "error") && (
                    <Choice label={`Link ${r.index + 1}: skip or import anyway`} value={dupes.has(r.index) ? "import" : "skip"}
                      onChange={(v) => { const next = new Set(dupes); if (v === "import") next.add(r.index); else next.delete(r.index); setDupes(next); }}
                      options={[{ value: "skip", label: "Skip" }, { value: "import", label: "Import anyway" }]} />
                  )}
                  <RowState include={r.include} issues={r.issues} duplicate={r.duplicate} />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-col-reverse gap-3 border-t border-divider bg-wash px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="m-0 text-meta text-mute-2 text-pretty">
              {plan.blocked ?? (ready ? `Adds ${plural(ready, "Drive link")} to ${brandName}${offerId ? `, linked to ${offers.find((o) => o.id === offerId)?.name ?? "the offer"}` : ""}.` : "Nothing to import yet.")}
            </p>
            <Btn variant="primary" size="lg" disabled={pending || !!plan.blocked || !ready} onClick={() => void submit()}>
              {pending ? "Importing" : `Import ${plural(ready, "link")}`}
            </Btn>
          </div>
          {error && <p role="alert" className="m-0 border-t border-divider px-5 py-3 text-meta font-medium text-danger sm:px-6">{error}</p>}
        </Card>
      )}
    </>
  );
}
