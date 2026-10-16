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
 * Broken-link checks, page pictures and tracked links where people meet
 * them: the asset drawer (the warning, Check again, the page's picture), the
 * offer page (key links with their badge and tracked links, asset cards), and
 * the dashboard and brand home (the list of links not responding). The pages
 * being checked are served by a tiny server on this machine; the dev server
 * has to run with BRANDOS_ALLOW_PRIVATE_FETCH=1 so it may fetch them (outside
 * production only; see src/server/link-fetcher.ts).
 */

test.use({ viewport: { width: 1440, height: 940 } });

/** Partner Co-Marketing: an offer no other spec counts, so the test pages can be linked to it. */
const OFFER = "of16";
/** Where server actions are posted from. */
const FROM = "/brands/br1/assets";

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

/** Creates (or, with `id`, updates) a brand asset with this link, the way the asset form does; `linked` puts it on the test offer. */
async function saveAsset(page: Page, fields: { id?: string; name: string; url: string; type?: string; linked?: boolean }) {
  const body = await callAction(page, FROM, "app/actions.ts", "saveAsset", [{
    ...(fields.id && { id: fields.id }), brandId: "br1", name: fields.name, type: fields.type ?? "Landing page", url: fields.url, offerIds: fields.linked ? [OFFER] : [],
  }]);
  expect(body).toContain('"ok":true');
  return fields.id ?? body.match(/"id":"(as[a-z0-9]+)"/)![1];
}

/** The asset drawer, opened on the asset's own link. */
async function drawerFor(page: Page, id: string, name: string) {
  await page.goto(`${FROM}?asset=${id}`);
  await settle(page);
  return page.getByRole("dialog", { name });
}

const TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

test("tracked links: the rules, then the builder from the offer's key links and CTAs", async ({ page, context }) => {
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
  await page.goto("/offers/of15");
  await settle(page);
  // Campaign is the offer, content the landing page.
  const trigger = page.getByRole("button", { name: "Tracked links for Free Audit Landing Page" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Tracked links" });
  await expect(dialog).toContainText("For Free Audit Landing Page.");
  const meta = dialog.locator("li").filter({ has: page.getByText("Meta", { exact: true }) });
  const want = "https://quokkaforgood.org/audit?utm_source=facebook&utm_medium=paid_social&utm_campaign=free-marketing-audit&utm_content=free-audit-landing-page";
  await expect(meta.locator("code")).toHaveText(want);
  await meta.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByText("Link copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(want);

  // Editing the campaign changes every row; the custom row takes any source and medium.
  await dialog.getByLabel("Campaign").fill("Spring Push");
  await expect(dialog.locator("li").filter({ has: page.getByText("Google Ads", { exact: true }) }).locator("code"))
    .toHaveText("https://quokkaforgood.org/audit?utm_source=google&utm_medium=cpc&utm_campaign=spring-push&utm_content=free-audit-landing-page");
  const custom = dialog.locator("li").filter({ has: page.getByText("Custom", { exact: true }) });
  await expect(custom.getByRole("button", { name: "Copy" })).toBeDisabled();
  await custom.getByLabel("Custom source").fill("Partner Site");
  await custom.getByLabel("Custom medium").fill("referral");
  await expect(custom.locator("code")).toHaveText(/utm_source=partner-site&utm_medium=referral&utm_campaign=spring-push/);
  const social = dialog.locator("li").filter({ has: page.getByText("Organic social", { exact: true }) });
  await social.getByLabel("Network").selectOption("instagram");
  await expect(social.locator("code")).toHaveText(/utm_source=instagram&utm_medium=social/);
  // Escape closes it, not the page, and focus goes back.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // A CTA has its own, with its words as the content; a new dialog starts from the defaults again.
  await page.getByRole("button", { name: "Tracked links for Book a Free Audit" }).click();
  await expect(dialog.locator("li").filter({ has: page.getByText("Meta", { exact: true }) }).locator("code"))
    .toHaveText("https://quokkaforgood.org/audit?utm_source=facebook&utm_medium=paid_social&utm_campaign=free-marketing-audit&utm_content=book-a-free-audit");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("a link that answers 404 is flagged, and one that opens is not", async ({ page }) => {
  await signIn(page);
  const name = `Link check test page ${tag}`;
  const id = await saveAsset(page, { name, url: `${base}/missing`, linked: true });

  const body = await callAction(page, FROM, "app/link-actions.ts", "checkLinkNow", [id]);
  expect(body).toContain('"status":404');
  // In the drawer: what failed and when, under the title.
  let drawer = await drawerFor(page, id, name);
  await expect(drawer.getByText("Link not responding (404)")).toBeVisible();
  await expect(drawer.getByText(/checked \d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2}/)).toBeVisible();
  // On the offer: a badge on its card and beside its key link.
  await page.goto(`/offers/${OFFER}`);
  await settle(page);
  const card = page.getByRole("tabpanel", { name: /^Assets/ }).getByRole("button", { name: new RegExp(`^Landing page ${name}`) });
  await expect(card.getByText("Link not responding", { exact: true })).toBeVisible();
  const keyLinks = page.getByRole("complementary", { name: "Offer summary" });
  await expect(keyLinks.locator("li").filter({ hasText: name }).getByText("Link not responding", { exact: true })).toBeVisible();

  // Check again: still 404, and it says so.
  drawer = await drawerFor(page, id, name);
  await page.waitForTimeout(10_500); // a second press within 10 seconds reuses the last result
  await drawer.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByText("Still not responding: Page not found (404)")).toBeVisible();

  // A new address hides the old result at once, before it is checked.
  await saveAsset(page, { id, name, url: `${base}/moved`, linked: true });
  drawer = await drawerFor(page, id, name);
  await expect(drawer.getByText(/Link not responding/)).toHaveCount(0);

  // It redirects to a page that refuses HEAD but opens with GET.
  hits.length = 0;
  const ok = await callAction(page, FROM, "app/link-actions.ts", "checkLinkNow", [id]);
  expect(ok).toContain('"ok":true');
  expect(ok).toContain('"status":200');
  expect(hits).toEqual(expect.arrayContaining(["HEAD /moved", "HEAD /ok", "GET /ok"]));
  drawer = await drawerFor(page, id, name);
  await expect(drawer.getByText(/Link not responding/)).toHaveCount(0);

  // When a link that opened stops opening, history says so once.
  movedBreaks = true;
  await page.waitForTimeout(10_500);
  const broke = await callAction(page, FROM, "app/link-actions.ts", "checkLinkNow", [id]);
  expect(broke).toContain('"status":404');
  drawer = await drawerFor(page, id, name);
  await expect(drawer.getByText("Link not responding (404)")).toBeVisible();
  await drawer.getByRole("tab", { name: /^History/ }).click();
  await expect(drawer.getByText("Found a broken link on: Page not found (404)", { exact: true })).toHaveCount(1);
  movedBreaks = false;
});

test("a link that never answers, or whose domain does not exist, says so plainly", async ({ page }) => {
  await signIn(page);
  const slow = await saveAsset(page, { name: `Slow page ${tag}`, url: `${base}/slow` });
  const started = Date.now();
  const body = await callAction(page, FROM, "app/link-actions.ts", "checkLinkNow", [slow]);
  expect(body).toContain("Did not answer in 8 seconds");
  // A page that does not answer HEAD is not asked again with GET, so it takes one timeout, not two.
  expect(Date.now() - started).toBeLessThan(15_000);
  const nowhere = await saveAsset(page, { name: `Nowhere page ${tag}`, url: "no-such-place.invalid/landing" });
  expect(await callAction(page, FROM, "app/link-actions.ts", "checkLinkNow", [nowhere])).toMatch(/No such domain|The domain could not be looked up/);
  const drawer = await drawerFor(page, slow, `Slow page ${tag}`);
  await expect(drawer.getByText(/^Link not responding · Did not answer in 8 seconds · checked/)).toBeVisible();
});

test("the page's picture becomes the card picture; SVG and missing pictures are refused", async ({ page }) => {
  await signIn(page);
  const name = `Picture test page ${tag}`;
  const id = await saveAsset(page, { name, url: `${base}/ok` });
  const drawer = await drawerFor(page, id, name);
  const thumb = drawer.locator(`img[src*="/api/assets/${id}/thumbnail/"]`);
  await expect(thumb).toHaveCount(0);
  // In the thumbnail panel, beside "Choose image".
  await drawer.getByRole("button", { name: "More asset actions" }).click();
  await page.getByRole("menuitem", { name: "Change thumbnail" }).click();
  const panel = page.getByRole("dialog", { name: "Change thumbnail" });
  await expect(panel.getByRole("button", { name: "Choose image" })).toBeVisible();
  await panel.getByRole("button", { name: "Use the page's picture" }).click();
  await expect(page.getByText("Picture taken from the page")).toBeVisible();
  await expect(panel).toHaveCount(0);
  await expect(thumb).toBeVisible();
  await expect.poll(() => thumb.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(64);

  // An SVG share picture is not used (it can carry script).
  const svgId = await saveAsset(page, { name: `SVG picture page ${tag}`, url: `${base}/svg-only` });
  const svg = await callAction(page, FROM, "app/link-actions.ts", "usePagePicture", [svgId]);
  expect(svg).toContain("is not a PNG, JPG, WebP, GIF or AVIF image");
  // A page that does not open has no picture.
  const gone = await saveAsset(page, { name: `Gone page ${tag}`, url: `${base}/nothing-here` });
  expect(await callAction(page, FROM, "app/link-actions.ts", "usePagePicture", [gone])).toContain("The page did not open (404).");
  // An asset without a link has nothing to take it from, so the panel does not offer it.
  await page.goto("/offers/of1?asset=as41");
  await settle(page);
  await page.getByRole("dialog").getByRole("button", { name: "More asset actions" }).click();
  await page.getByRole("menuitem", { name: "Change thumbnail" }).click();
  await expect(page.getByRole("dialog", { name: "Change thumbnail" }).getByRole("button", { name: "Use the page's picture" })).toHaveCount(0);
});

test("the server refuses people whose role does not allow it, and the cron needs its secret", async ({ page }) => {
  await signIn(page);
  const id = await saveAsset(page, { name: `Permission test page ${tag}`, url: `${base}/ok` });
  // A reviewer cannot change work, so cannot check or take pictures.
  await signIn(page, "Tom Aldridge");
  expect(await callAction(page, FROM, "app/link-actions.ts", "checkLinkNow", [id])).toContain("Your role does not allow that.");
  expect(await callAction(page, FROM, "app/link-actions.ts", "usePagePicture", [id])).toContain("Your role does not allow that.");
  // For an editor, ids are checked before anything is looked up.
  await signIn(page, "Ines Batz");
  expect(await callAction(page, FROM, "app/link-actions.ts", "checkLinkNow", ["../../etc"])).toContain("That is not a valid id.");

  const res = await page.request.get("/api/cron/links", { headers: { Authorization: "Bearer wrong" } });
  expect([401, 503]).toContain(res.status());
});

// The daily run opens every link it has, seed sites included, so it only runs when the dev server's CRON_SECRET is given to the tests.
test("the daily run checks links and gives a new landing page its picture, once", async ({ page }) => {
  test.skip(!process.env.CRON_SECRET, "Set CRON_SECRET (the dev server's) to run the daily check");
  test.setTimeout(300_000);
  const auth = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
  await signIn(page);
  const name = `Auto picture page ${tag}`;
  const id = await saveAsset(page, { name, url: `${base}/ok` });
  const res = await page.request.get("/api/cron/links", { headers: auth, timeout: 280_000 });
  expect(res.status()).toBe(200);
  const r = await res.json();
  expect(r.ok).toBe(true);
  expect(r.checked).toBeGreaterThan(0);
  expect(r.pictures).toBeGreaterThanOrEqual(1);
  const drawer = await drawerFor(page, id, name);
  await expect(drawer.getByText(/Link not responding/)).toHaveCount(0);
  await expect(drawer.locator(`img[src*="/api/assets/${id}/thumbnail/"]`)).toBeVisible();
  // A second run straight after skips everything that is fresh.
  const again = await (await page.request.get("/api/cron/links", { headers: auth, timeout: 280_000 })).json();
  expect(again.checked).toBe(0);
  expect(again.fresh).toBeGreaterThanOrEqual(r.checked);
});

/** The "Links not responding" card on the dashboard or a brand's home. */
const brokenCard = (page: Page) => page.getByRole("heading", { name: /^Links not responding/ }).locator("xpath=ancestor::div[2]");

test("links that stopped opening are listed on the dashboard and the brand home", async ({ page }) => {
  await signIn(page);
  const name = `Listed broken page ${tag}`;
  const id = await saveAsset(page, { name, url: `${base}/missing` });
  await callAction(page, FROM, "app/link-actions.ts", "checkLinkNow", [id]);
  // Listed on the dashboard (with its brand) and on the brand's home, each opening the asset.
  await page.goto("/");
  await settle(page);
  await expect(brokenCard(page).getByRole("button", { name: new RegExp(`^${name}.*Page not found \\(404\\) · Quokka For Good`) })).toBeVisible();
  await page.goto("/brands/br1");
  await settle(page);
  await expect(brokenCard(page).locator("li").filter({ hasText: name }).getByText("Page not found (404)")).toBeVisible();
  await expect(brokenCard(page).getByRole("button", { name: "Check all links" })).toBeVisible();
  await brokenCard(page).getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole("dialog", { name })).toBeVisible();
  await page.keyboard.press("Escape");
  // A new address takes it off the lists at once, before it is checked.
  await saveAsset(page, { id, name, url: `${base}/ok` });
  await page.goto("/");
  await settle(page);
  await expect(page.getByRole("button", { name: `Check again: ${name}` })).toHaveCount(0);
  await expect(brokenCard(page).getByText(name)).toHaveCount(0);
  // An editor cannot check a whole brand; that is for admins and managers.
  await signIn(page, "Ines Batz");
  expect(await callAction(page, "/brands/br1", "app/link-actions.ts", "checkBrandLinks", ["br1"])).toContain("Only admins and managers can check a whole brand");
});

test("the warnings and the tracked links dialog meet WCAG 2.2 AA, at 1440 and 390", async ({ page }) => {
  await signIn(page);
  // At least one broken link on the offer, so its badge and warning show.
  const name = `A11y test page ${tag}`;
  const id = await saveAsset(page, { name, url: `${base}/missing`, linked: true });
  await callAction(page, FROM, "app/link-actions.ts", "checkLinkNow", [id]);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/offers/${OFFER}`);
    await settle(page);
    const keyLink = page.getByRole("complementary", { name: "Offer summary" }).locator("li").filter({ hasText: name });
    await expect(keyLink.getByText("Link not responding", { exact: true })).toBeVisible();
    let r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(r.violations.map((v) => `${width} offer: ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

    const trigger = keyLink.getByRole("button", { name: `Tracked links for ${name}` });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Tracked links" });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(300); // let the opening fade finish before measuring contrast
    r = await new AxeBuilder({ page }).include("dialog").withTags(TAGS).analyze();
    expect(r.violations.map((v) => `${width} dialog: ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    const drawer = await drawerFor(page, id, name);
    await expect(drawer.getByText("Link not responding (404)")).toBeVisible();
    r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(r.violations.map((v) => `${width} drawer: ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }
});
