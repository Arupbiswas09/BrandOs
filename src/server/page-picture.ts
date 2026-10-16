import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import type { Asset, FileRef } from "@/db/schema";
import { checkBatch, limitsFor, type MyUploadLimits, type UploadPolicy } from "@/lib/upload-policy";
import { pictureCandidates } from "@/lib/page-meta";
import type { All } from "@/server/data";
import { myLimits, storageUsage } from "@/server/limits";
import { LINK_CHECKER, linkFetch, type Fetcher } from "@/server/link-fetcher";
import { SafeFetchError, normaliseUrl } from "@/server/safe-fetch";
import { removeStoredFile, storageProblem } from "@/server/storage";
import { keyInUse, sniffThumbnailType, storeThumbnail } from "@/server/thumbnails";
import { maxUploadBytes } from "@/server/uploads";

/*
 * "Use the page's picture": the card picture for a landing page, taken from
 * the image the page itself offers for sharing (og:image and friends). No
 * headless browser and no screenshot service: the page's HTML is read (up to
 * 2 MB) and its picture downloaded, both through the guarded fetch, and only
 * PNG, JPG, WebP, GIF or AVIF whose first bytes prove it are kept.
 */

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
/** Never hold more than this in memory for one picture, whatever the upload limit says. */
const HARD_MAX = 25 * 1024 * 1024;
const PAGE_MAX = 2_000_000;
const IMAGE_ACCEPT = "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1";

export type PagePicture = { ok: true; bytes: Uint8Array<ArrayBuffer>; type: string; from: string } | { ok: false; error: string };

const pageError = (e: unknown) =>
  e instanceof SafeFetchError && e.code === "timeout" ? "The page took too long to answer."
  : e instanceof SafeFetchError && e.code === "blocked" ? "That address is on a private network, so it is not opened."
  : e instanceof SafeFetchError && e.code === "invalid-url" ? "This asset's link is not a web address."
  : "The page could not be reached.";

/** Downloads one image and keeps it only if it really is an allowed raster type within `maxBytes`. */
async function fetchImage(url: string, maxBytes: number, fetcher: Fetcher): Promise<PagePicture> {
  const res = await fetcher(url, { method: "GET", maxBytes: maxBytes + 1, accept: IMAGE_ACCEPT });
  if (res.status < 200 || res.status >= 300) return { ok: false, error: `The page's picture did not open (${res.status}).` };
  if (res.truncated || res.body.length > maxBytes) return { ok: false, error: `The page's picture is larger than your ${Math.round(maxBytes / 1024 / 1024)} MB limit for images.` };
  if (/svg|html|xml|javascript/i.test(res.contentType)) return { ok: false, error: "The page's picture is not a PNG, JPG, WebP, GIF or AVIF image." };
  const type = sniffThumbnailType(res.body.subarray(0, 16));
  if (!type) return { ok: false, error: "The page's picture is not a PNG, JPG, WebP, GIF or AVIF image." };
  return { ok: true, bytes: new Uint8Array(res.body), type, from: res.url };
}

/** The share picture of the page at `pageUrl`, or why there is none. Never throws. */
export async function findPagePicture(pageUrl: string, maxBytes: number, fetcher: Fetcher = linkFetch): Promise<PagePicture> {
  const limit = Math.min(maxBytes, HARD_MAX);
  try {
    const url = normaliseUrl(pageUrl);
    const page = await fetcher(url, { method: "GET", maxBytes: PAGE_MAX, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" });
    if (page.status < 200 || page.status >= 300) return { ok: false, error: `The page did not open (${page.status}).` };
    // A link straight to an image is its own picture.
    if (/^image\//i.test(page.contentType)) return fetchImage(page.url, limit, fetcher);
    if (page.contentType && !/html|xml/i.test(page.contentType)) return { ok: false, error: "That link is not a web page, so it has no share picture." };
    const candidates = pictureCandidates(page.body.toString("utf8"), page.url).slice(0, 4);
    if (!candidates.length) return { ok: false, error: "The page does not offer a share picture. Add one with Change thumbnail instead." };
    let last: PagePicture = { ok: false, error: "The page's picture could not be used." };
    for (const c of candidates) {
      try {
        last = await fetchImage(c, limit, fetcher);
        if (last.ok) return last;
      } catch (e) {
        last = { ok: false, error: e instanceof SafeFetchError && e.code === "timeout" ? "The page's picture took too long to download." : "The page's picture could not be downloaded." };
      }
    }
    return last;
  } catch (e) {
    return { ok: false, error: pageError(e) };
  }
}

/** Stores the picture through the thumbnail storage, under the same keys and served by the same route as an uploaded one. */
function store(asset: Pick<Asset, "id">, pic: Extract<PagePicture, { ok: true }>, userId: string): Promise<FileRef> {
  const file = new File([pic.bytes], `Page picture.${EXT[pic.type]}`, { type: pic.type });
  return storeThumbnail(`thumbnails/assets/${asset.id}`, file, pic.type, userId, (v) => `/api/assets/${asset.id}/thumbnail/${v}`);
}

/** Why this picture cannot be stored for this person (type off, too large, allowance used up), or null. */
function refusal(pic: Extract<PagePicture, { ok: true }>, limits: MyUploadLimits): string | null {
  return checkBatch([{ name: `Page picture.${EXT[pic.type]}`, size: pic.bytes.byteLength }], limits);
}

/**
 * Someone asked for it: replaces the asset's thumbnail with the page's
 * picture, logs it like any thumbnail change and removes the old picture
 * when nothing else uses it. The caller has checked permission.
 */
export async function setPagePicture(all: All, asset: Asset, me: { id: string; uploadLimitMb: number | null; storageQuotaMb: number | null }, policy: UploadPolicy, fetcher: Fetcher = linkFetch): Promise<{ ok: true; thumbnail: FileRef } | { ok: false; error: string }> {
  const problem = storageProblem();
  if (problem) return { ok: false, error: problem };
  if (!asset.url.trim()) return { ok: false, error: "This asset has no link to take a picture from." };
  const limits = myLimits(all, policy, me);
  if (!limits.kinds.image.allowed) return { ok: false, error: "Images cannot be uploaded here. An admin has switched them off." };
  const pic = await findPagePicture(asset.url, limits.kinds.image.maxBytes, fetcher);
  if (!pic.ok) return pic;
  const refused = refusal(pic, limits);
  if (refused) return { ok: false, error: refused };
  const thumbnail = await store(asset, pic, me.id);
  const db = await getDb();
  await db.update(s.assets).set({ thumbnail, updatedAt: new Date() }).where(eq(s.assets.id, asset.id));
  await db.insert(s.activity).values({
    id: "ac" + crypto.randomUUID().replace(/-/g, "").slice(0, 10), userId: me.id, action: "changed the thumbnail of", type: "asset",
    itemId: asset.id, label: asset.name, field: `the page's picture (${new URL(pic.from).hostname})`,
  });
  // A clone made since keeps pointing at the old picture, so it stays while anything uses it.
  const old = asset.thumbnail?.key;
  if (old && !keyInUse(all, old, { assetId: asset.id })) await removeStoredFile(old);
  return { ok: true, thumbnail };
}

/**
 * The daily run's quiet version, for a page that just opened for the first
 * time and has no picture: within its owner's limits (the workspace's when
 * nobody owns it), only if the asset still has no thumbnail when it lands,
 * and without a history line. True when a picture was set.
 */
export async function autoPagePicture(all: All, asset: Asset, policy: UploadPolicy, fetcher: Fetcher = linkFetch): Promise<boolean> {
  if (storageProblem()) return false;
  const owner = all.users.find((u) => u.id === asset.ownerId);
  const limits = owner ? myLimits(all, policy, owner) : limitsFor(policy, {}, { ...storageUsage(all), personBytes: 0 }, maxUploadBytes());
  if (!limits.kinds.image.allowed) return false;
  const pic = await findPagePicture(asset.url, limits.kinds.image.maxBytes, fetcher);
  if (!pic.ok || refusal(pic, limits)) return false;
  const thumbnail = await store(asset, pic, owner?.id ?? LINK_CHECKER);
  const db = await getDb();
  // Someone may have chosen a picture while this one downloaded; theirs wins.
  const set = await db.update(s.assets).set({ thumbnail }).where(and(eq(s.assets.id, asset.id), isNull(s.assets.thumbnail))).returning({ id: s.assets.id });
  if (!set.length) {
    if (thumbnail.key) await removeStoredFile(thumbnail.key);
    return false;
  }
  return true;
}
