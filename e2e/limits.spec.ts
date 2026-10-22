import { expect, test, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 940 } });

const upload = (page: Page, name: string, mimeType: string, bytes: number) =>
  page.request.post("/api/assets/as2/files", { multipart: { file: { name, mimeType, buffer: Buffer.alloc(bytes, 1) } } });

test("admins switch off a kind of file and cap sizes; the server holds to it", async ({ page }) => {
  await signIn(page);
  // Upload limits live in Settings, under Workspace.
  await page.goto("/settings");
  await settle(page);
  await page.getByRole("tablist", { name: "Settings sections" }).getByRole("tab", { name: "Upload limits" }).click();
  await expect(page).toHaveURL(/\/settings\?section=uploads$/);
  await page.getByRole("switch", { name: "Allow video" }).click();
  await page.getByLabel("Largest images file in MB").fill("1");
  await page.getByRole("button", { name: "Save limits" }).click();
  await expect(page.getByText("Upload limits saved")).toBeVisible();

  const video = await upload(page, "clip.mp4", "video/mp4", 2048);
  expect(video.status()).toBe(413);
  expect((await video.json()).error).toMatch(/video cannot be uploaded/i);

  const big = await upload(page, "hero.png", "image/png", 2 * 1024 * 1024);
  expect(big.status()).toBe(413);
  expect((await big.json()).error).toMatch(/limit for images is 1 MB/);

  const ok = await upload(page, "small.png", "image/png", 4096);
  expect(ok.status()).toBe(200);

  // Put things back for the other tests.
  await page.getByRole("switch", { name: "Allow video" }).click();
  await page.getByLabel("Largest images file in MB").fill("25");
  await page.getByRole("button", { name: "Save limits" }).click();
  await expect(page.getByText("Upload limits saved")).toBeVisible();
});

test("an admin blocks one permission for one person", async ({ page }) => {
  await signIn(page);
  await page.goto("/team");
  await settle(page);
  const row = page.getByRole("listitem").filter({ hasText: "Ines Batz" });
  await row.getByRole("button", { name: "Edit access for Ines Batz" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText(/Exceptions and limits for Ines/).click();
  await dialog.getByRole("radiogroup", { name: "Upload files" }).getByRole("radio", { name: "Block" }).click();
  await dialog.getByRole("button", { name: "Save access" }).click();
  // The tag shows on phones too, so only the one on screen counts.
  await expect(row.getByText("1 exception").filter({ visible: true })).toBeVisible();

  await signIn(page, "Ines Batz");
  const res = await upload(page, "note.png", "image/png", 1024);
  expect(res.status()).toBe(403);
  await page.goto("/brands/br1/assets?asset=as1");
  await settle(page);
  const drawer = page.getByRole("dialog", { name: "Free Audit Landing Page" });
  await expect(drawer.getByRole("button", { name: /Upload files/ })).toHaveCount(0);
});
