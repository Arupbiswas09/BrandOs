import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import type { Asset, LinkCheck } from "@/db/schema";
import { CHECK_TIMEOUT_S, linkCheckDue, linkCheckOf, linkProblem, statusAnswers, wantsPagePicture, type StoredLinkCheck } from "@/lib/link-health";
import { readAll, type All } from "@/server/data";
import { getUploadPolicy } from "@/server/limits";
import { LINK_CHECKER, linkFetch, type Fetcher } from "@/server/link-fetcher";
import { autoPagePicture } from "@/server/page-picture";
import { SafeFetchError, normaliseUrl, type SafeResponse } from "@/server/safe-fetch";

/*
 * The quiet daily check that every landing page, thank-you page and Drive
 * link still opens. A routine check writes only the asset's `linkCheck`; the
 * history gets one line, "found a broken link on", only when a link that
 * opened last time stops opening.
 */

const TIMEOUT_MS = CHECK_TIMEOUT_S * 1000;

/** A failed request in a few plain words. */
function plainError(e: unknown): string {
  if (e instanceof SafeFetchError) {
    switch (e.code) {
      case "timeout": return `Did not answer in ${CHECK_TIMEOUT_S} seconds`;
      case "blocked": return "Points at a private network address";
      case "too-many-redirects": return "Redirects too many times";
      case "invalid-url": return "Not a web address";
    }
  }
  const m = e instanceof Error ? e.message : String(e);
  if (/ENOTFOUND|EAI_NONAME|EAI_NODATA/.test(m)) return "No such domain";
  if (/EAI_AGAIN/.test(m)) return "The domain could not be looked up";
  if (/ECONNREFUSED/.test(m)) return "Refused the connection";
  if (/ECONNRESET|EPIPE|socket hang up/i.test(m)) return "Dropped the connection";
  if (/CERT|certificate|SSL|TLS|self[- ]signed/i.test(m)) return "Has a broken security certificate";
  return "Could not be reached";
}

/** A Cloudflare "are you human" page: the site is up, it just turns automated visitors away. */
const challenged = (r: SafeResponse) => (r.status === 403 || r.status === 503) && /challenge/i.test(r.headers["cf-mitigated"] ?? "");

/**
 * Opens an asset's link: HEAD first, then GET when HEAD fails or is turned
 * away (many sites refuse HEAD). Never throws. `fetcher` is for tests.
 */
export async function checkAssetLink(asset: Pick<Asset, "url">, fetcher: Fetcher = linkFetch, now = new Date()): Promise<StoredLinkCheck> {
  const raw = asset.url.trim();
  const checkedAt = now.toISOString();
  let url: URL;
  try { url = normaliseUrl(raw); } catch { return { ok: false, status: null, error: "Not a web address", checkedAt, url: raw }; }

  const answers = (r: SafeResponse) => statusAnswers(r.status, new URL(r.url).hostname) || statusAnswers(r.status, url.hostname) || challenged(r);
  let res: SafeResponse | null = null;
  let failure: unknown = null;
  try {
    res = await fetcher(url, { method: "HEAD", timeoutMs: TIMEOUT_MS, maxBytes: 1024, accept: "*/*" });
  } catch (e) {
    failure = e;
  }
  // A page that did not answer at all is not asked twice; one that answered oddly, or dropped the line, is.
  const retry = res ? !answers(res) : !(failure instanceof SafeFetchError && ["timeout", "blocked", "invalid-url", "too-many-redirects"].includes(failure.code));
  if (retry) {
    try {
      res = await fetcher(url, { method: "GET", timeoutMs: TIMEOUT_MS, maxBytes: 64_000 });
      failure = null;
    } catch (e) {
      res = null;
      failure = e;
    }
  }
  if (!res) return { ok: false, status: null, error: plainError(failure), checkedAt, url: raw };
  const finalUrl = res.url !== url.toString() ? res.url : undefined;
  return { ok: answers(res), status: res.status, checkedAt, ...(finalUrl && { finalUrl }), url: raw };
}

export type LinkRunResult = {
  ok: true;
  /** Links opened this run. */
  checked: number;
  answering: number;
  broken: number;
  /** Links that opened last time and do not now. */
  newlyBroken: number;
  /** Card pictures taken from pages. */
  pictures: number;
  /** Links still fresh from an earlier run. */
  fresh: number;
  /** Links due that this run left for the next one (cap or time budget). */
  remaining: number;
};

/** Saves one check and, when a link that opened stops opening, writes the single history line. */
export async function recordLinkCheck(asset: Asset, check: StoredLinkCheck, actor: string) {
  const db = await getDb();
  const before = asset.linkCheck as StoredLinkCheck | null;
  // A routine check is not an edit: updatedAt stays as it was.
  await db.update(s.assets).set({ linkCheck: check as LinkCheck }).where(eq(s.assets.id, asset.id));
  const flipped = !!before?.ok && !check.ok;
  if (flipped) {
    await db.insert(s.activity).values({
      id: "ac" + crypto.randomUUID().replace(/-/g, "").slice(0, 10), userId: actor, action: "found a broken link on", type: "asset",
      itemId: asset.id, label: asset.name, field: `${linkProblem(check)}${check.status ? ` (${check.status})` : ""}`,
    });
  }
  return { flipped, before };
}

/** Whether this check is the moment a page first opens (never checked, failing before, or a new address). */
const firstOpen = (asset: Asset, check: StoredLinkCheck) => check.ok && !linkCheckOf(asset)?.ok;

/**
 * Checks every live asset that has a link, skipping ones checked in the last
 * 20 hours unless `force`. Four at a time, at most `limit` per run, and no new
 * check starts after `budgetMs`; whatever is left waits for the next run.
 * Landing, lead magnet and thank-you pages without a picture get the page's
 * share picture the first time they open.
 */
export async function runLinkChecks(opts: {
  force?: boolean; brandId?: string; limit?: number; budgetMs?: number; fetcher?: Fetcher; actor?: string; all?: All;
  /** Only these assets (what the person asking can see). Everything when left out. */
  only?: (assetId: string) => boolean;
} = {}): Promise<LinkRunResult> {
  const all = opts.all ?? await readAll();
  const now = Date.now();
  const deadline = now + (opts.budgetMs ?? 240_000);
  const fetcher = opts.fetcher ?? linkFetch;
  const actor = opts.actor ?? LINK_CHECKER;
  const brands = opts.brandId ? new Set([opts.brandId, ...all.brands.filter((b) => b.parentId === opts.brandId).map((b) => b.id)]) : null;

  const withLinks = all.assets.filter((a) => !a.archived && a.url.trim() && (!brands || (a.brandId && brands.has(a.brandId))) && (!opts.only || opts.only(a.id)));
  const due = withLinks.filter((a) => opts.force || linkCheckDue(a, now));
  // Oldest results first, never-checked before everything.
  const when = (a: Asset) => (linkCheckOf(a) ? new Date(linkCheckOf(a)!.checkedAt).getTime() : 0);
  due.sort((x, y) => when(x) - when(y));
  const batch = due.slice(0, opts.limit ?? 300);

  const r: LinkRunResult = { ok: true, checked: 0, answering: 0, broken: 0, newlyBroken: 0, pictures: 0, fresh: withLinks.length - due.length, remaining: 0 };
  const policy = batch.some((a) => wantsPagePicture(a)) ? await getUploadPolicy() : null;
  let next = 0;
  const worker = async () => {
    while (next < batch.length && Date.now() < deadline) {
      const asset = batch[next++];
      try {
        const check = await checkAssetLink(asset, fetcher);
        const { flipped } = await recordLinkCheck(asset, check, actor);
        r.checked++;
        if (check.ok) r.answering++; else r.broken++;
        if (flipped) r.newlyBroken++;
        if (policy && firstOpen(asset, check) && wantsPagePicture(asset)) {
          if (await autoPagePicture(all, asset, policy, fetcher).catch(() => false)) r.pictures++;
        }
      } catch (e) {
        console.error("link check failed", asset.id, e);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  r.remaining = due.length - r.checked;
  return r;
}

