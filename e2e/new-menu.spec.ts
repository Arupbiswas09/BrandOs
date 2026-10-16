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
  await expect(menu.getByRole("menuitem")).toHaveText([/New offer/, /New asset/, /New service/, /New brand/, /New client/]);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Keyboard: the first item has focus, the arrows move, Esc closes and gives focus back to the button.
  await expect(menu.getByRole("menuitem", { name: /New offer/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: /New asset/ })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(menu.getByRole("menuitem", { name: /New client/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(button).toBeFocused();

  // Choosing an item opens its usual form, for this brand.
  await button.click();
  await menu.getByRole("menuitem", { name: /New offer/ }).click();
  const form = page.getByRole("dialog").filter({ hasText: "Offer name" });
  await expect(form).toBeVisible();
  await expect(form.getByText("St Aidan Youth").first()).toBeVisible();
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
});
