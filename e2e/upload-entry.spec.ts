import { expect, test, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";

/*
 * Where many files go up at once outside an offer: a brand's Assets tab and
 * the Global Library. "Upload files" opens the panel in place; files dropped
 * anywhere on the page open it with them listed. Nothing is uploaded here, so
 * the seed data stays as it is.
 */

test.use({ viewport: { width: 1440, height: 940 } });

/** Drops files from "the desktop" on an element, the way a browser does. */
async function dropFiles(page: Page, selector: string, files: { name: string; type: string }[]) {
  const data = await page.evaluateHandle((list) => {
    const d = new DataTransfer();
    for (const f of list) d.items.add(new File(["%PDF-1.4 test"], f.name, { type: f.type }));
    return d;
  }, files);
  for (const type of ["dragenter", "dragover", "drop"]) await page.dispatchEvent(selector, type, { dataTransfer: data });
}

const panel = (page: Page) => page.getByRole("region", { name: "Add files as assets" });

test("a brand's Assets tab: Upload files opens the panel in place, and a drop on the page lists the files", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1/assets");
  await settle(page);
  const upload = page.getByRole("button", { name: "Upload files" });
  await expect(upload).toHaveAttribute("aria-expanded", "false");
  // One primary on the tab: adding a single asset. Uploading is secondary.
  await expect(page.getByRole("button", { name: "New asset", exact: true })).toBeVisible();
  await upload.click();
  await expect(upload).toHaveAttribute("aria-expanded", "true");
  await expect(panel(page).getByText("Each file becomes its own draft asset in Quokka For Good's assets, owned by you.")).toBeVisible();
  await upload.click();
  await expect(panel(page)).toHaveCount(0);

  await dropFiles(page, "main h1", [{ name: "grant-brief.pdf", type: "application/pdf" }]);
  await expect(panel(page)).toBeVisible();
  const rows = panel(page).getByRole("list", { name: "Files to add" }).getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("grant-brief.pdf");
  await expect(rows.first()).toContainText("Document");
  await expect(panel(page).getByRole("button", { name: "Add 1 asset" })).toBeVisible();
  await panel(page).getByRole("button", { name: "Remove grant-brief.pdf" }).click();
  await expect(rows).toHaveCount(0);

  // Someone who may not edit sees neither.
  await signIn(page, "Tom Aldridge"); // Reviewer
  await page.goto("/brands/br1/assets");
  await settle(page);
  await expect(page.getByRole("button", { name: "Upload files" })).toHaveCount(0);
});

test("the Global Library: uploaded documents start as templates, and only the library's five kinds are offered", async ({ page }) => {
  await signIn(page);
  await page.goto("/library");
  await settle(page);
  await page.getByRole("button", { name: "Upload files" }).click();
  await expect(panel(page).getByText("Each file becomes its own draft asset in the Global Library, owned by you.")).toBeVisible();
  await panel(page).locator('input[type="file"]').setInputFiles([
    { name: "launch-checks.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") },
    { name: "spring-ad.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") },
  ]);
  const rows = panel(page).getByRole("list", { name: "Files to add" }).getByRole("listitem");
  await expect(rows.filter({ hasText: "launch-checks.pdf" })).toContainText("Template");
  await expect(rows.filter({ hasText: "spring-ad.png" })).toContainText("Ad creative");
  const kinds = await panel(page).getByLabel("Asset type").locator("option").allTextContents();
  expect(kinds).toEqual(["Detect from file", "Checklist", "Prompt", "Template", "SOP", "Ad creative"]);

  // Editors cannot add to the library, so they are not offered the upload.
  await signIn(page, "Ines Batz");
  await page.goto("/library");
  await settle(page);
  await expect(page.getByRole("button", { name: "Upload files" })).toHaveCount(0);
});
