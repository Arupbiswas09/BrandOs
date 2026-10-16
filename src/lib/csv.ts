/*
 * Rows from a spreadsheet: a .csv file saved from Excel, Numbers or Google
 * Sheets, or cells copied out of one and pasted (which arrive as
 * tab-separated text). Quoting follows RFC 4180: a field in double quotes may
 * hold the delimiter, line breaks and doubled quotes (""). Excel in much of
 * Europe saves with semicolons, so the delimiter is worked out from the text.
 *
 * Pure and dependency-free, so the browser previews exactly what the server
 * will import.
 */

export type Delimiter = "," | ";" | "\t";
export type Table = { rows: string[][]; delimiter: Delimiter };

const CANDIDATES: Delimiter[] = ["\t", ";", ","];

/** Counts each candidate delimiter per record (outside quotes) over the first few non-blank records. */
function countsPerRecord(text: string, max = 6): Record<Delimiter, number[]> {
  const out: Record<Delimiter, number[]> = { "\t": [], ";": [], ",": [] };
  let cur: Record<Delimiter, number> = { "\t": 0, ";": 0, ",": 0 };
  let quoted = false;
  let atStart = true;
  let content = false;
  const close = () => {
    if (content) for (const d of CANDIDATES) out[d].push(cur[d]);
    cur = { "\t": 0, ";": 0, ",": 0 };
    content = false;
    atStart = true;
  };
  for (let i = 0; i < text.length && out[","].length < max; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') i++;
        else quoted = false;
      }
      continue;
    }
    if (c === '"' && atStart) { quoted = true; content = true; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      close();
      continue;
    }
    if (c === "\t" || c === ";" || c === ",") {
      cur[c]++;
      content = true;
      atStart = true;
      continue;
    }
    if (c !== " ") { atStart = false; content = true; }
  }
  if (out[","].length < max) close();
  return out;
}

/**
 * Tab when the text came from a copy and paste, otherwise whichever of
 * semicolon and comma splits the first records most consistently.
 */
export function detectDelimiter(raw: string): Delimiter {
  const counts = countsPerRecord(stripBom(raw));
  let best: Delimiter = ",";
  let bestScore = 0;
  for (const d of CANDIDATES) {
    const list = counts[d];
    const first = list[0] ?? 0;
    if (!first) continue;
    const score = list.filter((n) => n === first).length * 1000 + first;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

const stripBom = (t: string) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);

/**
 * Parses the whole text into rows of cells. Blank lines are dropped, as are
 * columns that are empty on every row (spreadsheets often export a few).
 * Cells keep their inner spacing; leading and trailing spaces are trimmed.
 */
export function parseTable(raw: string, delimiter?: Delimiter): Table {
  const text = stripBom(raw);
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  /** The field began with a quote, so its spaces are its own. */
  let wasQuoted = false;
  const endField = () => {
    row.push(wasQuoted ? field : field.trim());
    field = "";
    wasQuoted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && !wasQuoted && field.trim() === "") {
      quoted = true;
      wasQuoted = true;
      field = "";
      continue;
    }
    if (c === d) { endField(); continue; }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
      continue;
    }
    // Anything after a closing quote (other than spaces) is kept, as spreadsheets do.
    if (wasQuoted && !quoted && c === " ") continue;
    field += c;
  }
  if (field !== "" || wasQuoted || row.length) endRow();

  const filled = rows.filter((r) => r.some((x) => x.trim() !== ""));
  const width = Math.max(0, ...filled.map((r) => r.length));
  const keep: number[] = [];
  for (let col = 0; col < width; col++) if (filled.some((r) => (r[col] ?? "").trim() !== "")) keep.push(col);
  return { rows: filled.map((r) => keep.map((col) => r[col] ?? "")), delimiter: d };
}

/** Splits a cell holding a list ("Revenue, Retention" or "a; b"). Semicolons win when present. */
export function splitList(cell: string): string[] {
  const t = cell.trim();
  if (!t) return [];
  const parts = t.includes(";") ? t.split(";") : t.includes("|") ? t.split("|") : t.split(",");
  return parts.map((p) => p.trim()).filter(Boolean);
}
