import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator } from "@playwright/test";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/*
 * Clients, brands, services and the Brand Kit: every action can be found by
 * the people allowed to take it. Buttons look like buttons, archived things
 * can be restored where they are shown, and nothing is cut off on a phone.
 */

/** A real button: it has a visible border, so it does not read as plain text. */
async function bordered(l: Locator) {
  return l.evaluate((el) => {
    const s = getComputedStyle(el);
    return parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none" && !/rgba\(.*, 0\)$/.test(s.borderTopColor);
  });
}

test("Strategy: adding and editing are buttons, and Edit segments opens the kit on Segments", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1/strategy");
  await settle(page);
  for (const name of ["New goal", "New type", "Edit segments", "Edit Awareness", "Merge Awareness", "Edit Audit"]) {
    const b = page.getByRole("button", { name, exact: true });
    await expect(b).toBeVisible();
    expect(await bordered(b), `${name} has a border`).toBe(true);
  }
  // It used to open on Colour, leaving people to hunt for the Segments tab.
  await page.getByRole("button", { name: "Edit segments" }).click();
  const kit = page.getByRole("dialog", { name: "Edit the Brand Kit" });
  await expect(kit.getByRole("tab", { name: "Segments" })).toHaveAttribute("aria-selected", "true");
  await expect(kit.getByRole("textbox", { name: "Segment name" }).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // Editors cannot change strategy, so they see none of it.
  await signIn(page, "Ines Batz");
  await page.goto("/brands/br1/strategy");
  await settle(page);
  await expect(page.getByRole("button", { name: /^(New goal|New type|Edit segments)$/ })).toHaveCount(0);
});

test("removing a goal asks first, and Cancel goes back to the goal", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br2/strategy");
  await settle(page);
  await page.getByRole("button", { name: "New goal" }).click();
  await page.getByRole("dialog", { name: "New goal" }).getByRole("textbox", { name: /^Goal/ }).fill("Findability check");
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(page.getByRole("button", { name: "Edit Findability check" })).toBeVisible();

  await page.getByRole("button", { name: "Edit Findability check" }).click();
  await page.getByRole("dialog", { name: "Edit goal" }).getByRole("button", { name: "Remove goal" }).click();
  const ask = page.getByRole("dialog", { name: "Remove Findability check?" });
  await expect(ask).toContainText("cannot be undone");
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Edit goal" })).toBeVisible();

  await page.getByRole("dialog", { name: "Edit goal" }).getByRole("button", { name: "Remove goal" }).click();
  await page.getByRole("dialog", { name: "Remove Findability check?" }).getByRole("button", { name: "Remove goal" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await settle(page);
  await expect(page.getByRole("button", { name: "Edit Findability check" })).toHaveCount(0);
});

test("archived clients, brands and services are restored from their own page, by whoever may", async ({ page }) => {
  await signIn(page);

  // A client archived in the seed: Restore sits in the note, not only in the … menu.
  await page.goto("/clients/cl4");
  await settle(page);
  await page.getByRole("button", { name: "Restore client" }).click();
  await expect(page.getByText(/^Archived\. Hidden from the street/)).toHaveCount(0);
  await page.reload();
  await settle(page);
  await expect(page.getByText(/^Archived\. Hidden from the street/)).toHaveCount(0);
  await page.getByRole("button", { name: "More client actions" }).click();
  await page.getByRole("menuitem", { name: "Archive client" }).click();
  await expect(page.getByRole("button", { name: "Restore client" })).toBeVisible();

  // A service.
  await page.goto("/services/sv6");
  await settle(page);
  await page.getByRole("button", { name: "More service actions" }).click();
  await page.getByRole("menuitem", { name: "Archive service" }).click();
  await page.reload();
  await settle(page);
  await page.getByRole("button", { name: "Restore service" }).click();
  await page.reload();
  await settle(page);
  await expect(page.getByText(/^Archived\. Its offers still exist/)).toHaveCount(0);

  // A brand, restored from one of its sections rather than only from its Home.
  await page.goto("/brands/br4");
  await settle(page);
  await page.getByRole("button", { name: "Archive brand" }).click();
  await page.goto("/brands/br4/offers");
  await settle(page);
  await expect(page.getByText("This brand is archived.")).toBeVisible();
  await page.getByRole("button", { name: "Restore brand" }).click();
  await page.reload();
  await settle(page);
  await expect(page.getByText("This brand is archived.")).toHaveCount(0);

  // A manager cannot restore a whole client, and is told who can.
  await signIn(page, "Joss Weekes");
  await page.goto("/clients/cl4");
  await settle(page);
  await expect(page.getByText(/Only an admin can restore it\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore client" })).toHaveCount(0);
});

test("a contributor can start an offer from any service page, but edits only their own service", async ({ page }) => {
  await signIn(page, "Leo Park");
  await page.goto("/services/sv1");
  await settle(page);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "New offer" }).click();
  await expect(page.getByRole("dialog", { name: "New offer" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("people who create assets can add logo and font files from the Brand Kit", async ({ page }) => {
  await signIn(page, "Ines Batz"); // Editor: no kit rights, but creates assets
  await page.goto("/brands/br1/kit#kit-logo");
  await settle(page);
  await expect(page.getByRole("button", { name: "Edit kit" })).toHaveCount(0);
  await page.getByRole("button", { name: "Add a logo file" }).click();
  await expect(page.getByRole("dialog", { name: "New logo" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/brands/br1/kit#kit-files");
  await settle(page);
  await page.getByRole("button", { name: "Add a font file" }).click();
  await expect(page.getByRole("dialog", { name: "New font" })).toBeVisible();
  await page.keyboard.press("Escape");

  // A viewer only reads.
  await signIn(page, "Marta Vieira");
  await page.goto("/brands/br4/kit#kit-logo");
  await settle(page);
  await expect(page.getByRole("button", { name: /^Add a (logo|font) file$/ })).toHaveCount(0);
});

test("on a phone, a brand's Assets keeps Add asset on screen, and Import looks like a button", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto("/brands/br1/assets");
  await settle(page);
  const add = page.getByRole("button", { name: "New asset", exact: true });
  const box = (await add.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await bordered(page.getByRole("link", { name: "Import", exact: true }))).toBe(true);
});

test("Strategy: a segment opens the brand's offers for that segment, and the filter shows and clears", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1/strategy");
  await settle(page);
  await page.getByRole("link", { name: /^Church\W*\d+ offers?$/ }).click();
  await expect(page).toHaveURL(/\/brands\/br1\/offers\?segment=Church$/);
  await settle(page);
  const main = page.getByRole("main");
  const chip = main.getByRole("button", { name: "Segment: Church, clear this filter" });
  await expect(chip).toBeVisible();
  await expect(main.getByRole("link", { name: /Ad Grant for Church Reach/ })).toBeVisible();
  await expect(main.getByRole("link", { name: /Ad Grant for School Enrolment/ })).toHaveCount(0);
  // The chip takes the Segment menu's place, so the choice is shown once.
  await expect(main.getByRole("combobox", { name: "Segment" })).toHaveCount(0);

  // The other filters still work alongside it.
  await main.getByRole("combobox", { name: "Status" }).selectOption("Ideation");
  await expect(main.getByRole("link", { name: /Workspace for Churches/ })).toBeVisible();
  await expect(main.getByRole("link", { name: /Ad Grant for Church Reach/ })).toHaveCount(0);
  await main.getByRole("combobox", { name: "Status" }).selectOption("All");
  await expect(main.getByRole("link", { name: /Ad Grant for Church Reach/ })).toBeVisible();

  const scan = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  const problems = scan.violations.map((v) => `${v.id} × ${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(problems, problems.join("\n")).toEqual([]);

  // Clearing it shows every segment and hands focus to the Segment menu; choosing from the menu brings a chip back.
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/brands\/br1\/offers$/);
  await expect(main.getByRole("link", { name: /Ad Grant for School Enrolment/ })).toBeVisible();
  const menu = main.getByRole("combobox", { name: "Segment" });
  await expect(menu).toBeFocused();
  await menu.selectOption("Education");
  await expect(page).toHaveURL(/\?segment=Education$/);
  await expect(main.getByRole("button", { name: "Segment: Education, clear this filter" })).toBeFocused();

  // A segment the brand does not have says so, with a way out.
  await page.goto("/brands/br1/offers?segment=Nobody");
  await settle(page);
  await expect(main.getByText("No segment by that name")).toBeVisible();
  await expect(main.getByText(/no segment called “Nobody”/)).toBeVisible();
  await main.getByRole("button", { name: "Show every segment" }).click();
  await expect(page).toHaveURL(/\/brands\/br1\/offers$/);
  await expect(main.getByRole("link", { name: /Ad Grant for Church Reach/ })).toBeVisible();

  // A service's segment heading reaches the same list when other services speak to that segment too.
  await page.goto("/services/sv1");
  await settle(page);
  const across = page.getByRole("tabpanel").getByRole("link", { name: /^Church offers: All \d+ in this brand$/ });
  await expect(across).toHaveAttribute("href", "/brands/br1/offers?segment=Church");
  await across.click();
  await expect(page).toHaveURL(/\/brands\/br1\/offers\?segment=Church$/);
  await expect(main.getByRole("button", { name: "Segment: Church, clear this filter" })).toBeVisible();

  // On a phone the filtered list fits without sideways scrolling.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await settle(page);
  await expect(main.getByRole("button", { name: "Segment: Church, clear this filter" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `the offers page scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
});
