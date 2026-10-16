import "server-only";
import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

/*
 * Fetching pages people paste in (link checks, page pictures, "start a brand
 * from its website") without letting anyone reach the server's own network.
 *
 * Only http and https. Every address a host name resolves to is checked at
 * connect time (so a name cannot resolve to something private after we have
 * looked), redirects are followed by hand and each hop is checked again, and
 * time and size are capped.
 */

export type SafeResponse = {
  status: number;
  /** Where the last redirect landed. */
  url: string;
  contentType: string;
  headers: Record<string, string>;
  body: Buffer;
  /** True when the body was cut at maxBytes. */
  truncated: boolean;
};

export type SafeFetchOptions = {
  method?: "GET" | "HEAD";
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  accept?: string;
};

export class SafeFetchError extends Error {
  readonly code: "invalid-url" | "blocked" | "timeout" | "too-many-redirects" | "network";
  constructor(message: string, code: SafeFetchError["code"]) {
    super(message);
    this.code = code;
  }
}

/** Adds https:// to a bare domain and refuses anything that is not http(s). */
export function normaliseUrl(raw: string): URL {
  const t = raw.trim();
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`); } catch { throw new SafeFetchError("That is not a web address.", "invalid-url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new SafeFetchError("Only http and https addresses can be opened.", "invalid-url");
  if (u.username || u.password) throw new SafeFetchError("Addresses with a user name or password are not opened.", "invalid-url");
  return u;
}

/** Loopback, private, link-local, carrier-grade NAT, multicast, reserved and cloud-metadata ranges. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  return v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
}

/** A DNS lookup that refuses private addresses, used at connect time. */
const guardedLookup: typeof dnsLookup = ((hostname: string, options: unknown, callback: (err: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void) => {
  const cb = typeof options === "function" ? (options as typeof callback) : callback;
  const opts = typeof options === "function" ? {} : (options as object);
  dnsLookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err, "");
    const list = (addresses as { address: string; family: number }[]);
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (!list.length || bad) return cb(Object.assign(new Error("blocked address"), { code: "EBLOCKED" }), "");
    if ((opts as { all?: boolean }).all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}) as typeof dnsLookup;

function once(url: URL, o: Required<Pick<SafeFetchOptions, "method" | "timeoutMs" | "maxBytes" | "accept">>): Promise<SafeResponse> {
  if (isIP(url.hostname.replace(/^\[|\]$/g, "")) && isPrivateAddress(url.hostname.replace(/^\[|\]$/g, ""))) {
    return Promise.reject(new SafeFetchError("That address is on a private network.", "blocked"));
  }
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(url, {
      method: o.method,
      lookup: guardedLookup,
      timeout: o.timeoutMs,
      headers: { "user-agent": "BrandOS link checker (+internal tool)", accept: o.accept, "accept-encoding": "identity" },
    }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers[k] = Array.isArray(v) ? v.join(", ") : String(v);
      res.on("data", (c: Buffer) => {
        if (truncated) return;
        size += c.length;
        if (size > o.maxBytes) { truncated = true; chunks.push(c.subarray(0, c.length - (size - o.maxBytes))); res.destroy(); return; }
        chunks.push(c);
      });
      const done = () => resolve({ status: res.statusCode ?? 0, url: url.toString(), contentType: headers["content-type"] ?? "", headers, body: Buffer.concat(chunks), truncated });
      res.on("end", done);
      res.on("close", done);
      res.on("error", (e) => reject(new SafeFetchError(e.message, "network")));
    });
    const deadline = setTimeout(() => req.destroy(new SafeFetchError("The page took too long to answer.", "timeout")), o.timeoutMs);
    req.on("timeout", () => req.destroy(new SafeFetchError("The page took too long to answer.", "timeout")));
    req.on("error", (e: NodeJS.ErrnoException) => {
      clearTimeout(deadline);
      if (e instanceof SafeFetchError) return reject(e);
      reject(e.code === "EBLOCKED" ? new SafeFetchError("That address is on a private network.", "blocked") : new SafeFetchError(e.message || "Could not reach the page.", "network"));
    });
    req.on("close", () => clearTimeout(deadline));
    req.end();
  });
}

/** GET or HEAD a public web page, following up to `maxRedirects` checked redirects. */
export async function safeFetch(raw: string | URL, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const o = { method: opts.method ?? "GET", timeoutMs: opts.timeoutMs ?? 8000, maxBytes: opts.maxBytes ?? 2_000_000, accept: opts.accept ?? "text/html,application/xhtml+xml,*/*;q=0.8" } as const;
  let url = typeof raw === "string" ? normaliseUrl(raw) : raw;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 5); hop++) {
    const res = await once(url, o);
    const loc = res.status >= 300 && res.status < 400 ? res.headers["location"] : undefined;
    if (!loc) return res;
    url = normaliseUrl(new URL(loc, url).toString());
  }
  throw new SafeFetchError("The page redirected too many times.", "too-many-redirects");
}
