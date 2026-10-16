import { deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 940 } });

/** A plain PNG in one colour, built in memory so the tests need no fixture files. */
function png(w = 320, h = 140, rgb: [number, number, number] = [0x2d, 0x4a, 0x5c]) {
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

/** Pastes a PNG the way a browser does when someone presses ⌘V with a screenshot on the clipboard. */
async function pasteImage(page: Page, bytes: Buffer) {
  await page.evaluate((b64) => {
    const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([data], "image.png", { type: "image/png" }));
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, bytes.toString("base64"));
}

const FLOW = "Audit Request Nurture Flow";
const FLOW_THUMB = 'img[src*="/api/assets/as41/thumbnail/"]';

test("a pasted screenshot becomes the card's thumbnail, and it can go back to automatic", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of1?asset=as41");
  await settle(page);
  const drawer = page.getByRole("dialog", { name: FLOW });
  // Changing the picture is in the drawer's "…" menu; pasting works from anywhere in the drawer.
  await drawer.getByRole("button", { name: "More asset actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Change thumbnail" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeVisible();

  await pasteImage(page, png());
  await expect(page.getByText("Thumbnail changed")).toBeVisible();
  await expect(drawer.locator(FLOW_THUMB)).toBeVisible();
  await drawer.getByRole("tab", { name: /^History/ }).click();
  await expect(drawer.getByText(/Changed the thumbnail of: Pasted image\.png/).first()).toBeVisible();

  // The card on the offer page shows the picture, fully loaded.
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  const thumb = page.locator(FLOW_THUMB);
  await expect(thumb).toBeVisible();
  await expect.poll(() => thumb.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);

  // Only raster images are taken.
  const svg = await page.request.post("/api/assets/as41/thumbnail", { multipart: { file: { name: "mark.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") } } });
  expect(svg.status()).toBe(415);

  // The card's menu opens the same picker, which can go back to the first image.
  await page.getByRole("button", { name: `More for ${FLOW}` }).click();
  await page.getByRole("menuitem", { name: "Change thumbnail" }).click();
  const picker = page.getByRole("dialog", { name: "Change thumbnail" });
  await expect(picker.getByText(/Paste a screenshot/)).toBeVisible();
  await picker.getByRole("button", { name: "Use first image" }).click();
  await expect(page.getByText("Thumbnail reset")).toBeVisible();
  await expect(picker).toHaveCount(0);
  await expect(page.locator(FLOW_THUMB)).toHaveCount(0);
});

test("folders group an offer's assets, and removing one keeps every asset", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of1");
  await settle(page);
  // The Assets tab carries the count.
  const count = page.getByRole("tab", { name: /^Assets/ });
  const before = await count.textContent();

  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByRole("textbox", { name: "Folder name" }).fill("Launch pages");
  await page.getByRole("button", { name: "Create folder" }).click();
  await expect(page.getByText("Created Launch pages")).toBeVisible();
  const folder = page.getByRole("button", { name: /^Launch pages/ });
  await expect(folder).toContainText("Empty");

  // With the keyboard-friendly menu.
  await page.getByRole("button", { name: "More for Audit Booked — Thank You Page" }).click();
  await page.getByRole("group", { name: "Move to folder" }).getByRole("menuitemradio", { name: "Launch pages" }).click();
  await expect(page.getByText("Moved to Launch pages")).toBeVisible();
  await expect(folder).toContainText("1 asset");
  await expect(page.getByRole("button", { name: /^Thank you page Audit Booked/ })).toHaveCount(0);

  // By dragging a card onto the folder, with both in view so nothing scrolls mid-drag.
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.getByRole("tabpanel", { name: /^Assets/ }).evaluate((h) => h.scrollIntoView({ block: "start" }));
  const card = page.locator('[draggable="true"]', { has: page.getByText("Grant Application Source Files", { exact: true }) });
  await card.dragTo(folder);
  await expect(folder).toContainText("2 assets");

  // Inside the folder, with a way back.
  await folder.click();
  const crumbs = page.getByRole("navigation", { name: "Folders" });
  await expect(crumbs.getByRole("button", { name: "All assets" })).toBeVisible();
  await expect(crumbs.getByText("Launch pages")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: /^Thank you page Audit Booked/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Drive link Grant Application Source Files/ })).toBeVisible();

  await crumbs.getByRole("button", { name: "Folder actions for Launch pages" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "New name for Launch pages" }).fill("After the yes");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(crumbs.getByText("After the yes")).toBeVisible();

  // Removing the folder puts its assets back; nothing is unlinked or deleted.
  await crumbs.getByRole("button", { name: "Folder actions for After the yes" }).click();
  await page.getByRole("menuitem", { name: "Remove folder (assets stay)" }).click();
  await expect(page.getByText(/Removed After the yes\. Its 2 assets are back in All assets\./)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Folders" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^After the yes/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Thank you page Audit Booked/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Drive link Grant Application Source Files/ })).toBeVisible();
  await expect(count).toHaveText(before!);
});

test("an offer is never deleted; it moves back to draft instead", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of1");
  await settle(page);
  await page.getByRole("button", { name: "More offer actions" }).click();
  const menu = page.getByRole("menu", { name: "More offer actions" });
  await expect(menu.getByRole("menuitem", { name: /Delete/ })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Move back to draft" }).click();
  await expect(page.getByText("Moved back to draft")).toBeVisible();
  const status = page.getByRole("combobox", { name: "Status" });
  await expect(status).toHaveValue("Ideation");
  // Already a draft: the menu no longer offers it.
  await page.getByRole("button", { name: "More offer actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Move back to draft" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Put it back for the other tests.
  await status.selectOption("Active");
  await expect(status).toHaveValue("Active");
});
