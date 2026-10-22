import { expect, test, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";

// The app's frame, the dashboard, Launches and Settings: every action can be found, and none of them does nothing.

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Add client on the dashboard is a real button, not grey text", async ({ page }) => {
    await signIn(page);
    const add = page.getByRole("main").getByRole("button", { name: "Add client" });
    await expect(add).toBeVisible();
    // Bordered like every other secondary button (a ghost button's border is transparent).
    expect(await add.evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe("rgba(0, 0, 0, 0)");
    await add.click();
    await expect(page.getByRole("dialog", { name: "New client" })).toBeVisible();
  });

  test("the shortcut list shows only keys that do something for you", async ({ page }) => {
    const keys = async () => {
      const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
      // The first keypress can land before hydration finishes; retry until the list opens.
      await expect(async () => {
        if (!(await dialog.count())) await page.keyboard.press("?");
        await expect(dialog).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 10_000 });
      const list = await dialog.locator("kbd").allTextContents();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      return list;
    };

    // An admin can create things, comment and manage the team.
    await signIn(page);
    expect(await keys()).toEqual(expect.arrayContaining(["N", "G then T", "⌘ ↵"]));
    await page.keyboard.press("g");
    await page.keyboard.press("t");
    await expect(page).toHaveURL(/\/team$/);

    // A reviewer has no New menu and no Team page: those keys are not offered, and G then T goes nowhere.
    await signIn(page, "Tom Aldridge");
    const tom = await keys();
    expect(tom).not.toContain("N");
    expect(tom).not.toContain("G then T");
    expect(tom).toContain("⌘ ↵");
    await page.goto("/calendar");
    await settle(page);
    await page.keyboard.press("g");
    await page.keyboard.press("t");
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/\/calendar$/);

    // A viewer cannot post notes.
    await signIn(page, "Marta Vieira");
    expect(await keys()).not.toContain("⌘ ↵");
  });

  test("search says why it cannot create something when there is no brand to put it in", async ({ page }) => {
    // Leo, a contributor, sees nothing for a moment: no clients, brands or groups.
    const leo = (groupIds: string[]) => ({ id: "lp", name: "Leo Park", email: "leo@quokkaforgood.org", role: "Freelance copywriter", access: "Contributor", allClients: false, clientIds: [], brandIds: [], groupIds });
    await signIn(page);
    expect(await callAction(page, "/team", "app/actions.ts", "savePerson", [leo([])])).toContain('"ok":true');
    try {
      await signIn(page, "Leo Park");
      const box = page.getByRole("combobox", { name: "Search" });
      await box.click();
      await box.fill("new offer");
      await page.locator("#search-results").getByRole("option", { name: /^New offer/ }).click();
      await expect(page.getByRole("status").filter({ hasText: "There is no brand to add it to yet" })).toBeVisible();
    } finally {
      await signIn(page);
      expect(await callAction(page, "/team", "app/actions.ts", "savePerson", [leo(["g1"])])).toContain('"ok":true');
    }
  });

  test("on a client's page, New files work under that client's brand", async ({ page }) => {
    await signIn(page);
    await page.goto("/clients/cl2");
    await settle(page);
    await page.getByRole("button", { name: "New", exact: true }).click();
    const menu = page.getByRole("menu", { name: "New" });
    await expect(menu.getByText("New work goes into St Aidan Parish")).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Import from a spreadsheet/ })).toHaveAttribute("href", "/import?brand=br2");
  });

  test("Settings says where the per-person storage allowance is set", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings?section=uploads");
    await settle(page);
    await page.getByRole("link", { name: "Edit access" }).click();
    await expect(page).toHaveURL(/\/team$/);
  });

  test("an admin is told where email and Slack are switched on, not to ask an admin", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings?section=notifications");
    await settle(page);
    await expect(page.getByText(/ask whoever runs the server to add the email settings/)).toBeVisible();
    await expect(page.getByText("An admin can switch it on")).toHaveCount(0);
    await page.goto("/settings?section=workspace");
    await settle(page);
    await expect(page.getByText(/ask whoever runs the server to add your channel's Slack webhook/)).toBeVisible();
    // Everyone else is still pointed at an admin.
    await signIn(page, "Leo Park");
    await page.goto("/settings?section=notifications");
    await settle(page);
    await expect(page.getByText(/An admin can switch it on/)).toBeVisible();
  });

  test("deleting says where it went and how to get it back", async ({ page }) => {
    await signIn(page);
    const name = `Frame check group ${Date.now()}`;
    expect(await callAction(page, "/team", "app/actions.ts", "saveGroup", [{ name, clientIds: [], memberIds: [] }])).toContain('"ok":true');
    await page.goto("/team");
    await settle(page);
    await page.getByRole("tab", { name: "Groups" }).click();
    await page.getByRole("button", { name: `Delete ${name}` }).click();
    await page.getByRole("dialog", { name: `Delete ${name}?` }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("status").filter({ hasText: `Deleted ${name}. You can restore it from the Recycle bin for 30 days.` })).toBeVisible();
    await page.goto("/trash");
    await settle(page);
    await expect(page.getByRole("button", { name: `Restore ${name}` })).toBeVisible();
  });
});

/** Month view, then the first day this month or next that has a launch. */
async function pickLaunchDay(page: Page) {
  await page.goto("/calendar");
  await settle(page);
  await page.getByRole("button", { name: "Month", exact: true }).click();
  const day = page.getByRole("button", { name: /, [1-9]\d* launch(es)?$/ }).first();
  if (!(await day.count())) await page.getByRole("button", { name: "Next month" }).click();
  await day.click();
}

for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
  test.describe(label, () => {
    test.use({ viewport });

    test("choosing a day in Launches brings that day's launches into view", async ({ page }) => {
      await signIn(page, "Ines Batz");
      await pickLaunchDay(page);
      const list = page.locator("section[aria-labelledby='launch-day']");
      const first = list.getByRole("button").first();
      await expect(first).toBeInViewport({ ratio: 1 });
      // On phones it clears the bottom bar too.
      if (label === "phone") {
        const bar = await page.getByRole("navigation", { name: "Quick navigation" }).boundingBox();
        const row = await first.boundingBox();
        expect(row!.y + row!.height).toBeLessThanOrEqual(bar!.y + 1);
      }
      await first.click();
      await expect(page).toHaveURL(/\/offers\//);
    });
  });
}
