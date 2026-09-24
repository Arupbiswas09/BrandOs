/*
 * A small iCalendar (RFC 5545) writer for the calendar feed. Pure, so it can
 * be checked on its own.
 */

export type IcsEvent = {
  uid: string;
  /** The calendar day, local to the server, as yyyy-mm-dd. */
  date: string;
  summary: string;
  description?: string;
  url?: string;
  stamp: Date;
  /** Text shown by the reminder the day before. Leave out for no reminder. */
  alarm?: string;
};

/** Escapes text values: backslash, semicolon, comma and line breaks. */
export function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

const enc = new TextEncoder();

/**
 * Lines longer than 75 octets are folded: CRLF then one space. Folds never
 * split a multi-byte character.
 */
export function foldLine(line: string): string {
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  // Continuation lines start with a space, which counts toward their 75.
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(cur);
      cur = "";
      bytes = 0;
      limit = 74;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

/** 2026-09-24T10:03:00Z → 20260924T100300Z */
function utc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10).replace(/-/g, "");
}

export function buildCalendar(name: string, events: IcsEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BrandOS//Calendar feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsText(e.uid)}`,
      `DTSTAMP:${utc(e.stamp)}`,
      `DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${nextDay(e.date)}`,
      `SUMMARY:${icsText(e.summary)}`,
      "TRANSP:TRANSPARENT",
    );
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    // URI values are not text-escaped, but they must not break the line.
    if (e.url) lines.push(`URL;VALUE=URI:${e.url.replace(/[\r\n]/g, "")}`);
    if (e.alarm) {
      // 9am the day before an all-day event.
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.alarm)}`, "TRIGGER:-PT15H", "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
