import type { Asset, LinkCheck } from "@/db/schema";
import { roleOf } from "@/lib/constants";

/*
 * Whether an asset's link still opens: the rules both the daily check (on the
 * server) and the warning on cards (in the browser) go by. Pure.
 */

/**
 * A check as it is stored. `url` is the address exactly as it was on the
 * asset when it was checked, so a result never sticks to an address that has
 * since been edited. Older rows may not have it.
 */
export type StoredLinkCheck = LinkCheck & { url?: string };

/** How long a check counts as fresh for the daily run. */
export const RECHECK_AFTER_MS = 20 * 60 * 60 * 1000;
/** How long one page has to answer. */
export const CHECK_TIMEOUT_S = 8;

/** The last check of this asset's current address, or null when it was never checked (or the address changed since). */
export function linkCheckOf(a: Pick<Asset, "url" | "linkCheck">): StoredLinkCheck | null {
  const c = a.linkCheck as StoredLinkCheck | null;
  if (!c || !a.url.trim()) return null;
  if (c.url !== undefined && c.url !== a.url.trim()) return null;
  return c;
}

/** True only when the current address was checked and did not open. */
export function isLinkBroken(a: Pick<Asset, "url" | "linkCheck" | "archived">): boolean {
  if (a.archived) return false;
  const c = linkCheckOf(a);
  return !!c && !c.ok;
}

/** Whether the daily run should check this asset now. */
export function linkCheckDue(a: Pick<Asset, "url" | "linkCheck">, now: number): boolean {
  if (!a.url.trim()) return false;
  const c = linkCheckOf(a);
  return !c || now - new Date(c.checkedAt).getTime() >= RECHECK_AFTER_MS;
}

const STATUS_WORDS: Record<number, string> = {
  400: "Bad request", 401: "Asks for a sign-in", 403: "Access refused", 404: "Page not found", 405: "Refused the request",
  408: "Timed out", 410: "Page removed", 451: "Blocked for legal reasons",
  500: "Server error", 502: "Bad gateway", 503: "Not available", 504: "Gateway timed out",
};

/** What went wrong, in a few plain words: "Page not found", "No such domain". */
export function linkProblem(c: Pick<LinkCheck, "status" | "error">): string {
  if (c.error) return c.error;
  if (c.status == null) return "Did not open";
  return STATUS_WORDS[c.status] ?? (c.status >= 500 ? "Server error" : "Did not open");
}

/**
 * Something wrong with the address itself, before anyone opens it: a space,
 * usually two links pasted into one field. Null when it looks like one address.
 */
export function linkAddressIssue(raw: string): string | null {
  const t = raw.trim();
  if (!t || !/\s/.test(t)) return null;
  const links = t.split(/\s+/).filter((p) => /^(https?:\/\/|www\.|[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$))/i.test(p));
  return links.length > 1 ? "Two links in one address" : "A space in the address";
}

/** What to do about a failed check, in one plain sentence. */
export function linkAdvice(c: Pick<LinkCheck, "status" | "error">, url: string): string {
  const host = (() => { try { return new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`).hostname; } catch { return ""; } })();
  if (c.error === "Two links in one address") return "Keep one link here. Put the other in its own asset or in the notes.";
  if (c.error === "A space in the address") return "Take the space out, or copy the link again and paste it on its own.";
  if (c.error === "No such domain" || c.error === "The domain could not be looked up") return "The web address may be misspelt, or the domain has run out.";
  if (c.error === "Not a web address") return "Paste a full web address, for example yoursite.org/page.";
  if (c.status === 404 || c.status === 410 || c.status === 400) {
    return isGoogleDrive(host)
      ? "Google can't find it. Open it in Drive yourself; if it opens, copy the link again with Drive's Share button."
      : "The page isn't there any more. Paste its new address, or ask whoever runs the site.";
  }
  if (c.status === 401 || c.status === 403) return "The page asks for a sign-in or turns visitors away. If the team can open it, it is fine.";
  if (c.status != null && c.status >= 500) return "The site has a problem on its side. Check again later.";
  if (c.error?.startsWith("Did not answer")) return "The site was too slow to answer. Check again later.";
  return "Open the link to see what is wrong, then edit it or check again.";
}

/** Google Drive and Docs links answer 401 or 403 when a file is private, which is normal for client files. */
export function isGoogleDrive(host: string): boolean {
  const h = host.toLowerCase();
  return h === "drive.google.com" || h === "docs.google.com" || h === "drive.usercontent.google.com" || h === "sheets.google.com" || h === "slides.google.com";
}

/**
 * Whether a final HTTP status means the link opens.
 *   200–399            yes
 *   401/403 on Drive   yes: a private file is still there
 *   429, 999           yes: the site is up and turned an automated visitor away (999 is LinkedIn's)
 */
export function statusAnswers(status: number, host: string): boolean {
  if (status >= 200 && status < 400) return true;
  if ((status === 401 || status === 403) && isGoogleDrive(host)) return true;
  return status === 429 || status === 999;
}

/** Landing pages, lead magnets and thank-you pages: the pages a card picture is taken from. */
export function wantsPagePicture(a: Pick<Asset, "type" | "thumbnail" | "files" | "url">): boolean {
  const role = roleOf(a.type);
  if (role !== "entry" && role !== "after") return false;
  if (a.thumbnail || !a.url.trim()) return false;
  return !a.files.some((f) => f.url && /^image\/(png|jpe?g|gif|webp|avif)$/.test(f.type ?? ""));
}
