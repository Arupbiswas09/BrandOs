import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 940 } });

/** A plain 400×300 PNG, built in memory so the test needs no fixture file. */
function png(w = 400, h = 300) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x9c)]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("pin a note on an image, find it in the discussion, and jump back to it", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1/assets?asset=as1");
  await settle(page);
  const drawer = page.getByRole("dialog", { name: "Free Audit Landing Page" });
  await drawer.getByRole("tab", { name: /^Files/ }).click();
  await drawer.locator('input[type="file"]').setInputFiles({ name: "proof-hero.png", mimeType: "image/png", buffer: png() });
  await expect(page.getByText("1 file added")).toBeVisible();

  await drawer.getByRole("tab", { name: /^Proof/ }).click();
  await drawer.getByRole("img", { name: "proof-hero.png" }).click({ position: { x: 120, y: 80 } });
  await drawer.getByRole("textbox", { name: /^Note \d+/ }).fill("Logo is too close to the edge");
  await drawer.getByRole("button", { name: "Pin note" }).click();
  const pin = drawer.getByRole("button", { name: /^Note \d+: Logo is too close to the edge/ });
  await expect(pin).toBeVisible();

  // Resolving greys the pin out and moves it under the Resolved filter.
  await drawer.getByRole("button", { name: /^Resolve note \d+/ }).click();
  await expect(pin).toHaveCount(0);
  await drawer.getByRole("button", { name: /^Resolved/ }).click();
  await expect(drawer.getByRole("button", { name: /Logo is too close to the edge \(resolved\)/ })).toBeVisible();

  await drawer.getByRole("tab", { name: /^Discussion/ }).click();
  await drawer.getByRole("button", { name: /on proof-hero\.png\. Open it in the proof view/ }).click();
  await expect(drawer.getByRole("tab", { name: /^Proof/ })).toHaveAttribute("aria-selected", "true");
  await expect(drawer.getByRole("button", { name: /Logo is too close to the edge/ }).first()).toHaveAttribute("aria-pressed", "true");
});

test("keyboard users can drop and move a pin", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1/assets?asset=as1&tab=proof");
  await settle(page);
  const drawer = page.getByRole("dialog", { name: "Free Audit Landing Page" });
  test.skip(!(await drawer.getByRole("button", { name: "+ Pin a note" }).count()), "needs an uploaded image from the test above");
  await drawer.getByRole("button", { name: "+ Pin a note" }).click();
  const draft = drawer.getByRole("button", { name: /New note pin at 50% across/ });
  await expect(draft).toBeFocused();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(drawer.getByRole("button", { name: /New note pin at 60% across/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer.getByRole("button", { name: /New note pin/ })).toHaveCount(0);
  await expect(drawer).toBeVisible();
});

test("bulk tag the assets on a brand", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1/assets");
  await settle(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const bar = page.getByRole("region", { name: "Bulk actions" });
  await bar.getByRole("button", { name: /Select all shown/ }).click();
  await bar.getByRole("button", { name: "Add tag" }).click();
  await bar.getByRole("textbox", { name: "Tag to add to the selected assets" }).fill("q4-refresh");
  await bar.getByRole("button", { name: "Add tag" }).last().click();
  await expect(page.getByText(/^Updated \d+/)).toBeVisible();
});

test("a contributor's bulk change skips work they do not own", async ({ page }) => {
  await signIn(page, "Leo Park");
  await page.goto("/brands/br1/assets");
  await settle(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const bar = page.getByRole("region", { name: "Bulk actions" });
  await expect(bar.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Archive" })).toHaveCount(0);
  await page.getByRole("checkbox").first().click();
  await bar.getByRole("button", { name: "Due date" }).click();
  await bar.getByLabel("Due date for the selected assets").fill("2026-12-01");
  await bar.getByRole("button", { name: "Set date" }).click();
  await expect(page.getByText(/skipped \(not yours\)/)).toBeVisible();
});

test("the library select bar deletes with a confirm", async ({ page }) => {
  await signIn(page);
  await page.goto("/library");
  await settle(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("checkbox").first().click();
  const bar = page.getByRole("region", { name: "Bulk actions" });
  await expect(bar.getByText("1 selected")).toBeVisible();
  await expect(bar.getByRole("button", { name: "Cleared to send" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("dialog", { name: "Delete 1 asset?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
});
