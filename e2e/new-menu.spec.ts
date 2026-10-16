import { expect, test } from "@playwright/test";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 940 } });

// "+ New" opens a short menu under the button, not a dialog.

test("New opens a menu of what you may create, filed under the brand you are in", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br3");
  await settle(page);
  const button = page.getByRole("button", { name: "New", exact: true });
  await button.click();
  const menu = page.getByRole("menu", { name: "New" });
  await expect(menu).toBeVisible();
  await expect(menu.getByText("New work goes into St Aidan Youth")).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveText([/New offer/, /New asset/, /New service/, /New brand/, /New client/, /Brand from a website/, /Import from a spreadsheet/]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Starting from what already exists opens its own page, with this place already chosen.
  await expect(menu.getByRole("menuitem", { name: /Brand from a website/ })).toHaveAttribute("href", "/brands/new/from-website?client=cl2");
  await expect(menu.getByRole("menuitem", { name: /Import from a spreadsheet/ })).toHaveAttribute("href", "/import?brand=br3");

  // Keyboard: the first item has focus, the arrows move, Esc closes and gives focus back to the button.
  await expect(menu.getByRole("menuitem", { name: /New offer/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: /New asset/ })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(menu.getByRole("menuitem", { name: /Import from a spreadsheet/ })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(menu.getByRole("menuitem", { name: /Brand from a website/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(button).toBeFocused();

  // Choosing an item opens its usual form, for this brand.
  await button.click();
  await menu.getByRole("menuitem", { name: /New offer/ }).click();
  const form = page.getByRole("dialog").filter({ hasText: "Offer name" });
  await expect(form).toBeVisible();
  await expect(form.getByText("St Aidan Youth").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(form).toHaveCount(0);

  // The onboarding items go to their pages, which say where you are.
  await button.click();
  await menu.getByRole("menuitem", { name: /Import from a spreadsheet/ }).click();
  await expect(page).toHaveURL(/\/import\?brand=br3$/);
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByRole("listitem")).toHaveText(["Dashboard", "Import"]);
  await page.goto("/brands/new/from-website");
  await settle(page);
  await expect(crumbs.getByRole("listitem")).toHaveText(["Dashboard", "New brand from a website"]);
});

test("the N key opens the same menu, and people who cannot create see no New button", async ({ page }) => {
  await signIn(page);
  await expect(async () => {
    await page.keyboard.press("n");
    await expect(page.getByRole("menu", { name: "New" })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.mouse.click(700, 700);
  await expect(page.getByRole("menu", { name: "New" })).toHaveCount(0);

  await signIn(page, "Marta Vieira"); // Viewer
  await expect(page.getByRole("button", { name: "New", exact: true })).toHaveCount(0);

  // An editor may import into a brand but not start one: no "Brand from a website".
  await signIn(page, "Ines Batz");
  await page.goto("/brands/br1");
  await settle(page);
  await page.getByRole("button", { name: "New", exact: true }).click();
  const menu = page.getByRole("menu", { name: "New" });
  await expect(menu.getByRole("menuitem", { name: /Import from a spreadsheet/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Brand from a website/ })).toHaveCount(0);
});
