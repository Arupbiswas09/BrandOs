import { expect, test, type Locator, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";

// Team and access: every action can be found on every screen, and nothing ends in a dead end.

/** A tag for this run, so names and emails never clash with earlier runs or other tests. */
const run = Date.now().toString(36).slice(-5);

async function people(page: Page) {
  await page.goto("/team");
  await settle(page);
  await page.getByRole("tab", { name: "People" }).click();
}

/** Adds someone through Invite someone and waits for their row. */
async function invite(page: Page, name: string, email = "", setup?: (dialog: Locator) => Promise<void>) {
  await page.getByRole("button", { name: "Invite someone" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite someone" });
  await dialog.getByLabel("Name").fill(name);
  if (email) await dialog.getByLabel("Email").fill(email);
  await setup?.(dialog);
  await dialog.getByRole("button", { name: "Add to the team" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
}

async function remove(page: Page, name: string) {
  await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: `More for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Remove from the team" }).click();
  await page.getByRole("dialog", { name: `Remove ${name}?` }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 940 } });

  test("row buttons never cover the queue count, and group actions are real buttons", async ({ page }) => {
    await signIn(page);
    await people(page);
    // The demo's "View as" sits beside Edit access; the Waiting column stays clear of both.
    const waiting = (await page.getByText("Waiting", { exact: true }).boundingBox())!;
    const viewAs = (await page.getByRole("listitem").filter({ hasText: "Joss Weekes" }).getByRole("button", { name: "View as" }).boundingBox())!;
    expect(viewAs.x).toBeGreaterThanOrEqual(waiting.x + waiting.width);

    await page.getByRole("tab", { name: "Groups" }).click();
    // Bordered like every other button, not grey text.
    for (const name of ["Edit Nonprofit pod", "Delete Nonprofit pod"]) {
      const border = await page.getByRole("button", { name }).evaluate((el) => getComputedStyle(el).borderTopColor);
      expect(border).not.toBe("rgba(0, 0, 0, 0)");
    }
    await page.getByRole("button", { name: "Edit Nonprofit pod" }).click();
    await expect(page.getByRole("dialog", { name: "Edit group" })).toBeVisible();
  });

  test("undoing the last exception keeps the section open", async ({ page }) => {
    await signIn(page);
    await people(page);
    await page.getByRole("listitem").filter({ hasText: "Dana Okafor" }).getByRole("button", { name: "Edit access for Dana Okafor" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit access" });
    await dialog.getByText(/Exceptions and limits for Dana/).click();
    const comment = dialog.getByRole("radiogroup", { name: "Comment" });
    await comment.getByRole("radio", { name: "Block" }).click();
    await comment.getByRole("radio", { name: "Role" }).click();
    // It used to snap shut here, taking the control you had just pressed with it.
    await expect(comment.getByRole("radio", { name: "Role" })).toBeVisible();
    await expect(comment.getByRole("radio", { name: "Role" })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
  });

  test("a removed person comes back from the bin, and a taken email says so instead of failing quietly", async ({ page }) => {
    const gone = `Bin Person ${run}`, twin = `Bin Twin ${run}`, email = `bin-${run}@example.test`;
    await signIn(page);
    await people(page);
    await invite(page, gone, email);
    await remove(page, gone);
    // Someone new is given the same address before anyone thinks of the bin.
    await invite(page, twin, email);

    await page.goto("/trash");
    await settle(page);
    await page.getByRole("button", { name: `Restore ${gone}` }).click();
    await expect(page.getByText(`Someone on the team already uses ${email}`)).toBeVisible();
    // Still in the bin, not lost.
    await page.reload();
    await expect(page.getByRole("button", { name: `Restore ${gone}` })).toBeVisible();

    await people(page);
    await page.getByRole("listitem").filter({ hasText: twin }).getByRole("button", { name: `Edit access for ${twin}` }).click();
    const dialog = page.getByRole("dialog", { name: "Edit access" });
    await dialog.getByLabel("Email").fill(`twin-${run}@example.test`);
    await dialog.getByRole("button", { name: "Save access" }).click();
    await expect(dialog).toHaveCount(0);

    await page.goto("/trash");
    await settle(page);
    await page.getByRole("button", { name: `Restore ${gone}` }).click();
    await expect(page.getByText(`${gone} is back`)).toBeVisible();
    await people(page);
    await expect(page.getByRole("listitem").filter({ hasText: gone })).toBeVisible();
  });

  test("only admins bring back people and groups, even for someone allowed the bin", async ({ page }) => {
    const manager = `Bin Manager ${run}`, gone = `Gone ${run}`;
    await signIn(page);
    await people(page);
    // A manager who is allowed to delete, as an exception, and so gets the recycle bin.
    await invite(page, manager, "", async (dialog) => {
      await dialog.getByRole("radio", { name: /^Manager/ }).click();
      await dialog.getByRole("checkbox", { name: /Every client/ }).click();
      await dialog.getByText(/Exceptions and limits for Bin/).click();
      await dialog.getByRole("radiogroup", { name: "Delete assets, and archive clients or brands" }).getByRole("radio", { name: "Allow" }).click();
    });
    await invite(page, gone);
    await remove(page, gone);

    // The bin entry's id, taken from the admin's own Restore click, which never reaches the server.
    await page.goto("/trash");
    await settle(page);
    let entry = "";
    await page.route("**/trash", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      entry = JSON.parse(route.request().postData() ?? "[]")[0] ?? "";
      await route.abort();
    });
    await page.getByRole("button", { name: `Restore ${gone}` }).click();
    await expect.poll(() => entry).toMatch(/^tr/);
    await page.unrouteAll();

    await signIn(page, manager);
    await page.goto("/trash");
    await settle(page);
    await expect(page.getByRole("heading", { name: "Recycle bin" })).toBeVisible();
    await expect(page.getByText(gone)).toHaveCount(0);
    // Asked directly, the server refuses too, and emptying the bin passes over people.
    expect(await callAction(page, "/trash", "app/actions.ts", "restoreFromTrash", [entry])).toContain("Only admins can bring back people and groups.");
    expect(await callAction(page, "/trash", "app/actions.ts", "deleteForever", [entry])).toContain("Only admins can delete people and groups for good.");
    await callAction(page, "/trash", "app/actions.ts", "deleteForever", ["all"]);

    await signIn(page);
    await page.goto("/trash");
    await settle(page);
    await page.getByRole("button", { name: `Restore ${gone}` }).click();
    await expect(page.getByText(`${gone} is back`)).toBeVisible();
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("every team tab fits, and the role tag opens Edit access here too", async ({ page }) => {
    await signIn(page);
    await people(page);
    // Nothing to scroll sideways to: Groups used to sit past the edge.
    const [shown, full] = await page.getByRole("tablist", { name: "Team" }).evaluate((el) => [el.clientWidth, el.scrollWidth]);
    expect(full).toBeLessThanOrEqual(shown);
    for (const name of ["People", "Roles and permissions", "Who sees what", "Groups"]) {
      await expect(page.getByRole("tab", { name })).toBeInViewport({ ratio: 0.9 });
    }
    await page.getByRole("button", { name: "Change role for Tom Aldridge: Reviewer" }).click();
    await expect(page.getByRole("dialog", { name: "Edit access" })).toBeVisible();
    await page.keyboard.press("Escape");

    // Who sees what: one step from the role to changing it.
    await page.getByRole("tab", { name: "Who sees what" }).click();
    await page.getByRole("button", { name: "Change role for Leo Park: Contributor" }).first().click();
    await expect(page.getByRole("dialog", { name: "Edit access" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "People" }).click();
  });
});
