import { existsSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";

/*
 * Pictures in notes (pasted with ⌘V, dropped or picked with Add image) on an
 * asset's and an offer's Discussion, and a client's files and video links.
 */

test.use({ viewport: { width: 1440, height: 940 } });

/** Ad Grant Readiness Checklist: no other spec reads its notes. */
const OFFER = "of23";
/** Checklist Follow-up Sequence, one of that offer's assets. */
const ASSET = "as42";
const ASSET_NAME = "Checklist Follow-up Sequence";
/** Northgate Athletics Trust: Marta, a Viewer, sees it. */
const CLIENT = "cl3";
const ACTIONS = "app/actions.ts";

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
function pdf(text = "Season brief") {
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

/** What ⌘V with a screenshot on the clipboard sends the page: a paste event carrying a picture file and no text. */
async function pastePicture(box: Locator, name = "image.png", buffer = png()) {
  await box.evaluate((el, { name, b64 }) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const data = new DataTransfer();
    data.items.add(new File([bytes], name, { type: "image/png" }));
    (el as HTMLElement).focus();
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, { name, b64: buffer.toString("base64") });
}

/** A file dragged in from the desktop and dropped on `target`. */
async function dropFile(page: Page, target: Locator, name: string, type: string, buffer: Buffer) {
  const data = await page.evaluateHandle(({ name, type, b64 }) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], name, { type }));
    return dt;
  }, { name, type, b64: buffer.toString("base64") });
  await target.dispatchEvent("dragover", { dataTransfer: data });
  await target.dispatchEvent("drop", { dataTransfer: data });
}

/** Where a stored file sits on local disk (the test server keeps uploads in .data/uploads). */
const onDisk = (url: string) => path.join(process.cwd(), ".data", "uploads", decodeURIComponent(new URL(url, "http://x").pathname.replace(/^\/api\/files\//, "")));

/** The note on screen that says `text`. */
const noteWith = (scope: Locator, text: string) => scope.locator("div.rounded-xl.border").filter({ hasText: text }).last();

async function postPictureNote(page: Page, text: string) {
  await page.goto(`/offers/${OFFER}?tab=discussion`);
  await settle(page);
  const panel = page.getByRole("tabpanel", { name: /^Discussion/ });
  const box = panel.getByRole("textbox", { name: "Add a note" });
  await box.fill(text);
  await pastePicture(box);
  await expect(panel.getByRole("list", { name: /^Pictures in this note/ }).getByRole("img")).toHaveCount(1);
  await panel.getByRole("button", { name: "Post note" }).click();
  const note = noteWith(panel, text);
  await expect(note.getByRole("list", { name: "1 picture" }).getByRole("img")).toHaveCount(1);
  const src = (await note.getByRole("list", { name: "1 picture" }).getByRole("img").getAttribute("src"))!;
  return { panel, note, url: src.replace(/\?inline=1$/, "") };
}

test.describe("pictures in notes", () => {
  test("a screenshot pasted into an asset's note posts, shows, survives a reload and opens large", async ({ page }) => {
    await signIn(page);
    await page.goto(`/offers/${OFFER}?asset=${ASSET}&assetTab=discussion`);
    await settle(page);
    const drawer = page.getByRole("dialog", { name: ASSET_NAME });
    const box = drawer.getByRole("textbox", { name: "Add a note" });
    const text = `Asset screenshot ${Date.now()}`;
    await box.fill(text);
    await pastePicture(box);
    // It waits in the box as a thumbnail, named for when it was pasted, until the note is posted.
    const waiting = drawer.getByRole("list", { name: /^Pictures in this note/ });
    await expect(waiting.getByRole("img")).toHaveCount(1);
    await expect(waiting.getByRole("img")).toHaveAttribute("alt", /^Pasted picture \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}$/);
    await drawer.getByRole("button", { name: "Post note" }).click();

    const note = noteWith(drawer, text);
    const pics = note.getByRole("list", { name: "1 picture" });
    await expect(pics.getByRole("img")).toHaveCount(1);
    await expect(waiting).toHaveCount(0);
    // Stored and served, not kept in the page: the thumbnail comes from /api/files and really loads.
    await expect(pics.getByRole("img")).toHaveAttribute("src", new RegExp(`^/api/files/notes/asset/${ASSET}/pr/.+\\.png\\?inline=1$`));
    await expect.poll(() => pics.getByRole("img").evaluate((i: HTMLImageElement) => i.complete ? i.naturalWidth : 0)).toBe(320);

    await page.reload();
    await settle(page);
    await expect(pics.getByRole("img")).toHaveCount(1);
    await pics.getByRole("button", { name: /^Open Pasted picture .+ large$/ }).click();
    const viewer = page.getByRole("dialog", { name: /^Pasted picture/ });
    await expect(viewer.getByRole("img")).toBeVisible();
    await expect(viewer.getByRole("button", { name: "Close" })).toBeFocused();
    await expect(viewer.getByRole("link", { name: "Open in new tab" })).toHaveAttribute("href", /\?inline=1$/);
    // Esc closes the viewer only; the asset stays open.
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await expect(drawer).toBeVisible();
  });

  test("a real ⌘V from the clipboard adds the picture, and × takes it out again", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await signIn(page);
    await page.goto(`/offers/${OFFER}?tab=discussion`);
    await settle(page);
    await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([bytes], { type: "image/png" }) })]);
    }, png(240, 160).toString("base64"));
    const panel = page.getByRole("tabpanel", { name: /^Discussion/ });
    await panel.getByRole("textbox", { name: "Add a note" }).click();
    await page.keyboard.press("ControlOrMeta+V");
    const waiting = panel.getByRole("list", { name: /^Pictures in this note/ });
    await expect(waiting.getByRole("img")).toHaveCount(1);
    // A picture alone is a note: Post is ready without words.
    await expect(panel.getByRole("button", { name: "Post note" })).toBeEnabled();
    await waiting.getByRole("button", { name: /^Remove Pasted picture/ }).click();
    await expect(waiting).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Post note" })).toBeDisabled();
  });

  test("an offer's note takes pictures pasted, dropped and picked; editing adds and removes them", async ({ page }) => {
    await signIn(page);
    await page.goto(`/offers/${OFFER}?tab=discussion`);
    await settle(page);
    const panel = page.getByRole("tabpanel", { name: /^Discussion/ });
    const box = panel.getByRole("textbox", { name: "Add a note" });
    const text = `Offer pictures ${Date.now()}`;
    await box.fill(text);
    await pastePicture(box, "image.png", png(320, 200));
    await dropFile(page, box, "dropped.png", "image/png", png(200, 200, [0x8a, 0x2b, 0x4c], [0xf4, 0xf1, 0xea]));
    const chooser = page.waitForEvent("filechooser");
    await panel.getByRole("button", { name: "Add image" }).click();
    await (await chooser).setFiles({ name: "picked.png", mimeType: "image/png", buffer: png(300, 180) });
    const waiting = panel.getByRole("list", { name: /^Pictures in this note/ });
    await expect(waiting.getByRole("img")).toHaveCount(3);
    // Only pictures go in a note.
    await dropFile(page, box, "brief.pdf", "application/pdf", pdf());
    await expect(page.getByText("Notes take pictures only: PNG, JPG, GIF or WebP.")).toBeVisible();
    await expect(waiting.getByRole("img")).toHaveCount(3);
    await waiting.getByRole("button", { name: "Remove dropped.png" }).click();
    await expect(waiting.getByRole("img")).toHaveCount(2);
    await panel.getByRole("button", { name: "Post note" }).click();

    const note = noteWith(panel, text);
    const pics = note.getByRole("list", { name: "2 pictures" });
    await expect(pics.getByRole("img")).toHaveCount(2);
    await expect(pics.getByRole("img").nth(1)).toHaveAttribute("alt", "picked");
    // Large, and the arrow keys go between them.
    await pics.getByRole("button", { name: "Open picked large" }).click();
    await expect(page.getByRole("dialog", { name: "picked.png · 2 of 2" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("dialog", { name: /^Pasted picture .+ · 1 of 2$/ })).toBeVisible();
    await page.keyboard.press("Escape");

    // Editing: take one out, paste another in.
    const picked = onDisk((await pics.getByRole("img").nth(1).getAttribute("src"))!);
    expect(existsSync(picked)).toBe(true);
    await note.getByRole("button", { name: "Edit note" }).click();
    const editing = note.getByRole("list", { name: /^Pictures in this note/ });
    await expect(editing.getByRole("img")).toHaveCount(2);
    await editing.getByRole("button", { name: "Remove picked.png" }).click();
    await pastePicture(note.getByRole("textbox", { name: "Edit note" }), "image.png", png(180, 180));
    await expect(editing.getByRole("img")).toHaveCount(2);
    await note.getByRole("button", { name: "Save", exact: true }).click();
    await expect(note.getByRole("list", { name: "2 pictures" }).getByRole("button", { name: /^Open Pasted picture/ })).toHaveCount(2);
    // A picture taken out of a note is not kept: nothing else shows it.
    await expect.poll(() => existsSync(picked)).toBe(false);
    await page.reload();
    await settle(page);
    await expect(noteWith(panel, text).getByRole("list", { name: "2 pictures" }).getByRole("img")).toHaveCount(2);
  });

  test("a reviewer can add a screenshot; a viewer cannot, and the server refuses what the page does not offer", async ({ page }) => {
    // Reviewers comment, and a screenshot is often the clearest feedback.
    await signIn(page, "Tom Aldridge");
    const text = `Reviewer screenshot ${Date.now()}`;
    await postPictureNote(page, text);

    // Marta is a Viewer: no note box, no Add image.
    await signIn(page, "Marta Vieira");
    await page.goto("/offers/of20?tab=discussion");
    await settle(page);
    const panel = page.getByRole("tabpanel", { name: /^Discussion/ });
    await expect(panel.getByRole("textbox", { name: "Add a note" })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Add image" })).toHaveCount(0);
    const form = new FormData();
    form.append("kind", "offer");
    form.append("itemId", "of20");
    form.append("file", new File([png()], "sneaky.png", { type: "image/png" }));
    const up = await page.request.post("/api/notes/images", { multipart: form });
    expect(up.status()).toBe(403);
    expect(await callAction(page, "/", ACTIONS, "postComment", ["offer", "of20", "Sneaky", [], [], null, [{ key: "notes/offer/of20/mv/a-sneaky.png", name: "sneaky.png" }]]))
      .toContain("Your role does not allow that");
    // And she cannot open pictures on notes she cannot see (Quokka is not hers).
    await signIn(page);
    const { url } = await postPictureNote(page, `Not for Marta ${Date.now()}`);
    expect((await page.request.get(url)).status()).toBe(200);
    await signIn(page, "Marta Vieira");
    expect((await page.request.get(url)).status()).toBe(404);

    // Nobody can borrow someone else's stored picture, or send something that is not a picture.
    await signIn(page);
    expect(await callAction(page, "/", ACTIONS, "postComment", ["offer", OFFER, "Borrowed", [], [], null, [{ key: `notes/offer/${OFFER}/ta/a-borrowed.png`, name: "x.png" }]]))
      .toContain("A picture did not upload");
    const notPicture = new FormData();
    notPicture.append("kind", "offer");
    notPicture.append("itemId", OFFER);
    notPicture.append("file", new File([pdf()], "brief.pdf", { type: "application/pdf" }));
    expect((await page.request.post("/api/notes/images", { multipart: notPicture })).status()).toBe(415);
    const tooMany = new FormData();
    tooMany.append("kind", "offer");
    tooMany.append("itemId", OFFER);
    for (let i = 0; i < 7; i++) tooMany.append("file", new File([png(10, 10)], `p${i}.png`, { type: "image/png" }));
    const many = await page.request.post("/api/notes/images", { multipart: tooMany });
    expect(many.status()).toBe(400);
    expect((await many.json()).error).toBe("A note holds up to 6 pictures.");
  });

  test("a deleted note waits in the recycle bin with its pictures, comes back, and deleting it for good frees them", async ({ page }) => {
    await signIn(page);
    const text = `Bin me ${Date.now()}`;
    const { panel, note, url } = await postPictureNote(page, text);
    page.once("dialog", (d) => { expect(d.message()).toContain("restore it from the Recycle bin for 30 days"); void d.accept(); });
    await note.getByRole("button", { name: "Delete note" }).click();
    await expect(panel.getByText(text)).toHaveCount(0);
    // In the bin nobody can open the picture, but it is kept for the restore.
    expect((await page.request.get(url)).status()).toBe(404);
    expect(existsSync(onDisk(url))).toBe(true);

    await page.goto("/trash");
    await settle(page);
    await expect(page.getByText(`Note on Ad Grant Readiness Checklist · 1 picture`)).toBeVisible();
    await page.getByRole("button", { name: `Restore ${text}` }).click();
    await expect(page.getByText(`${text} is back`)).toBeVisible();
    await page.goto(`/offers/${OFFER}?tab=discussion`);
    await settle(page);
    await expect(noteWith(panel, text).getByRole("list", { name: "1 picture" }).getByRole("img")).toHaveCount(1);
    expect((await page.request.get(url)).status()).toBe(200);

    page.once("dialog", (d) => void d.accept());
    await noteWith(panel, text).getByRole("button", { name: "Delete note" }).click();
    await expect(panel.getByText(text)).toHaveCount(0);
    await page.goto("/trash");
    await settle(page);
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: `Delete ${text} forever` }).click();
    await expect(page.getByText(`${text} is deleted for good`)).toBeVisible();
    await expect.poll(() => existsSync(onDisk(url))).toBe(false);
  });

  test("the asset panel's note buttons match the offer page's", async ({ page }) => {
    await signIn(page);
    await page.goto(`/offers/${OFFER}?asset=${ASSET}&assetTab=discussion`);
    await settle(page);
    const drawer = page.getByRole("dialog", { name: ASSET_NAME });
    const text = `Buttons ${Date.now()}`;
    await drawer.getByRole("textbox", { name: "Add a note" }).fill(text);
    await drawer.getByRole("button", { name: "Post note" }).click();
    const note = noteWith(drawer, text);
    // Labelled icon buttons for Edit and Delete, and a bordered Resolve, as on the offer page.
    await expect(note.getByRole("button", { name: "Edit note" })).toHaveAttribute("title", "Edit note");
    await expect(note.getByRole("button", { name: "Delete note" })).toHaveAttribute("title", "Delete note");
    const resolve = note.getByRole("button", { name: "Resolve", exact: true });
    await expect(resolve).toHaveCSS("border-top-style", "solid");
    await expect(resolve).toHaveCSS("border-top-width", "1px");
  });
});

test.describe("a client's files and videos", () => {
  test("upload, preview, download, replace, put back and remove a file, with the recycle bin", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${CLIENT}`);
    await settle(page);
    const section = page.getByRole("region", { name: "Files and videos" });
    const stamp = Date.now();
    const brief = `Season brief ${stamp}.pdf`;
    const board = `Kit board ${stamp}.png`;
    await section.locator('input[type="file"]').setInputFiles([
      { name: brief, mimeType: "application/pdf", buffer: pdf() },
      { name: board, mimeType: "image/png", buffer: png(640, 400) },
    ]);
    await expect(page.getByText(`2 files added to Northgate Athletics Trust`)).toBeVisible();
    await expect(section.getByRole("button", { name: `Preview ${board}` })).toBeVisible();

    // Previews: the picture and the PDF show inline.
    await section.getByRole("button", { name: `Preview ${board}` }).click();
    const shown = page.getByRole("dialog", { name: `Preview of ${board}` });
    await expect(shown.getByRole("img", { name: board })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(shown).toHaveCount(0);
    await section.getByRole("button", { name: `Preview ${brief}` }).click();
    await expect(page.getByRole("dialog", { name: `Preview of ${brief}` }).locator("iframe")).toHaveAttribute("src", /\/api\/files\/clients\/cl3\/.+\?inline=1$/);
    await page.keyboard.press("Escape");

    const download = page.waitForEvent("download");
    await section.getByRole("link", { name: `Download ${brief}` }).click();
    expect((await download).suggestedFilename()).toBe(brief);

    // Replacing keeps the one before as an earlier version, which can be put back.
    const firstUrl = (await section.getByRole("link", { name: `Download ${brief}` }).getAttribute("href"))!;
    const chooser = page.waitForEvent("filechooser");
    await section.getByRole("button", { name: `Replace ${brief}` }).click();
    await (await chooser).setFiles({ name: brief, mimeType: "application/pdf", buffer: pdf("Season brief, second draft") });
    await expect(page.getByText(`Replaced ${brief}. The earlier file is kept under its earlier versions.`)).toBeVisible();
    await section.getByRole("button", { name: `1 earlier version of ${brief}` }).click();
    await expect(section.getByRole("link", { name: `Download the earlier ${brief}` })).toHaveAttribute("href", firstUrl);
    expect((await page.request.get(firstUrl)).status()).toBe(200);
    await section.getByRole("button", { name: `Put back the earlier ${brief}` }).click();
    await expect(section.getByRole("link", { name: `Download ${brief}` })).toHaveAttribute("href", firstUrl);

    // Removing asks first, then the file waits in the recycle bin.
    const boardUrl = (await section.getByRole("link", { name: `Download ${board}` }).getAttribute("href"))!;
    await section.getByRole("button", { name: `Remove ${board}` }).click();
    const ask = section.getByRole("group", { name: `Remove ${board}` });
    await expect(ask).toContainText("It goes to the Recycle bin for 30 days");
    await ask.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(section.getByRole("button", { name: `Preview ${board}` })).toHaveCount(0);
    expect((await page.request.get(boardUrl)).status()).toBe(404);
    expect(existsSync(onDisk(boardUrl))).toBe(true);
    await page.goto("/trash");
    await settle(page);
    await page.getByRole("button", { name: `Restore ${board}` }).click();
    await expect(page.getByText(`${board} is back`)).toBeVisible();
    await page.goto(`/clients/${CLIENT}`);
    await settle(page);
    await expect(section.getByRole("button", { name: `Preview ${board}` })).toBeVisible();
    expect((await page.request.get(boardUrl)).status()).toBe(200);
  });

  test("a video link: one link per field, a player in the page, and edits", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${CLIENT}`);
    await settle(page);
    const section = page.getByRole("region", { name: "Files and videos" });
    if (await section.getByRole("button", { name: "Add video link" }).count()) await section.getByRole("button", { name: "Add video link" }).click();
    const form = section.getByRole("form", { name: "Add a video" });
    await form.getByRole("textbox", { name: /^Video link/ }).fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ https://vimeo.com/76979871");
    await form.getByRole("button", { name: "Add video" }).click();
    await expect(form.getByRole("alert")).toHaveText("That is two links in one field. Add each video on its own.");

    const title = `Kick-off call ${Date.now()}`;
    await form.getByRole("textbox", { name: /^Video link/ }).fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await expect(form.getByText("YouTube: plays here.")).toBeVisible();
    await form.getByRole("textbox", { name: "Title" }).fill(title);
    await form.getByRole("button", { name: "Add video" }).click();
    await expect(page.getByText("Video link added to Northgate Athletics Trust")).toBeVisible();
    const video = section.getByRole("listitem").filter({ hasText: title });
    // The player is there straight away, like every other link preview.
    await expect(video.locator("iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");

    await video.getByRole("button", { name: `Edit the link to ${title}` }).click();
    const edit = section.getByRole("form", { name: `Edit ${title}` });
    await edit.getByRole("textbox", { name: "Title" }).fill(`${title}, recording`);
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(section.getByText(`${title}, recording`)).toBeVisible();

    // The server says the same as the form if asked directly.
    expect(await callAction(page, "/", ACTIONS, "saveClientVideo", [CLIENT, { title: "Two", url: "youtube.com/watch?v=dQw4w9WgXcQ vimeo.com/76979871" }]))
      .toContain("That is two links in one field");
  });

  test("a viewer opens a client's files and videos but changes nothing, and the server refuses others", async ({ page }) => {
    await signIn(page);
    const stamp = Date.now();
    // Something on Northgate (Marta's) and on Quokka (not Marta's), put there directly.
    const add = async (client: string, name: string) => {
      const form = new FormData();
      form.append("file", new File([png()], name, { type: "image/png" }));
      const res = await page.request.post(`/api/clients/${client}/files`, { multipart: form });
      expect(res.status()).toBe(200);
      return (await res.json()).files[0].url as string;
    };
    const mine = await add(CLIENT, `Viewer can see ${stamp}.png`);
    const theirs = await add("cl1", `Viewer cannot see ${stamp}.png`);
    expect(await callAction(page, "/", ACTIONS, "saveClientVideo", [CLIENT, { title: `Walkthrough ${stamp}`, url: "https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184" }])).not.toContain("error");

    await signIn(page, "Marta Vieira");
    await page.goto(`/clients/${CLIENT}`);
    await settle(page);
    const section = page.getByRole("region", { name: "Files and videos" });
    await expect(section.getByRole("link", { name: `Download Viewer can see ${stamp}.png` })).toBeVisible();
    await expect(section.getByText(`Walkthrough ${stamp}`)).toBeVisible();
    await expect(section.getByRole("button", { name: /^(Replace|Remove|Edit the link)/ })).toHaveCount(0);
    await expect(section.getByRole("button", { name: /Upload|Add video/ })).toHaveCount(0);
    await expect(section.locator('input[type="file"]')).toHaveCount(0);
    expect((await page.request.get(mine)).status()).toBe(200);
    expect((await page.request.get(theirs)).status()).toBe(404);
    const form = new FormData();
    form.append("file", new File([png()], "nope.png", { type: "image/png" }));
    expect((await page.request.post(`/api/clients/${CLIENT}/files`, { multipart: form })).status()).toBe(403);
    expect(await callAction(page, "/", ACTIONS, "saveClientVideo", [CLIENT, { title: "Nope", url: "https://vimeo.com/76979871" }])).toContain("Your role does not allow that");

    // An editor works on brands, not on the client's own files.
    await signIn(page, "Ines Batz");
    const ines = new FormData();
    ines.append("file", new File([png()], "nope.png", { type: "image/png" }));
    const refused = await page.request.post("/api/clients/cl1/files", { multipart: ines });
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error).toContain("Only people who set up clients");
    expect(await callAction(page, "/", ACTIONS, "removeClientVideo", ["cl1", "cv-nope"])).toContain("Your role does not allow that");

    // A manager may.
    await signIn(page, "Joss Weekes");
    const joss = new FormData();
    joss.append("file", new File([png()], `Manager upload ${stamp}.png`, { type: "image/png" }));
    expect((await page.request.post("/api/clients/cl1/files", { multipart: joss })).status()).toBe(200);
  });

  test("the admin export includes note pictures and client files and videos", async ({ page }) => {
    await signIn(page);
    const res = await page.request.get("/api/export");
    expect(res.status()).toBe(200);
    const data = await res.json() as { clients: { id: string; files: { key: string; name: string }[]; videos: { url: string }[] }[]; comments: { images: { key: string }[] }[] };
    const northgate = data.clients.find((c) => c.id === CLIENT)!;
    expect(northgate.files.some((f) => f.key.startsWith(`clients/${CLIENT}/`))).toBe(true);
    expect(northgate.videos.length).toBeGreaterThan(0);
    expect(data.comments.some((c) => c.images.some((i) => i.key.startsWith("notes/")))).toBe(true);
    // Every older row has the new lists, empty.
    expect(data.clients.every((c) => Array.isArray(c.files) && Array.isArray(c.videos))).toBe(true);
    expect(data.comments.every((c) => Array.isArray(c.images))).toBe(true);
  });
});

test("notes with pictures and a client's files meet WCAG AA, on desktop and phone", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const problems: string[] = [];
  const check = async (name: string) => {
    // The video player inside a frame is YouTube's own page, which BrandOS cannot change; everything around it is checked.
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("figure[data-provider] iframe").analyze();
    for (const v of r.violations) problems.push(`${name}: ${v.id} (${v.impact}) × ${v.nodes.length} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  };
  for (const size of [{ width: 1440, height: 940 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    const at = `${size.width}px`;
    await page.goto(`/offers/${OFFER}?tab=discussion`);
    await settle(page);
    // A picture waiting in the box as well as the posted ones.
    await pastePicture(page.getByRole("tabpanel", { name: /^Discussion/ }).getByRole("textbox", { name: "Add a note" }));
    await check(`offer discussion ${at}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `offer discussion scrolls sideways at ${at}`).toBe(true);
    await page.goto(`/offers/${OFFER}?asset=${ASSET}&assetTab=discussion`);
    await settle(page);
    await check(`asset discussion ${at}`);
    await page.goto(`/clients/${CLIENT}`);
    await settle(page);
    await check(`client files ${at}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `client page scrolls sideways at ${at}`).toBe(true);
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
