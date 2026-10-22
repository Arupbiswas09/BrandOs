import { expect, test } from "@playwright/test";
import { settle, signIn } from "./helpers";

// The app's frame: one queue signal, one menu button on phones, a plain user menu.

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 940 } });

  test("the queue count shows once, in the sidebar, and its label never changes", async ({ page }) => {
    await signIn(page);
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("button", { name: /^Your queue, \d+ waiting$/ })).toBeVisible();
    // No bell in the header, and the dashboard's list carries no count of its own.
    await expect(page.locator("header").getByRole("button", { name: /Inbox|queue|waiting/i })).toHaveCount(0);
    await expect(page.getByText(/\d+ on you/)).toHaveCount(0);
    await nav.getByRole("button", { name: /^Your queue/ }).click();
    // One name for it: what the sidebar says is what the panel is called.
    const panel = page.getByRole("dialog", { name: "Your queue" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Your queue", { exact: true })).toBeVisible();
    await expect(page.getByText("Inbox", { exact: true })).toHaveCount(0);
  });

  test("the user menu keeps to the account: colours live in Settings", async ({ page }) => {
    await signIn(page);
    await page.locator("header").getByRole("button", { name: /Priya Raman/ }).click();
    const menu = page.getByRole("menu", { name: "Your account" });
    await expect(menu.getByRole("menuitem", { name: "Settings", exact: true })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Appearance/ })).toHaveAttribute("href", "/settings?section=appearance");
    await expect(menu.getByRole("menuitem", { name: /Keyboard shortcuts/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
    await expect(menu.getByRole("radiogroup")).toHaveCount(0);
    // The demo's reset and the credit sit here, not in the sidebar.
    await expect(menu.getByRole("menuitem", { name: "Reset demo data" })).toBeVisible();
    await expect(menu.getByText("Developed by Arup")).toBeVisible();
    await expect(page.getByRole("complementary").getByText(/Reset demo|Developed by/)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("one menu button, and search opens full width from the header", async ({ page }) => {
    await signIn(page);
    const header = page.locator("header");
    const quick = page.getByRole("navigation", { name: "Quick navigation" });
    await expect(header.getByRole("button", { name: /navigation/i })).toHaveCount(0);
    await expect(quick.getByRole("button", { name: "Menu" })).toBeVisible();
    await expect(quick.getByRole("button", { name: "Search" })).toHaveCount(0);
    // The box is not squeezed into the header; a button opens it over the whole row.
    const box = page.getByRole("combobox", { name: "Search" });
    await expect(box).toBeHidden();
    await header.getByRole("button", { name: "Search" }).click();
    await expect(box).toBeFocused();
    expect((await box.boundingBox())!.width).toBeGreaterThan(250);
    await box.fill("christmas");
    await expect(page.getByRole("listbox").getByText("Christmas Appeal").first()).toBeVisible();
    await header.getByRole("button", { name: "Cancel" }).click();
    await expect(box).toBeHidden();
  });

  test("team rows put their actions in one menu", async ({ page }) => {
    await signIn(page);
    await page.goto("/team");
    await settle(page);
    const row = page.getByRole("listitem").filter({ hasText: "Tom Aldridge" });
    await expect(row.getByRole("button", { name: "View as" })).toBeHidden();
    await row.getByRole("button", { name: "More for Tom Aldridge" }).click();
    await expect(page.getByRole("menuitem", { name: "Edit access" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Remove from the team" })).toBeVisible();
  });
});
