import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 940 } });

/** The Funnel section of an offer page. */
const board = (page: Page) => page.locator("section", { has: page.getByRole("heading", { name: "Funnel", exact: true }) });

test("funnel board: add a step, write in it, draw and label an arrow, and it is still there after a reload", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of15");
  await settle(page);
  const funnel = board(page);
  await expect(funnel.getByRole("heading", { name: "Funnel", exact: true })).toBeVisible();

  // The seeded example: three sources, the landing page, the audit, the consultation and the service.
  await expect(funnel.getByText("8 boxes · 6 arrows")).toBeVisible();
  await expect(funnel.getByRole("button", { name: /^Step: Free Audit Landing Page/ })).toBeVisible();
  await expect(funnel.getByRole("button", { name: /^Step: Google Ad Grant/ })).toBeVisible();
  await expect(funnel.getByRole("heading", { name: "Everything this funnel points at" })).toBeVisible();

  // Add a step and write in it.
  await funnel.getByRole("button", { name: "+ Step", exact: true }).click();
  const text = funnel.getByRole("textbox", { name: "Text in this box" });
  await expect(text).toBeFocused();
  await text.fill("Email automation");
  const step = funnel.getByRole("button", { name: "Step: Email automation" });
  await expect(step).toBeVisible();

  // Draw an arrow from it to the audit, then label it.
  await funnel.getByRole("button", { name: "Draw arrow from here" }).click();
  await expect(funnel.getByText("Click the box this leads to")).toBeVisible();
  await funnel.getByRole("button", { name: /^Step: The audit/ }).click();
  const label = funnel.getByRole("textbox", { name: "Arrow label" });
  await expect(label).toBeVisible();
  await label.fill("form submit");
  await label.press("Enter");
  await expect(funnel.getByRole("button", { name: "Arrow from Email automation to The audit, labelled form submit" })).toBeVisible();
  await expect(funnel.getByText("9 boxes · 7 arrows")).toBeVisible();
  await expect(funnel.getByText("Saved", { exact: true })).toBeVisible();

  await page.reload();
  await settle(page);
  await expect(funnel.getByRole("button", { name: "Step: Email automation" })).toBeVisible();
  await expect(funnel.getByRole("button", { name: "Arrow from Email automation to The audit, labelled form submit" })).toBeVisible();
  await expect(funnel.getByText("9 boxes · 7 arrows")).toBeVisible();

  // Drag snaps to the 20px grid; arrow keys nudge one step.
  const moved = funnel.getByRole("button", { name: "Step: Email automation" });
  const at = await moved.boundingBox();
  await page.mouse.move(at!.x + 30, at!.y + 20);
  await page.mouse.down();
  await page.mouse.move(at!.x + 90, at!.y + 45, { steps: 6 });
  await page.mouse.move(at!.x + 147, at!.y + 53, { steps: 6 });
  await page.mouse.up();
  const left = async () => Number((await moved.locator("xpath=..").getAttribute("style"))?.match(/left:\s*(\d+)px/)?.[1]);
  const x1 = await left();
  expect(x1 % 20).toBe(0);
  await page.keyboard.press("ArrowRight");
  await expect.poll(left).toBe(x1 + 20);

  // Delete removes the selected box and the arrow that came from it.
  await page.keyboard.press("Delete");
  await expect(funnel.getByRole("button", { name: "Step: Email automation" })).toHaveCount(0);
  await expect(funnel.getByText("8 boxes · 6 arrows")).toBeVisible();
  await expect(funnel.getByText("Saved", { exact: true })).toBeVisible();
});

test("funnel board: a viewer sees it and can open files, but cannot change it", async ({ page }) => {
  // Priya drafts a funnel on an offer Marta can see, from its linked assets.
  await signIn(page);
  await page.goto("/offers/of20");
  await settle(page);
  const funnel = board(page);
  await expect(funnel.getByText("Map how people move through this offer")).toBeVisible();
  await funnel.getByRole("button", { name: "Draft from linked assets" }).click();
  await expect(funnel.getByRole("button", { name: /^Step: Intake Google Ads/ })).toBeVisible();
  await expect(funnel.getByRole("button", { name: /^Step: Spring Intake Landing Page/ })).toBeVisible();
  await expect(funnel.getByRole("button", { name: /^Stage: Audience growth/ })).toBeVisible();

  await signIn(page, "Marta Vieira");
  await page.goto("/offers/of20");
  await settle(page);
  await expect(funnel.getByRole("heading", { name: "Funnel", exact: true })).toBeVisible();
  await expect(funnel.getByText("Audience growth")).toBeVisible();
  await expect(funnel.getByRole("button", { name: "+ Step", exact: true })).toHaveCount(0);
  await expect(funnel.getByRole("combobox", { name: /Add a box linked/ })).toHaveCount(0);
  await expect(funnel.getByText("Delete key removes what is selected")).toHaveCount(0);
  await expect(funnel.getByRole("button", { name: /^(Step|Stage|Note):/ })).toHaveCount(0);

  // The box itself opens the real file.
  await funnel.getByRole("button", { name: /^Open Spring Intake Landing Page/ }).first().click();
  await expect(page).toHaveURL(/asset=as26/);
});

test("funnel board: a new offer starts with a funnel drafted from its CTA, goal and service", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of24");
  await settle(page);
  await page.getByRole("button", { name: "Adapt for another segment" }).click();
  await page.getByRole("button", { name: "Save offer" }).click();
  await page.waitForURL((u) => /\/offers\//.test(u.pathname) && !u.pathname.endsWith("/of24"));
  await settle(page);
  const funnel = board(page);
  await expect(funnel.getByRole("button", { name: /^Step: Book a Free Audit/ })).toBeVisible();
  await expect(funnel.getByRole("button", { name: /^Stage: Revenue/ })).toBeVisible();
  await expect(funnel.getByRole("button", { name: /^Step: Google Ad Grant/ })).toBeVisible();
  await expect(funnel.getByText("3 boxes · 2 arrows")).toBeVisible();
});

test("funnel board meets WCAG AA and fits a phone", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of15");
  await settle(page);
  const funnel = board(page);
  const scan = async (when: string) => {
    const r = await new AxeBuilder({ page }).include("main section").withTags(["wcag2a", "wcag2aa"]).analyze();
    const problems = r.violations.map((v) => `${when}: ${v.id} × ${v.nodes.length} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    expect(problems, problems.join("\n")).toEqual([]);
  };
  await scan("board");
  await funnel.getByRole("button", { name: /^Step: The audit/ }).click();
  await expect(funnel.getByRole("group", { name: "Box" })).toBeVisible();
  await page.waitForTimeout(400); // let the popover finish fading in
  await scan("box selected");
  await page.keyboard.press("Escape");
  await expect(funnel.getByRole("group", { name: "Box" })).toHaveCount(0);
  await funnel.getByRole("button", { name: /labelled booked call$/ }).click();
  await expect(funnel.getByRole("group", { name: "Arrow" })).toBeVisible();
  await page.waitForTimeout(400);
  await scan("arrow selected");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await settle(page);
  await expect(funnel.getByRole("heading", { name: "Funnel", exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `the offer page scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
});
