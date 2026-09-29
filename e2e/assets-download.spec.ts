import { expect, test, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 940 } });

/** A 1×1 PNG, so the tests need no fixture files. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const ASSET = "Google Search Ads — Grant Intent";

const upload = (page: Page, name: string) =>
  page.request.post("/api/assets/as3/files", { multipart: { file: { name, mimeType: "image/png", buffer: PNG } } });

test("an asset with several files downloads as one zip", async ({ page }) => {
  await signIn(page);
  expect((await upload(page, "dl-one.png")).status()).toBe(200);
  expect((await upload(page, "dl-two.png")).status()).toBe(200);

  const res = await page.request.get("/api/assets/as3/download");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/zip");
  expect(res.headers()["content-disposition"]).toMatch(/^attachment;.*Google Search Ads.*\.zip/);
  const body = await res.body();
  expect(body.subarray(0, 4).toString("hex")).toBe("504b0304"); // local file header
  expect(body.includes(Buffer.from("dl-one.png"))).toBe(true);
  expect(body.includes(Buffer.from("dl-two.png"))).toBe(true);
  expect(body.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true); // end of central directory
});

test("asset cards with uploaded files have a download button that does not open the asset", async ({ page }) => {
  await signIn(page);
  expect((await upload(page, "dl-card.png")).status()).toBe(200);
  await page.goto("/brands/br1/assets");
  await settle(page);
  const link = page.getByRole("link", { name: `Download ${ASSET}` });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", /\/api\/(assets\/as3\/download|files\/assets\/as3\/)/);
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(download.suggestedFilename()).toMatch(/\.(zip|png)$/);
  await expect(page.getByRole("dialog", { name: ASSET })).toHaveCount(0);
  // Editors get a pencil beside it.
  await expect(page.getByRole("button", { name: `Edit ${ASSET}` })).toBeVisible();
});

test("Replace swaps a file in place and logs it", async ({ page }) => {
  await signIn(page);
  expect((await upload(page, "swap-me.png")).status()).toBe(200);
  expect((await upload(page, "swap-keep.png")).status()).toBe(200);
  await page.goto("/brands/br1/assets?asset=as3");
  await settle(page);
  const drawer = page.getByRole("dialog", { name: ASSET });
  await drawer.getByRole("tab", { name: /^Files/ }).click();
  await expect(drawer.getByRole("link", { name: /^Download all/ })).toBeVisible();

  const chooser = page.waitForEvent("filechooser");
  await drawer.getByRole("button", { name: "Replace swap-me.png" }).click();
  await (await chooser).setFiles({ name: "swapped-in.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Replaced swap-me.png")).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Download swapped-in.png" })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Download swap-me.png" })).toHaveCount(0);
  await expect(drawer.getByRole("link", { name: "Download swap-keep.png" })).toBeVisible();

  await drawer.getByRole("tab", { name: /^History/ }).click();
  await expect(drawer.getByText(/replaced a file on — swap-me\.png → swapped-in\.png/)).toBeVisible();
});

test("the Global Library has an Ad creatives category you can add to, files included", async ({ page }) => {
  await signIn(page);
  await page.goto("/library");
  await settle(page);
  const pill = page.getByRole("group", { name: "Type" }).getByRole("button", { name: /^Ad creatives/ });
  await expect(pill).toBeVisible();
  await pill.click();
  await expect(pill).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("No ad creatives yet")).toBeVisible();

  // "Add to library" asks what kind of thing it is.
  await page.getByRole("button", { name: "Add to library" }).click();
  await expect(page.getByRole("menu", { name: "What to add" }).getByRole("menuitem", { name: "Checklist" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Ad creative" }).click();

  const dialog = page.getByRole("dialog", { name: "What are you making?" });
  await expect(dialog.getByText("Ad creative · Global Library")).toBeVisible();
  await dialog.getByRole("textbox", { name: /Asset name/ }).fill("Spring Appeal Carousel");
  await dialog.locator('input[type="file"]').setInputFiles({ name: "spring-carousel.png", mimeType: "image/png", buffer: PNG });
  await expect(dialog.getByRole("list", { name: "Files to upload" }).getByText("spring-carousel.png")).toBeVisible();
  await dialog.getByRole("button", { name: "Save asset" }).click();
  await expect(page.getByText("1 file added")).toBeVisible();

  const drawer = page.getByRole("dialog", { name: "Spring Appeal Carousel" });
  await expect(drawer.getByRole("link", { name: "Download spring-carousel.png" })).toBeVisible();
});
