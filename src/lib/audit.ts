/*
 * The audit trail reads the same `activity` table as the dashboard feed.
 * Events that only admins should see (sign-ins, password changes, invite
 * links, exports) are written with type "security" and never reach the feed.
 *
 * This module is pure so the audit page and its CSV export filter the same way.
 */

export const SECURITY = "security";

/** Action strings for security events. Kept here so filters and writers agree. */
export const EV = {
  signedIn: "signed in",
  signInFailed: "failed to sign in",
  signedOut: "signed out",
  changedPassword: "changed their password",
  setPassword: "set a password",
  resetRequested: "asked for a password reset",
  inviteLink: "created an invite link for",
  resetLink: "created a reset link for",
  setup: "set up the workspace",
  exported: "downloaded a workspace export",
  auditExported: "exported the audit log",
  deletedForever: "deleted forever",
} as const;

export type AuditKind = "all" | "access" | "deletions" | "shares" | "signins" | "exports";

export const AUDIT_KINDS: { value: AuditKind; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "access", label: "Access changes" },
  { value: "deletions", label: "Deletions" },
  { value: "shares", label: "Shares" },
  { value: "signins", label: "Sign-ins" },
  { value: "exports", label: "Exports" },
];

export const AUDIT_PAGE_SIZE = 50;

export type AuditQuery = { kind: AuditKind; person: string; from: string; to: string; q: string; page: number };

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Reads the filters from a URL, dropping anything that does not look right. */
export function parseAuditQuery(params: Params): AuditQuery {
  const get = (k: string) => {
    const v = params instanceof URLSearchParams ? params.get(k) : params[k];
    return (Array.isArray(v) ? v[0] : v ?? "").trim();
  };
  const kind = get("kind") as AuditKind;
  const page = Number.parseInt(get("page"), 10);
  return {
    kind: AUDIT_KINDS.some((k) => k.value === kind) ? kind : "all",
    person: get("person").slice(0, 64),
    from: DAY.test(get("from")) ? get("from") : "",
    to: DAY.test(get("to")) ? get("to") : "",
    q: get("q").slice(0, 120),
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

/** The query string for a set of filters, leaving out the defaults. */
export function auditSearch(q: Partial<AuditQuery>): string {
  const p = new URLSearchParams();
  if (q.kind && q.kind !== "all") p.set("kind", q.kind);
  if (q.person) p.set("person", q.person);
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  if (q.q) p.set("q", q.q);
  if (q.page && q.page > 1) p.set("page", String(q.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}
