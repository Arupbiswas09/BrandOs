import "server-only";
import { isIP } from "node:net";
import { SafeFetchError, normaliseUrl, safeFetch, type SafeFetchOptions, type SafeResponse } from "@/server/safe-fetch";

/*
 * The one way link checks and page pictures reach the web: safeFetch.
 *
 * Tests need a page that answers 404 on purpose, served from this machine,
 * which safeFetch rightly refuses. So, outside production only and only when
 * BRANDOS_ALLOW_PRIVATE_FETCH=1, addresses on this machine itself (localhost,
 * 127.x, ::1) are fetched directly. Every other address still goes through
 * safeFetch, including any redirect away from this machine. In a production
 * build NODE_ENV is "production", so this branch can never run there.
 */

/** Who the daily run's history lines and pictures are from: no particular person. */
export const LINK_CHECKER = "link-checker";

export type Fetcher = (url: string | URL, opts?: SafeFetchOptions) => Promise<SafeResponse>;

const loopbackForTests = () => process.env.NODE_ENV !== "production" && process.env.BRANDOS_ALLOW_PRIVATE_FETCH === "1";

function isLoopback(u: URL) {
  const h = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost") return true;
  if (isIP(h) === 4) return h.startsWith("127.");
  return h === "::1";
}

/** Fetches an address on this machine with the same limits and the same response shape as safeFetch. Tests only. */
async function loopbackFetch(start: URL, opts: SafeFetchOptions): Promise<SafeResponse> {
  const maxBytes = opts.maxBytes ?? 2_000_000;
  let url = start;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 5); hop++) {
    if (!isLoopback(url)) return safeFetch(url, { ...opts, maxRedirects: Math.max(0, (opts.maxRedirects ?? 5) - hop) });
    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
        headers: { "user-agent": "BrandOS link checker (+internal tool)", accept: opts.accept ?? "text/html,application/xhtml+xml,*/*;q=0.8" },
      });
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === "TimeoutError" || name === "AbortError") throw new SafeFetchError("The page took too long to answer.", "timeout");
      const code = (e as { cause?: { code?: string } })?.cause?.code;
      throw new SafeFetchError(code ?? (e as Error)?.message ?? "Could not reach the page.", "network");
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    const loc = res.status >= 300 && res.status < 400 ? headers["location"] : undefined;
    if (loc) { url = normaliseUrl(new URL(loc, url).toString()); continue; }
    const chunks: Uint8Array[] = [];
    let size = 0, truncated = false;
    const reader = res.body?.getReader();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { truncated = true; chunks.push(value.subarray(0, value.length - (size - maxBytes))); await reader.cancel(); break; }
      chunks.push(value);
    }
    return { status: res.status, url: url.toString(), contentType: headers["content-type"] ?? "", headers, body: Buffer.concat(chunks), truncated };
  }
  throw new SafeFetchError("The page redirected too many times.", "too-many-redirects");
}

/** safeFetch, except for the test-only loopback case above. */
export const linkFetch: Fetcher = (raw, opts = {}) => {
  if (!loopbackForTests()) return safeFetch(raw, opts);
  const url = typeof raw === "string" ? normaliseUrl(raw) : raw;
  return isLoopback(url) ? loopbackFetch(url, opts) : safeFetch(url, opts);
};
