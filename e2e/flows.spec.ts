import { expect, test } from "@playwright/test";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 940 } });

test("create an offer from a service page, link an asset, discuss, review", async ({ page }) => {
  await signIn(page);
  await page.goto("/services/sv1");
  await settle(page);
  await page.getByRole("button", { name: "New offer", exact: true }).click();
  await page.getByPlaceholder("Google Ads Grant Growth").fill("Playwright Offer");
  await page.getByPlaceholder("One sentence a stranger would understand.").fill("Tested end to end.");
  await page.getByRole("button", { name: "Save offer" }).click();
  await page.waitForURL(/\/offers\//);
  await expect(page.getByRole("heading", { name: "Playwright Offer" })).toBeVisible();

  await page.getByRole("button", { name: "Link existing asset" }).click();
  await page.getByPlaceholder("Search the library").fill("compliance");
  await page.getByRole("button", { name: "Link", exact: true }).first().click();
  await expect(page.getByText("is now linked to this offer")).toBeVisible();

  await page.getByPlaceholder(/Add a note/).fill("Looks right to me");
  await page.getByRole("button", { name: "Post note" }).click();
  await expect(page.getByText("Looks right to me")).toBeVisible();

  await page.getByRole("button", { name: "Send for review" }).first().click();
  await page.getByRole("dialog").getByText("Joss Weekes").click();
  await expect(page.getByText("Review — Joss Weekes")).toBeVisible();
});

test("a viewer only sees their clients and cannot edit", async ({ page }) => {
  await signIn(page, "Marta Vieira");
  await expect(page.getByText("Viewer — read only").first()).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByText("Northgate Athletics").first()).toBeVisible();
  await expect(nav.getByText("Quokka For Good")).toHaveCount(0);
  await page.goto("/brands/br1");
  await expect(page.getByText("This brand is not here")).toBeVisible();
  await expect(page.getByRole("button", { name: "New", exact: true })).toHaveCount(0);
});

test("search finds things with the keyboard", async ({ page }) => {
  await signIn(page);
  // "/" focuses the header's search box and opens its results. The first keypress can land before hydration finishes; retry.
  const box = page.getByRole("combobox", { name: "Search" });
  await expect(async () => {
    await page.keyboard.press("/");
    await expect(box).toHaveAttribute("aria-expanded", "true", { timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await expect(box).toBeFocused();
  await box.pressSequentially("christmas");
  await expect(page.getByRole("listbox").getByText("Christmas Appeal").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/brands\/br2|\/offers\/of17|asset=as19/);
});
