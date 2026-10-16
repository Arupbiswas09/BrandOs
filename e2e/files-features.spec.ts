import { deflateSync } from "node:zlib";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";

/*
 * Bulk upload, earlier versions of files and previews, through the dev
 * preview at /dev/files and the routes behind it. Once the components are
 * mounted in the real pages these steps move there.
 */

test.use({ viewport: { width: 1440, height: 940 } });

const DEV = "/dev/files";
/**
 * Partner Co-Marketing (Quokka For Good): an offer no other spec looks at, so
 * the assets made here do not change what other specs count or drag.
 */
const OFFER = "of16";

/** A plain PNG in two colours, built in memory so the tests need no fixture files. */
function png(w = 320, h = 200, a: [number, number, number] = [0x2d, 0x4a, 0x5c], b: [number, number, number] = [0xe8, 0xb4, 0x4a]) {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => { let c = 0xffffffff; for (const x of buf) c = table[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) rows.push(Buffer.concat([Buffer.from([0]), ...Array.from({ length: w }, (_, x) => Buffer.from(x + y < (w + h) / 2 ? a : b))]));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

/** A one-page PDF with a correct cross-reference table. */
function pdf(text = "Grant readiness checklist") {
  const stream = `BT /F1 28 Tf 48 300 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 396] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const at: number[] = [];
  objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** A two-second WebM recorded in the page (canvas and MediaRecorder), so no video fixture is needed. */
async function webm(page: Page) {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 320; c.height = 180;
    const ctx = c.getContext("2d")!;
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: "video/webm" });
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => parts.push(e.data);
    rec.start(100);
    const t0 = performance.now();
    await new Promise<void>((done) => {
      const draw = () => {
        const t = performance.now() - t0;
        ctx.fillStyle = `hsl(${(t / 8) % 360} 45% 40%)`; ctx.fillRect(0, 0, 320, 180);
        if (t < 2000) requestAnimationFrame(draw); else done();
      };
      draw();
    });
    rec.stop();
    await new Promise((r) => (rec.onstop = r));
    const buf = new Uint8Array(await new Blob(parts, { type: "video/webm" }).arrayBuffer());
    let s = "";
    for (const x of buf) s += String.fromCharCode(x);
    return btoa(s);
  });
  return Buffer.from(b64, "base64");
}

const run = () => Date.now().toString(36);
const bulkPanel = (page: Page) => page.getByRole("region", { name: "Bulk upload" }).locator("section").first();
const here = (page: Page) => page.getByRole("list", { name: "Assets here now" });

/** One asset made through the bulk route, with its stored file. */
async function makeAsset(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  const res = await page.request.post("/api/bulk-assets", { multipart: { brandId: "br1", offerId: OFFER, type: "auto", files: file } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.assets[0] as { id: string; name: string; file: { key: string; url: string; name: string } };
}

test("bulk upload: three images and a PDF dropped on an offer become four linked assets", async ({ page }) => {
  await signIn(page);
  await page.goto(DEV);
  await settle(page);
  await page.getByLabel("Where").selectOption(`offer:${OFFER}`);
  const id = run();
  const panel = bulkPanel(page);
  await expect(panel.getByRole("heading", { name: "Add files as assets" })).toBeVisible();
  await expect(panel.getByText(/becomes its own draft asset in Partner Co-Marketing/)).toBeVisible();

  await panel.locator('input[type="file"]').setInputFiles([
    { name: `${id}-summer_sale-story.png`, mimeType: "image/png", buffer: png() },
    { name: `${id}-black-friday-banner.png`, mimeType: "image/png", buffer: png(400, 210) },
    { name: `${id}-carousel_slide-3.png`, mimeType: "image/png", buffer: png(300, 300) },
    { name: `${id}-grant-checklist.pdf`, mimeType: "application/pdf", buffer: pdf() },
    { name: "setup.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") },
  ]);
  const rows = panel.getByRole("list", { name: "Files to add" }).getByRole("listitem");
  await expect(rows).toHaveCount(5);
  // Names are tidied from the file names, and can be changed before adding.
  await expect(panel.getByLabel(`Asset name for ${id}-summer_sale-story.png`)).toHaveValue(`${id[0].toUpperCase()}${id.slice(1)} summer sale story`);
  await panel.getByLabel(`Asset name for ${id}-grant-checklist.pdf`).fill(`${id} Grant readiness checklist`);
  await expect(rows.filter({ hasText: "Social post" })).toHaveCount(3);
  await expect(rows.filter({ hasText: `${id}-grant-checklist.pdf` })).toContainText("Document");
  // A program is refused on its own row and left out of the count.
  await expect(rows.filter({ hasText: "setup.exe" })).toContainText("does not take this kind of file");
  await panel.getByRole("button", { name: "Add 4 assets" }).click();

  await expect(panel.getByRole("heading", { name: "4 assets added" })).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByRole("button", { name: "Open the first" })).toBeVisible();
  // All four are on the offer now, as drafts with one file each.
  const mine = here(page).getByRole("listitem").filter({ hasText: new RegExp(id, "i") });
  await expect(mine).toHaveCount(4);
  await expect(mine.filter({ hasText: "Draft · 1 file" })).toHaveCount(4);
  await expect(mine.filter({ hasText: `${id} Grant readiness checklist` })).toContainText("Document");

  // One line in the activity feed for the whole drop, on the offer.
  await page.goto("/");
  await settle(page);
  const line = page.getByRole("button", { name: /Added 4 assets to.*Partner Co-Marketing · Priya/ }).first();
  await expect(line).toBeVisible();

  // Dropped inside a folder, they are filed there too; a later request of the same drop joins the same activity line.
  const made = await callAction(page, `/offers/${OFFER}`, "app/folder-actions.ts", "createFolder", [OFFER, `${id} creatives`]);
  const folderId = /"id":"(fd\w+)"/.exec(made)?.[1];
  expect(folderId).toBeTruthy();
  const inFolder = async (name: string, continues: string) => (await page.request.post("/api/bulk-assets", {
    multipart: { brandId: "br1", offerId: OFFER, folderId: folderId!, type: "Meta ad", continues, files: { name, mimeType: "image/png", buffer: png() } },
  })).status();
  expect(await inFolder(`${id}-meta-a.png`, "")).toBe(200);
  expect(await inFolder(`${id}-meta-b.png`, "1")).toBe(200);
  await page.goto(DEV);
  await settle(page);
  await page.getByLabel("Where").selectOption(`offer:${OFFER}`);
  await expect(here(page).getByRole("listitem").filter({ hasText: `${id[0].toUpperCase()}${id.slice(1)} meta a` })).toContainText(`Meta ad · Draft · 1 file · in ${id} creatives`);
  await page.goto("/");
  await settle(page);
  await expect(page.getByRole("button", { name: new RegExp(`Added 2 assets to: ${id} creatives folder`) })).toHaveCount(1);

  // The server refuses what the panel refuses.
  const exe = await page.request.post("/api/bulk-assets", { multipart: { brandId: "br1", offerId: OFFER, type: "auto", files: { name: "setup.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") } } });
  expect(exe.status()).toBe(415);
  const wrongType = await page.request.post("/api/bulk-assets", { multipart: { brandId: "br1", type: "Spaceship", files: { name: "a.png", mimeType: "image/png", buffer: png() } } });
  expect(wrongType.status()).toBe(400);
  const otherBrand = await page.request.post("/api/bulk-assets", { multipart: { brandId: "br2", offerId: OFFER, type: "auto", files: { name: "a.png", mimeType: "image/png", buffer: png() } } });
  expect(otherBrand.status()).toBe(400);
});

test("bulk upload and versions: the server checks role, scope and ownership", async ({ page }) => {
  await signIn(page);
  await page.goto(DEV);
  const id = run();
  const a = await makeAsset(page, { name: `${id}-locked.png`, mimeType: "image/png", buffer: png() });
  const r = await page.request.post(`/api/assets/${a.id}/files`, { multipart: { file: { name: `${id}-locked-v2.png`, mimeType: "image/png", buffer: png(100, 100) }, replace: a.file.key } });
  expect(r.status()).toBe(200);
  await page.goto(DEV);
  await settle(page);
  await page.getByLabel("Asset", { exact: true }).selectOption(a.id);
  await page.getByRole("button", { name: "1 earlier version" }).click();
  const versionId = (await page.locator("[data-version]").first().getAttribute("data-version"))!;
  const file = { name: "a.png", mimeType: "image/png", buffer: png() };

  // A reviewer changes nothing: no bulk upload, no putting a version back.
  await signIn(page, "Tom Aldridge");
  expect((await page.request.post("/api/bulk-assets", { multipart: { brandId: "br1", type: "auto", files: file } })).status()).toBe(403);
  expect(await callAction(page, DEV, "app/file-actions.ts", "restoreFileVersion", [versionId])).toContain("Uploading is switched off for you");

  // A contributor cannot put back a version on someone else's asset, nor add to the Global Library.
  await signIn(page, "Leo Park");
  expect(await callAction(page, DEV, "app/file-actions.ts", "restoreFileVersion", [versionId])).toContain("Contributors can only change work they own");
  expect((await page.request.post("/api/bulk-assets", { multipart: { brandId: "", type: "auto", files: file } })).status()).toBe(403);

  // Someone who cannot see the brand cannot add to it, or fetch its old files.
  await signIn(page, "Marta Vieira");
  expect((await page.request.get(a.file.url)).status()).toBe(404);
  // Dana edits the nonprofit clients (Quokka For Good, St Aidan), not Northgate Athletics.
  await signIn(page, "Dana Okafor");
  expect((await page.request.post("/api/bulk-assets", { multipart: { brandId: "br4", type: "auto", files: file } })).status()).toBe(404);
  expect((await page.request.get(a.file.url)).status()).toBe(200);
});

test("versions: replacing a file keeps the old one, which can be downloaded and put back", async ({ page }) => {
  await signIn(page);
  await page.goto(DEV);
  const id = run();
  const first = png(200, 120, [0x1f, 0x6f, 0x5c], [0xf4, 0xf1, 0xea]);
  const a = await makeAsset(page, { name: `${id}-hero.png`, mimeType: "image/png", buffer: first });

  const res = await page.request.post(`/api/assets/${a.id}/files`, { multipart: { file: { name: `${id}-hero-v2.png`, mimeType: "image/png", buffer: png(240, 120) }, replace: a.file.key } });
  expect(res.status()).toBe(200);
  // The old file is still stored and still served to people who can see the asset.
  const old = await page.request.get(a.file.url);
  expect(old.status()).toBe(200);
  expect(Buffer.from(await old.body()).equals(first)).toBe(true);

  await page.goto(DEV);
  await settle(page);
  await page.getByLabel("Asset", { exact: true }).selectOption(a.id);
  const files = page.getByRole("list", { name: "Files on this asset" });
  await expect(files.getByText(`${id}-hero-v2.png`).first()).toBeVisible();
  const toggle = files.getByRole("button", { name: "1 earlier version" });
  await toggle.click();
  const versions = files.getByRole("list", { name: "Earlier versions, newest first" });
  await expect(versions.getByText(`${id}-hero.png`)).toBeVisible();
  await expect(versions).toContainText(/Uploaded by Priya · Replaced \d{1,2} \w{3} \d{4}, \d{2}:\d{2} by Priya/);
  await expect(versions.getByRole("link", { name: `Download this version of ${id}-hero.png` })).toHaveAttribute("href", a.file.url);

  // Asking first, inline; Cancel leaves everything as it was.
  await versions.getByRole("button", { name: "Put this version back" }).click();
  await expect(versions.getByText("Put this version back? The file there now is kept as an earlier version.")).toBeVisible();
  await versions.getByRole("button", { name: "Cancel" }).click();
  await versions.getByRole("button", { name: "Put this version back" }).click();
  await versions.getByRole("button", { name: "Put it back" }).click();
  await expect(page.getByText(`Put back ${id}-hero.png`)).toBeVisible();

  // The first file is back in its place, and the second one is now the earlier version.
  await expect(files.locator(`[data-file="${id}-hero.png"]`)).toBeVisible();
  await expect(files.locator(`[data-file="${id}-hero-v2.png"]`)).toHaveCount(0);
  await files.getByRole("button", { name: "1 earlier version" }).click();
  await expect(files.getByRole("list", { name: "Earlier versions, newest first" }).getByText(`${id}-hero-v2.png`)).toBeVisible();

  // Uploading a file with the same name again replaces it too, and keeps the one before.
  const again = await page.request.post(`/api/assets/${a.id}/files`, { multipart: { file: { name: `${id}-hero.png`, mimeType: "image/png", buffer: png(260, 120) } } });
  expect(again.status()).toBe(200);
  await page.reload();
  await settle(page);
  await page.getByLabel("Asset", { exact: true }).selectOption(a.id);
  await files.getByRole("button", { name: "2 earlier versions" }).click();
  await expect(files.getByRole("list", { name: "Earlier versions, newest first" }).getByRole("listitem")).toHaveCount(2);
});

test("previews: image, PDF, text, video and links each show the right way", async ({ page }) => {
  await signIn(page);
  await page.goto(DEV);
  await settle(page);
  const id = run();
  const a = await makeAsset(page, { name: `${id}-preview-board.png`, mimeType: "image/png", buffer: png(480, 300) });
  const video = await webm(page);
  const csv = "week,leads,calls\n" + Array.from({ length: 260 }, (_, i) => `${i + 1},${10 + (i % 7)},${i % 4}`).join("\n");
  for (const file of [
    { name: `${id}-checklist.pdf`, mimeType: "application/pdf", buffer: pdf() },
    { name: `${id}-teaser.webm`, mimeType: "video/webm", buffer: video },
    { name: `${id}-results.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) },
    { name: `${id}-fonts.zip`, mimeType: "application/zip", buffer: Buffer.from("PK\u0005\u0006" + "\0".repeat(18), "latin1") },
  ]) {
    const r = await page.request.post(`/api/assets/${a.id}/files`, { multipart: { file } });
    expect(r.status()).toBe(200);
  }

  await page.goto(DEV);
  await settle(page);
  await page.getByLabel("Asset", { exact: true }).selectOption(a.id);
  const files = page.getByRole("list", { name: "Files on this asset" });

  // Image: fits, and opens full size; Escape closes it.
  const img = files.locator('figure[data-preview="image"] img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(480);
  await files.getByRole("button", { name: `View ${id}-preview-board.png full size` }).click();
  const box = page.getByRole("dialog", { name: `${id}-preview-board.png` });
  await expect(box).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);

  // PDF: read inline, with full screen on offer.
  await expect(files.locator('figure[data-preview="pdf"] iframe')).toHaveAttribute("src", /\?inline=1$/);
  await expect(files.locator('figure[data-preview="pdf"]').getByRole("button", { name: "Open full screen" })).toBeVisible();

  // Text: the first 200 lines only.
  const pre = files.locator('figure[data-preview="text"] pre');
  await expect(pre).toContainText("week,leads,calls");
  await expect(pre).not.toContainText("250,");
  await expect(files.locator('figure[data-preview="text"]')).toContainText("First 200 lines");

  // Video: plays in place, served in byte ranges so it can seek (and play in Safari).
  const v = files.locator('figure[data-preview="video"] video');
  await expect(v).toHaveAttribute("preload", "metadata");
  const src = (await v.getAttribute("src"))!;
  const part = await page.request.get(src, { headers: { Range: "bytes=0-99" } });
  expect(part.status()).toBe(206);
  expect(part.headers()["content-range"]).toMatch(/^bytes 0-99\/\d+$/);
  expect((await part.body()).length).toBe(100);
  expect((await page.request.get(src, { headers: { Range: "bytes=999999999-" } })).status()).toBe(416);

  // Anything else: a file card with Download.
  await expect(files.locator('figure[data-preview="other"]')).toContainText("No preview for this kind of file");

  // Links: nothing third-party loads until asked.
  const yt = page.locator('figure[data-provider="YouTube"]');
  await expect(yt.locator("iframe")).toHaveCount(0);
  await expect(page.locator("iframe[src*='youtube'], iframe[src*='figma'], iframe[src*='vimeo'], iframe[src*='loom'], iframe[src*='google']")).toHaveCount(0);
  await yt.getByRole("button", { name: "Load preview from youtube-nocookie.com" }).click();
  await expect(yt.locator("iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42");
  await expect(page.locator('figure[data-provider="Figma"]')).toContainText("Nothing loads from figma.com until you ask.");
  await expect(page.locator('figure[data-provider="Google Docs"]')).toBeVisible();
  const plain = page.locator('figure[data-preview="link"]');
  await expect(plain).toContainText("quokkaforgood.org");
  await expect(plain.getByRole("link", { name: "Open" })).toHaveAttribute("rel", "noopener noreferrer");

  // The page lets exactly these previews be framed, and keeps the rest of its policy.
  const doc = await page.request.get(DEV);
  const csp = doc.headers()["content-security-policy"];
  expect(csp).toContain("frame-src 'self' https://www.figma.com https://docs.google.com https://drive.google.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com;");
  expect(csp).toContain("media-src 'self' blob:");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(doc.headers()["x-frame-options"]).toBe("SAMEORIGIN");
});

test("the bulk upload, earlier versions and previews meet WCAG 2.2 AA, at 1440 and 390", async ({ page }) => {
  await signIn(page);
  await page.goto(DEV);
  const id = run();
  const a = await makeAsset(page, { name: `${id}-a11y.png`, mimeType: "image/png", buffer: png() });
  await page.request.post(`/api/assets/${a.id}/files`, { multipart: { file: { name: `${id}-a11y-v2.png`, mimeType: "image/png", buffer: png(100, 100) }, replace: a.file.key } });
  await page.request.post(`/api/assets/${a.id}/files`, { multipart: { file: { name: `${id}-notes.csv`, mimeType: "text/csv", buffer: Buffer.from("a,b\n1,2") } } });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(DEV);
    await settle(page);
    await page.getByLabel("Asset", { exact: true }).selectOption(a.id);
    await bulkPanel(page).locator('input[type="file"]').setInputFiles([
      { name: "brief.pdf", mimeType: "application/pdf", buffer: pdf() },
      { name: "setup.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") },
    ]);
    await page.getByRole("button", { name: "1 earlier version" }).click();
    await page.getByRole("button", { name: "Put this version back" }).click();
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude('figure[data-preview="pdf"] iframe').analyze();
    const problems = r.violations.map((v) => `${width}: ${v.id} (${v.impact}) × ${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    expect(problems, problems.join("\n")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  }
});

test("bulk upload: a video gets a still from the browser as its thumbnail", async ({ page }) => {
  await signIn(page);
  await page.goto(DEV);
  await settle(page);
  await page.getByLabel("Where").selectOption(`offer:${OFFER}`);
  const id = run();
  const panel = bulkPanel(page);
  await panel.locator('input[type="file"]').setInputFiles([{ name: `${id}-reel.webm`, mimeType: "video/webm", buffer: await webm(page) }]);
  await panel.getByRole("button", { name: "Add 1 asset" }).click();
  await expect(panel.getByRole("heading", { name: "1 asset added" })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Asset", { exact: true }).selectOption({ label: `${id[0].toUpperCase()}${id.slice(1)} reel` });
  await expect(page.locator('figure[data-preview="video"] video')).toHaveAttribute("poster", /\/api\/assets\/as\w+\/thumbnail\//);
});
