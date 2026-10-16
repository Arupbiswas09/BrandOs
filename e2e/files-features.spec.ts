import { deflateSync } from "node:zlib";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";

/*
 * Bulk upload, earlier versions of files and previews, where people use
 * them: the offer's Assets tab ("Upload files", or files dropped on the tab)
 * and the asset drawer (its files, their earlier versions, and the preview).
 */

test.use({ viewport: { width: 1440, height: 940 } });

/**
 * Partner Co-Marketing (Quokka For Good): an offer no other spec looks at, so
 * the assets made here do not change what other specs count or drag.
 */
const OFFER = "of16";
const PAGE = `/offers/${OFFER}`;

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
/** "mgx1abc" → "Mgx1abc": the start of a tidied asset name. */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const assetsTab = (page: Page) => page.getByRole("tabpanel", { name: /^Assets/ });
/** The upload panel on the Assets tab, by its heading before and after adding. */
const bulkPanel = (page: Page) => page.getByRole("region", { name: /^Add files as assets$|^\d+ assets? added$/ });
const attached = (drawer: ReturnType<Page["getByRole"]>) => drawer.getByRole("list", { name: "Attached files" });
/** Asset cards (not their Edit and "More for" buttons) whose name holds this text. */
const cards = (page: Page, text: string) => assetsTab(page).getByRole("button", { name: new RegExp(`^(?!Edit |More for ).*${text}`, "i") });

/** One asset made through the bulk route, with its stored file. */
async function makeAsset(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  const res = await page.request.post("/api/bulk-assets", { multipart: { brandId: "br1", offerId: OFFER, type: "auto", files: file } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.assets[0] as { id: string; name: string; file: { key: string; url: string; name: string } };
}

/** A brand asset that is only a link, made the way the asset form makes it. */
async function linkAsset(page: Page, name: string, url: string, type = "Social post") {
  const body = await callAction(page, PAGE, "app/actions.ts", "saveAsset", [{ brandId: "br1", name, type, url, offerIds: [] }]);
  expect(body).toContain('"ok":true');
  return body.match(/"id":"(as[a-z0-9]+)"/)![1];
}

test("bulk upload: three images and a PDF added on an offer become four linked assets", async ({ page }) => {
  await signIn(page);
  await page.goto(PAGE);
  await settle(page);
  const id = run();
  const tab = assetsTab(page);
  // A secondary button beside the others opens the panel above the grid.
  const toggle = tab.getByRole("button", { name: "Upload files" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
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
  await expect(panel.getByLabel(`Asset name for ${id}-summer_sale-story.png`)).toHaveValue(`${cap(id)} summer sale story`);
  await panel.getByLabel(`Asset name for ${id}-grant-checklist.pdf`).fill(`${id} Grant readiness checklist`);
  await expect(rows.filter({ hasText: "Social post" })).toHaveCount(3);
  await expect(rows.filter({ hasText: `${id}-grant-checklist.pdf` })).toContainText("Document");
  // A program is refused on its own row and left out of the count.
  await expect(rows.filter({ hasText: "setup.exe" })).toContainText("does not take this kind of file");
  await panel.getByRole("button", { name: "Add 4 assets" }).click();

  await expect(panel.getByRole("heading", { name: "4 assets added" })).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByRole("button", { name: "Open the first" })).toBeVisible();
  // All four are on the offer now, as drafts, each with its one file.
  const mine = cards(page, id);
  await expect(mine).toHaveCount(4);
  await expect(mine.filter({ hasText: "Draft · v1" })).toHaveCount(4);
  const checklist = mine.filter({ hasText: `${id} Grant readiness checklist` });
  await expect(checklist).toContainText("Document");
  await checklist.click();
  const drawer = page.getByRole("dialog", { name: `${id} Grant readiness checklist` });
  await expect(attached(drawer).getByRole("listitem")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  // Close puts focus back on the button that opened the panel.
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toHaveCount(0);
  await expect(toggle).toBeFocused();

  // One line in the activity feed for the whole drop, on the offer.
  await page.goto("/");
  await settle(page);
  const line = page.getByRole("button", { name: /Added 4 assets to.*Partner Co-Marketing · Priya/ }).first();
  await expect(line).toBeVisible();

  // Inside a folder, they are filed there too; a later request of the same drop joins the same activity line.
  const made = await callAction(page, PAGE, "app/folder-actions.ts", "createFolder", [OFFER, `${id} creatives`]);
  const folderId = /"id":"(fd\w+)"/.exec(made)?.[1];
  expect(folderId).toBeTruthy();
  const inFolder = async (name: string, continues: string) => (await page.request.post("/api/bulk-assets", {
    multipart: { brandId: "br1", offerId: OFFER, folderId: folderId!, type: "Meta ad", continues, files: { name, mimeType: "image/png", buffer: png() } },
  })).status();
  expect(await inFolder(`${id}-meta-a.png`, "")).toBe(200);
  expect(await inFolder(`${id}-meta-b.png`, "1")).toBe(200);
  await page.goto(PAGE);
  await settle(page);
  await tab.getByRole("button", { name: new RegExp(`^${id} creatives`) }).click();
  await expect(cards(page, `${cap(id)} meta a`)).toContainText("Meta ad");
  await expect(cards(page, `${id} meta [ab]`)).toHaveCount(2);
  // Opened inside the folder, the panel says the files go there.
  await tab.getByRole("button", { name: "Upload files" }).click();
  await expect(bulkPanel(page).getByText(`Each file becomes its own draft asset in the ${id} creatives folder of Partner Co-Marketing, owned by you.`)).toBeVisible();
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

test("bulk upload: files dropped anywhere on the Assets tab open the panel with them listed", async ({ page }) => {
  await signIn(page);
  await page.goto(PAGE);
  await settle(page);
  const id = run();
  const tab = assetsTab(page);
  const files = await page.evaluateHandle((name) => {
    const d = new DataTransfer();
    d.items.add(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], `${name}-dropped.png`, { type: "image/png" }));
    d.items.add(new File(["%PDF-1.4"], `${name}-dropped-brief.pdf`, { type: "application/pdf" }));
    return d;
  }, id);
  // Dropped on the row of buttons, nowhere near a drop zone: the whole tab takes files.
  const where = tab.getByRole("button", { name: "Add", exact: true });
  await where.dispatchEvent("dragover", { dataTransfer: files });
  await where.dispatchEvent("drop", { dataTransfer: files });
  const panel = bulkPanel(page);
  await expect(panel.getByLabel(`Asset name for ${id}-dropped.png`)).toHaveValue(`${cap(id)} dropped`);
  await expect(panel.getByRole("button", { name: "Add 2 assets" })).toBeVisible();
  await expect(tab.getByRole("button", { name: "Upload files" })).toHaveAttribute("aria-expanded", "true");
  // Escape closes it; nothing was sent.
  await panel.getByLabel(`Asset name for ${id}-dropped.png`).press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(cards(page, `${id} dropped`)).toHaveCount(0);
});

test("bulk upload and versions: the server checks role, scope and ownership", async ({ page }) => {
  await signIn(page);
  await page.goto(PAGE);
  const id = run();
  const a = await makeAsset(page, { name: `${id}-locked.png`, mimeType: "image/png", buffer: png() });
  const r = await page.request.post(`/api/assets/${a.id}/files`, { multipart: { file: { name: `${id}-locked-v2.png`, mimeType: "image/png", buffer: png(100, 100) }, replace: a.file.key } });
  expect(r.status()).toBe(200);
  await page.goto(`${PAGE}?asset=${a.id}`);
  await settle(page);
  await page.getByRole("dialog").getByRole("button", { name: "1 earlier version" }).click();
  const versionId = (await page.locator("[data-version]").first().getAttribute("data-version"))!;
  const file = { name: "a.png", mimeType: "image/png", buffer: png() };

  // A reviewer changes nothing: no bulk upload, no putting a version back.
  await signIn(page, "Tom Aldridge");
  expect((await page.request.post("/api/bulk-assets", { multipart: { brandId: "br1", type: "auto", files: file } })).status()).toBe(403);
  expect(await callAction(page, PAGE, "app/file-actions.ts", "restoreFileVersion", [versionId])).toContain("Uploading is switched off for you");
  // Nor does the offer page offer it.
  await page.goto(PAGE);
  await settle(page);
  await expect(page.getByRole("button", { name: "Upload files" })).toHaveCount(0);

  // A contributor cannot put back a version on someone else's asset, nor add to the Global Library.
  await signIn(page, "Leo Park");
  expect(await callAction(page, PAGE, "app/file-actions.ts", "restoreFileVersion", [versionId])).toContain("Contributors can only change work they own");
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
  await page.goto(PAGE);
  const id = run();
  const first = png(200, 120, [0x1f, 0x6f, 0x5c], [0xf4, 0xf1, 0xea]);
  const a = await makeAsset(page, { name: `${id}-hero.png`, mimeType: "image/png", buffer: first });

  const res = await page.request.post(`/api/assets/${a.id}/files`, { multipart: { file: { name: `${id}-hero-v2.png`, mimeType: "image/png", buffer: png(240, 120) }, replace: a.file.key } });
  expect(res.status()).toBe(200);
  // The old file is still stored and still served to people who can see the asset.
  const old = await page.request.get(a.file.url);
  expect(old.status()).toBe(200);
  expect(Buffer.from(await old.body()).equals(first)).toBe(true);

  await page.goto(`${PAGE}?asset=${a.id}`);
  await settle(page);
  const files = attached(page.getByRole("dialog"));
  await expect(files.locator(`[data-file="${id}-hero-v2.png"]`)).toBeVisible();
  // Under the file's own row.
  const toggle = files.locator(`[data-file="${id}-hero-v2.png"]`).getByRole("button", { name: "1 earlier version" });
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
  await files.getByRole("button", { name: "2 earlier versions" }).click();
  await expect(files.getByRole("list", { name: "Earlier versions, newest first" }).getByRole("listitem")).toHaveCount(2);

  // Replace in the drawer says what happens to the file it replaces.
  await expect(files.getByRole("button", { name: `Replace ${id}-hero.png` })).toHaveAttribute("title", `Replace ${id}-hero.png with a new file. This one is kept as an earlier version.`);
  const chooser = page.waitForEvent("filechooser");
  await files.getByRole("button", { name: `Replace ${id}-hero.png` }).click();
  await (await chooser).setFiles({ name: `${id}-hero-v3.png`, mimeType: "image/png", buffer: png(280, 120) });
  await expect(page.getByText(`Replaced ${id}-hero.png. The earlier file is kept under its earlier versions.`)).toBeVisible();
  await expect(files.locator(`[data-file="${id}-hero-v3.png"]`).getByRole("button", { name: "3 earlier versions" })).toBeVisible();
});

test("previews: image, PDF, text, video and links each show the right way, folded away until asked", async ({ page }) => {
  await signIn(page);
  await page.goto(PAGE);
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

  await page.goto(`${PAGE}?asset=${a.id}`);
  await settle(page);
  const drawer = page.getByRole("dialog", { name: `${cap(id)} preview board` });
  // Folded away at first, so the sections stay in reach.
  await expect(drawer.locator("figure[data-preview]")).toHaveCount(0);
  await expect(drawer.getByRole("tablist", { name: "Asset sections" })).toBeInViewport();
  const show = drawer.getByRole("button", { name: "Preview", exact: true });
  await expect(show).toHaveAttribute("aria-expanded", "false");
  await show.click();
  await expect(drawer.getByRole("button", { name: "Hide preview" })).toHaveAttribute("aria-expanded", "true");

  // Image (the first file that can be shown): fits, and opens full size; Escape closes only that.
  const img = drawer.locator('figure[data-preview="image"] img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(480);
  await drawer.getByRole("button", { name: `View ${id}-preview-board.png full size` }).click();
  const box = page.getByRole("dialog", { name: `${id}-preview-board.png` });
  await expect(box).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);
  await expect(drawer).toBeVisible();

  // Each file's name in the list shows that file instead. PDF: read inline, with full screen on offer.
  await drawer.getByRole("button", { name: `Preview ${id}-checklist.pdf` }).click();
  await expect(drawer.locator('figure[data-preview="pdf"] iframe')).toHaveAttribute("src", /\?inline=1$/);
  await expect(drawer.locator('figure[data-preview="pdf"]').getByRole("button", { name: "Open full screen" })).toBeVisible();
  await expect(drawer.locator('figure[data-preview="image"]')).toHaveCount(0);

  // Text: the first 200 lines only.
  await drawer.getByRole("button", { name: `Preview ${id}-results.csv` }).click();
  const pre = drawer.locator('figure[data-preview="text"] pre');
  await expect(pre).toContainText("week,leads,calls");
  await expect(pre).not.toContainText("250,");
  await expect(drawer.locator('figure[data-preview="text"]')).toContainText("First 200 lines");

  // Video: plays in place, served in byte ranges so it can seek (and play in Safari).
  await drawer.getByRole("button", { name: `Preview ${id}-teaser.webm` }).click();
  const v = drawer.locator('figure[data-preview="video"] video');
  await expect(v).toHaveAttribute("preload", "metadata");
  const src = (await v.getAttribute("src"))!;
  const part = await page.request.get(src, { headers: { Range: "bytes=0-99" } });
  expect(part.status()).toBe(206);
  expect(part.headers()["content-range"]).toMatch(/^bytes 0-99\/\d+$/);
  expect((await part.body()).length).toBe(100);
  expect((await page.request.get(src, { headers: { Range: "bytes=999999999-" } })).status()).toBe(416);

  // A zip cannot be shown, so its name is not a preview button; it still downloads.
  await expect(drawer.getByRole("button", { name: `Preview ${id}-fonts.zip` })).toHaveCount(0);
  await expect(drawer.getByRole("link", { name: `Download ${id}-fonts.zip` })).toBeVisible();

  // Links: nothing third-party loads until asked.
  const yt = await linkAsset(page, `${id} teaser on YouTube`, "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s");
  await page.goto(`${PAGE}?asset=${yt}`);
  await settle(page);
  const ytDrawer = page.getByRole("dialog", { name: `${id} teaser on YouTube` });
  await ytDrawer.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = ytDrawer.locator('figure[data-provider="YouTube"]');
  await expect(frame).toBeVisible();
  await expect(page.locator("iframe[src*='youtube'], iframe[src*='figma'], iframe[src*='vimeo'], iframe[src*='loom'], iframe[src*='google']")).toHaveCount(0);
  await frame.getByRole("button", { name: "Load preview from youtube-nocookie.com" }).click();
  await expect(frame.locator("iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42");

  const figma = await linkAsset(page, `${id} homepage design`, "https://www.figma.com/design/AbCdEf123456/Homepage?node-id=1-2");
  await page.goto(`${PAGE}?asset=${figma}`);
  await settle(page);
  const figmaDrawer = page.getByRole("dialog", { name: `${id} homepage design` });
  await figmaDrawer.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(figmaDrawer.locator('figure[data-provider="Figma"]')).toContainText("Nothing loads from figma.com until you ask.");

  // A plain web page has no preview: the drawer's Open and Copy link already say where it goes.
  const plain = await linkAsset(page, `${id} audit page`, "https://quokkaforgood.org/audit?utm_source=brandos", "Landing page");
  await page.goto(`${PAGE}?asset=${plain}`);
  await settle(page);
  const plainDrawer = page.getByRole("dialog", { name: `${id} audit page` });
  await expect(plainDrawer.getByRole("link", { name: "Open", exact: true })).toHaveAttribute("href", "https://quokkaforgood.org/audit?utm_source=brandos");
  await expect(plainDrawer.getByRole("button", { name: "Preview", exact: true })).toHaveCount(0);

  // The page lets exactly these previews be framed, and keeps the rest of its policy.
  const doc = await page.request.get(PAGE);
  const csp = doc.headers()["content-security-policy"];
  expect(csp).toContain("frame-src 'self' https://www.figma.com https://docs.google.com https://drive.google.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com;");
  expect(csp).toContain("media-src 'self' blob:");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(doc.headers()["x-frame-options"]).toBe("SAMEORIGIN");
});

test("the upload panel, earlier versions and previews meet WCAG 2.2 AA, at 1440 and 390", async ({ page }) => {
  await signIn(page);
  await page.goto(PAGE);
  const id = run();
  const a = await makeAsset(page, { name: `${id}-a11y.png`, mimeType: "image/png", buffer: png() });
  await page.request.post(`/api/assets/${a.id}/files`, { multipart: { file: { name: `${id}-a11y-v2.png`, mimeType: "image/png", buffer: png(100, 100) }, replace: a.file.key } });
  await page.request.post(`/api/assets/${a.id}/files`, { multipart: { file: { name: `${id}-notes.csv`, mimeType: "text/csv", buffer: Buffer.from("a,b\n1,2") } } });
  const tags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(PAGE);
    await settle(page);
    await page.getByRole("button", { name: "Upload files" }).click();
    await bulkPanel(page).locator('input[type="file"]').setInputFiles([
      { name: "brief.pdf", mimeType: "application/pdf", buffer: pdf() },
      { name: "setup.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") },
    ]);
    let r = await new AxeBuilder({ page }).withTags(tags).analyze();
    let problems = r.violations.map((v) => `${width} panel: ${v.id} (${v.impact}) × ${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    expect(problems, problems.join("\n")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

    await page.goto(`${PAGE}?asset=${a.id}`);
    await settle(page);
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: "Preview", exact: true }).click();
    await drawer.getByRole("button", { name: "1 earlier version" }).click();
    await drawer.getByRole("button", { name: "Put this version back" }).click();
    r = await new AxeBuilder({ page }).withTags(tags).analyze();
    problems = r.violations.map((v) => `${width} drawer: ${v.id} (${v.impact}) × ${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    expect(problems, problems.join("\n")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  }
});

test("bulk upload: a video gets a still from the browser as its thumbnail", async ({ page }) => {
  await signIn(page);
  await page.goto(PAGE);
  await settle(page);
  const id = run();
  await assetsTab(page).getByRole("button", { name: "Upload files" }).click();
  const panel = bulkPanel(page);
  await panel.locator('input[type="file"]').setInputFiles([{ name: `${id}-reel.webm`, mimeType: "video/webm", buffer: await webm(page) }]);
  await panel.getByRole("button", { name: "Add 1 asset" }).click();
  await expect(panel.getByRole("heading", { name: "1 asset added" })).toBeVisible({ timeout: 30_000 });
  await panel.getByRole("button", { name: "Open the first" }).click();
  const drawer = page.getByRole("dialog", { name: `${cap(id)} reel` });
  await drawer.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(drawer.locator('figure[data-preview="video"] video')).toHaveAttribute("poster", /\/api\/assets\/as\w+\/thumbnail\//);
});
