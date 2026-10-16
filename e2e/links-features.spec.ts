import AxeBuilder from "@axe-core/playwright";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { buildUtm, readUtm, slug, utmValue } from "../src/lib/utm";
import { pictureCandidates } from "../src/lib/page-meta";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";

/*
 * Broken-link checks, page pictures and tracked links, through the link
 * actions, the real dashboard and brand home (the "Links not responding"
 * card), and the dev preview (/dev/links) for the pieces that live in the
 * asset drawer and on the offer page; those steps move to the drawer and
 * the offer page once they are mounted there, before the preview goes.
 * The pages being checked are served by a tiny server on this machine; the
 * dev server has to run with BRANDOS_ALLOW_PRIVATE_FETCH=1 so it may fetch
 * them (outside production only; see src/server/link-fetcher.ts).
 */

test.use({ viewport: { width: 1440, height: 940 } });

/** A plain PNG in one colour, built in memory. */
function png(w = 64, h = 40, rgb: [number, number, number] = [0x1f, 0x6f, 0x5c]) {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: w }, () => Buffer.from(rgb)))]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

let server: http.Server;
let base = "";
const hits: string[] = [];
let movedBreaks = false;
/** Asset names are unique per run, so a dev database that has seen earlier runs still works. */
const tag = Date.now().toString(36).slice(-5);

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    switch (req.url) {
      case "/slow":
        return; // never answers
      case "/ok":
        // Like many sites, it turns HEAD away; the checker must fall back to GET.
        if (req.method === "HEAD") { res.writeHead(405); res.end(); return; }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end('<!doctype html><html><head><title>Ok</title><meta property="og:image" content="/pic.png?v=1&amp;s=2"><link rel="apple-touch-icon" href="/icon.png"></head><body>Here</body></html>');
        return;
      case "/moved":
        if (movedBreaks) { res.writeHead(404, { "content-type": "text/html" }); res.end("Gone"); return; }
        res.writeHead(301, { location: "/ok" });
        res.end();
        return;
      case "/pic.png?v=1&s=2":
        res.writeHead(200, { "content-type": "image/png" });
        res.end(png());
        return;
      case "/svg-only":
        res.writeHead(200, { "content-type": "text/html" });
        res.end('<html><head><meta property="og:image" content="/pic.svg"></head></html>');
        return;
      case "/pic.svg":
        res.writeHead(200, { "content-type": "image/svg+xml" });
        res.end('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
        return;
      default:
        res.writeHead(404, { "content-type": "text/html" });
        res.end("Not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(() => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }));

/** Creates (or, with `id`, updates) a brand asset with this link, the way the asset form does. */
async function saveAsset(page: Page, fields: { id?: string; name: string; url: string; type?: string }) {
  const body = await callAction(page, "/", "app/actions.ts", "saveAsset", [{
    ...(fields.id && { id: fields.id }), brandId: "br1", name: fields.name, type: fields.type ?? "Landing page", url: fields.url, offerIds: [],
  }]);
  expect(body).toContain('"ok":true');
  return fields.id ?? body.match(/"id":"(as[a-z0-9]+)"/)![1];
}

const card = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
/** The "Links not responding" card on the dashboard or a brand's home. */
const brokenCard = (page: Page) => page.getByRole("heading", { name: /^Links not responding/ }).locator("xpath=ancestor::div[2]");

test("tracked links: the rules, then the builder on the preview", async ({ page, context }) => {
  // The rules, straight from the pure module.
  expect(slug("Free Marketing Audit")).toBe("free-marketing-audit");
  expect(slug("Café & Co’s Giving Day!")).toBe("cafe-and-cos-giving-day");
  expect(utmValue("Paid Social")).toBe("paid-social");
  expect(utmValue("paid_social")).toBe("paid_social");
  expect(buildUtm("quokkaforgood.org/audit", { source: "facebook", medium: "paid_social", campaign: "free-marketing-audit" }))
    .toBe("https://quokkaforgood.org/audit?utm_source=facebook&utm_medium=paid_social&utm_campaign=free-marketing-audit");
  // Existing parameters and the fragment stay; old utm_* are replaced.
  expect(buildUtm("https://ex.org/p?ref=a%20b&utm_source=old&UTM_MEDIUM=x#form", { source: "google", medium: "cpc", campaign: "c", content: "hero" }))
    .toBe("https://ex.org/p?ref=a%20b&utm_source=google&utm_medium=cpc&utm_campaign=c&utm_content=hero#form");
  expect(readUtm(buildUtm("ex.org", { source: "s", medium: "m", campaign: "a b" })!)).toEqual({ source: "s", medium: "m", campaign: "a b" });
  expect(buildUtm("javascript:alert(1)", { source: "s", medium: "m", campaign: "c" })).toBeNull();
  expect(buildUtm("not a link", { source: "s", medium: "m", campaign: "c" })).toBeNull();
  expect(pictureCandidates('<head><meta content="/a.png" property="og:image"><meta name="twitter:image" content="https://cdn.ex.org/b.jpg"><link rel="apple-touch-icon" sizes="120x120" href="i120.png"><link rel="apple-touch-icon" sizes="180x180" href="i180.png"></head>', "https://ex.org/x/page"))
    .toEqual(["https://ex.org/a.png", "https://cdn.ex.org/b.jpg", "https://ex.org/x/i180.png", "https://ex.org/x/i120.png"]);

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);
  await page.goto("/dev/links");
  await settle(page);
  const meta = page.locator("li").filter({ has: page.getByText("Meta", { exact: true }) }).last();
  const want = "https://quokkaforgood.org/audit?utm_source=facebook&utm_medium=paid_social&utm_campaign=free-marketing-audit&utm_content=free-audit-landing-page";
  await expect(meta.locator("code")).toHaveText(want);
  await meta.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByText("Link copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(want);

  // Editing the campaign changes every row; the custom row takes any source and medium.
  const builder = page.locator("ul").filter({ has: page.getByText("Custom", { exact: true }) }).last().locator("..");
  await builder.getByLabel("Campaign").fill("Spring Push");
  await expect(builder.locator("li").filter({ has: page.getByText("Google Ads", { exact: true }) }).locator("code"))
    .toHaveText("https://quokkaforgood.org/audit?utm_source=google&utm_medium=cpc&utm_campaign=spring-push&utm_content=free-audit-landing-page");
  const custom = builder.locator("li").filter({ has: page.getByText("Custom", { exact: true }) });
  await expect(custom.getByRole("button", { name: "Copy" })).toBeDisabled();
  await custom.getByLabel("Custom source").fill("Partner Site");
  await custom.getByLabel("Custom medium").fill("referral");
  await expect(custom.locator("code")).toHaveText(/utm_source=partner-site&utm_medium=referral&utm_campaign=spring-push/);
  const social = builder.locator("li").filter({ has: page.getByText("Organic social", { exact: true }) });
  await social.getByLabel("Network").selectOption("instagram");
  await expect(social.locator("code")).toHaveText(/utm_source=instagram&utm_medium=social/);
});

test("a link that answers 404 is flagged, and one that opens is not", async ({ page }) => {
  await signIn(page);
  const id = await saveAsset(page, { name: `Link check test page ${tag}`, url: `${base}/missing` });

  const body = await callAction(page, "/", "app/link-actions.ts", "checkLinkNow", [id]);
  expect(body).toContain('"status":404');
  await page.goto("/dev/links");
  await settle(page);
  const row = card(page, `Link check test page ${tag}`);
  await expect(row.getByText("Link not responding (404)")).toBeVisible();
  await expect(row.getByText(/checked \d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2}/)).toBeVisible();
  await expect(row.getByText("Link not responding", { exact: true })).toBeVisible(); // the badge
  // Listed on the dashboard (with its brand) and on the brand's home, each opening the asset.
  await page.goto("/");
  await settle(page);
  const dashboard = brokenCard(page);
  await expect(dashboard.getByRole("button", { name: new RegExp(`^Link check test page ${tag}.*Page not found \\(404\\) · Quokka For Good`) })).toBeVisible();
  await page.goto("/brands/br1");
  await settle(page);
  await expect(brokenCard(page).locator("li").filter({ hasText: `Link check test page ${tag}` }).getByText("Page not found (404)")).toBeVisible();
  await expect(brokenCard(page).getByRole("button", { name: "Check all links" })).toBeVisible();
  await brokenCard(page).getByRole("button", { name: new RegExp(`^Link check test page ${tag}`) }).click();
  await expect(page.getByRole("dialog", { name: `Link check test page ${tag}` })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/dev/links");
  await settle(page);

  // Check again: still 404, and it says so.
  await page.waitForTimeout(10_500); // a second press within 10 seconds reuses the last result
  await row.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByText("Still not responding: Page not found (404)")).toBeVisible();

  // A new address hides the old result at once, before it is checked.
  await saveAsset(page, { id, name: `Link check test page ${tag}`, url: `${base}/moved` });
  await page.goto("/dev/links");
  await settle(page);
  await expect(row.getByText("Link not responding (404)")).toHaveCount(0);
  await expect(row.getByTestId("check")).toHaveText("never checked");

  // It redirects to a page that refuses HEAD but opens with GET.
  hits.length = 0;
  await row.getByRole("button", { name: "Check now" }).click();
  await expect(page.getByText("Link opens")).toBeVisible();
  await expect(row.getByTestId("check")).toHaveText("ok 200");
  expect(hits).toEqual(expect.arrayContaining(["HEAD /moved", "HEAD /ok", "GET /ok"]));
  await expect(row.getByText(/Link not responding/)).toHaveCount(0);
  // Off the dashboard's list again (the card goes altogether once every link opens).
  await page.goto("/");
  await settle(page);
  await expect(page.getByRole("button", { name: new RegExp(`^Check again: Link check test page ${tag}$`) })).toHaveCount(0);
  await expect(brokenCard(page).getByText(`Link check test page ${tag}`)).toHaveCount(0);
  await page.goto("/dev/links");
  await settle(page);

  // When a link that opened stops opening, history says so once.
  movedBreaks = true;
  await page.waitForTimeout(10_500);
  await row.getByRole("button", { name: "Check now" }).click();
  await expect(row.getByText("Link not responding (404)")).toBeVisible();
  await page.goto(`/dev/links?asset=${id}`);
  await settle(page);
  const drawer = page.getByRole("dialog", { name: `Link check test page ${tag}` });
  await drawer.getByRole("tab", { name: /^History/ }).click();
  await expect(drawer.getByText("Found a broken link on: Page not found (404)", { exact: true })).toHaveCount(1);
  movedBreaks = false;
});

test("a link that never answers, or whose domain does not exist, says so plainly", async ({ page }) => {
  await signIn(page);
  const slow = await saveAsset(page, { name: `Slow page ${tag}`, url: `${base}/slow` });
  const started = Date.now();
  const body = await callAction(page, "/", "app/link-actions.ts", "checkLinkNow", [slow]);
  expect(body).toContain("Did not answer in 8 seconds");
  // A page that does not answer HEAD is not asked again with GET, so it takes one timeout, not two.
  expect(Date.now() - started).toBeLessThan(15_000);
  const nowhere = await saveAsset(page, { name: `Nowhere page ${tag}`, url: "no-such-place.invalid/landing" });
  expect(await callAction(page, "/", "app/link-actions.ts", "checkLinkNow", [nowhere])).toMatch(/No such domain|The domain could not be looked up/);
  await page.goto("/dev/links");
  await settle(page);
  await expect(card(page, `Slow page ${tag}`).getByText(/^Link not responding · Did not answer in 8 seconds · checked/)).toBeVisible();
});

test("the page's picture becomes the card picture; SVG and missing pictures are refused", async ({ page }) => {
  await signIn(page);
  const id = await saveAsset(page, { name: `Picture test page ${tag}`, url: `${base}/ok` });
  await page.goto("/dev/links");
  await settle(page);
  const row = card(page, `Picture test page ${tag}`);
  await expect(row.getByTestId("thumb")).toHaveCount(0);
  await row.getByRole("button", { name: "Use the page's picture" }).click();
  await expect(page.getByText("Picture taken from the page")).toBeVisible();
  const thumb = row.getByTestId("thumb");
  await expect(thumb).toHaveAttribute("src", new RegExp(`/api/assets/${id}/thumbnail/`));
  await expect.poll(() => thumb.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(64);

  // An SVG share picture is not used (it can carry script).
  const svgId = await saveAsset(page, { name: `SVG picture page ${tag}`, url: `${base}/svg-only` });
  const svg = await callAction(page, "/", "app/link-actions.ts", "usePagePicture", [svgId]);
  expect(svg).toContain("is not a PNG, JPG, WebP, GIF or AVIF image");
  // A page that does not open has no picture.
  const gone = await saveAsset(page, { name: `Gone page ${tag}`, url: `${base}/nothing-here` });
  expect(await callAction(page, "/", "app/link-actions.ts", "usePagePicture", [gone])).toContain("The page did not open (404).");
});

test("the server refuses people whose role does not allow it, and the cron needs its secret", async ({ page }) => {
  await signIn(page);
  const id = await saveAsset(page, { name: `Permission test page ${tag}`, url: `${base}/ok` });
  // A reviewer cannot change work, so cannot check or take pictures.
  await signIn(page, "Tom Aldridge");
  expect(await callAction(page, "/", "app/link-actions.ts", "checkLinkNow", [id])).toContain("Your role does not allow that.");
  expect(await callAction(page, "/", "app/link-actions.ts", "usePagePicture", [id])).toContain("Your role does not allow that.");
  // An editor cannot check a whole brand; that is for admins and managers.
  await signIn(page, "Ines Batz");
  expect(await callAction(page, "/", "app/link-actions.ts", "checkBrandLinks", ["br1"])).toContain("Only admins and managers can check a whole brand");
  // Ids are checked before anything is looked up.
  expect(await callAction(page, "/", "app/link-actions.ts", "checkLinkNow", ["../../etc"])).toContain("That is not a valid id.");

  const res = await page.request.get("/api/cron/links", { headers: { Authorization: "Bearer wrong" } });
  expect([401, 503]).toContain(res.status());
});

// The daily run opens every link it has, seed sites included, so it only runs when the dev server's CRON_SECRET is given to the tests.
test("the daily run checks links and gives a new landing page its picture, once", async ({ page }) => {
  test.skip(!process.env.CRON_SECRET, "Set CRON_SECRET (the dev server's) to run the daily check");
  test.setTimeout(300_000);
  const auth = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
  await signIn(page);
  const id = await saveAsset(page, { name: `Auto picture page ${tag}`, url: `${base}/ok` });
  const res = await page.request.get("/api/cron/links", { headers: auth, timeout: 280_000 });
  expect(res.status()).toBe(200);
  const r = await res.json();
  expect(r.ok).toBe(true);
  expect(r.checked).toBeGreaterThan(0);
  expect(r.pictures).toBeGreaterThanOrEqual(1);
  await page.goto("/dev/links");
  await settle(page);
  const row = card(page, `Auto picture page ${tag}`);
  await expect(row.getByTestId("check")).toHaveText("ok 200");
  await expect(row.getByTestId("thumb")).toHaveAttribute("src", new RegExp(`/api/assets/${id}/thumbnail/`));
  // A second run straight after skips everything that is fresh.
  const again = await (await page.request.get("/api/cron/links", { headers: auth, timeout: 280_000 })).json();
  expect(again.checked).toBe(0);
  expect(again.fresh).toBeGreaterThanOrEqual(r.checked);
});

test("the preview, its warnings and the tracked links dialog meet WCAG 2.2 AA", async ({ page }) => {
  await signIn(page);
  // Make sure there is at least one broken link to show.
  const id = await saveAsset(page, { name: `A11y test page ${tag}`, url: `${base}/missing` });
  await callAction(page, "/", "app/link-actions.ts", "checkLinkNow", [id]);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dev/links");
    await settle(page);
    await expect(card(page, `A11y test page ${tag}`).getByText("Link not responding (404)")).toBeVisible();
    const tags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
    const r = await new AxeBuilder({ page }).withTags(tags).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    const trigger = card(page, `A11y test page ${tag}`).getByRole("button", { name: "Tracked links" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Tracked links" });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(300); // let the opening fade finish before measuring contrast
    const d = await new AxeBuilder({ page }).include("dialog").withTags(tags).analyze();
    expect(d.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});
