import { expect, test } from "@playwright/test";
import { settle, signIn } from "./helpers";

/*
 * The offer page's everyday actions are where people look for them: real
 * buttons, on every screen size, and only for the people who may use them.
 */

test.use({ viewport: { width: 1440, height: 900 } });

test("an archived offer is restored from the archived note, and archived again from its menu", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of14"); // Workspace for Schools, archived in the seed
  await settle(page);
  await expect(page.getByText(/^Archived\. Its assets are still in the library/)).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText(/^Archived\. Its assets are still in the library/)).toHaveCount(0);
  await page.reload();
  await settle(page);
  await expect(page.getByText(/^Archived\. Its assets are still in the library/)).toHaveCount(0);

  // Put it back as it was.
  await page.getByRole("button", { name: "More offer actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toBeVisible();

  // Only people who can archive are offered Restore.
  await signIn(page, "Dana Okafor"); // Editor: can archive
  await page.goto("/offers/of14");
  await settle(page);
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toBeVisible();
  await signIn(page, "Leo Park"); // Contributor: cannot
  await page.goto("/offers/of14");
  await settle(page);
  await expect(page.getByText(/^Archived\. Its assets are still in the library/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toHaveCount(0);
});

test("on a phone, Send for review is in view without opening the details", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto("/offers/of15");
  await settle(page);
  const summary = page.getByRole("complementary", { name: "Offer summary" });
  await expect(summary.getByRole("heading", { name: "Review" })).toBeVisible();
  await expect(summary.getByRole("button", { name: "Send for review" })).toBeVisible();
  await expect(summary.getByRole("heading", { name: "Positioning" })).toBeHidden();
});

test("the status picker does not offer Archived; archiving is its own action", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of15");
  await settle(page);
  await expect(page.getByRole("combobox", { name: "Status" }).locator("option")).toHaveText(["Ideation", "Active", "Paused"]);
});

test("a key link with no address yet can be given one from the offer", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of3"); // Its Sports Club Landing Page has no URL yet
  await settle(page);
  const summary = page.getByRole("complementary", { name: "Offer summary" });
  await expect(summary.getByText("No link added yet")).toBeVisible();
  await summary.getByRole("button", { name: "Add link to Sports Club Landing Page" }).click();
  const form = page.getByRole("dialog", { name: "Edit asset" });
  await expect(form.getByPlaceholder("yoursite.org/free-audit")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(form).toHaveCount(0);

  // A contributor cannot change that asset, so is not offered it.
  await signIn(page, "Leo Park");
  await page.goto("/offers/of3");
  await settle(page);
  await expect(page.getByRole("complementary", { name: "Offer summary" }).getByText("No link added yet")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Add link to / })).toHaveCount(0);
});

test("a note is edited, resolved, reopened and deleted with real buttons, and it sticks after a reload", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of22?tab=discussion");
  await settle(page);
  const panel = page.getByRole("tabpanel", { name: /^Discussion/ });
  const text = `Findability note ${Date.now()}`;
  await panel.getByPlaceholder(/Add a note/).fill(text);
  await panel.getByRole("button", { name: "Post note" }).click();
  const note = panel.locator("div.rounded-xl.border").filter({ hasText: text }).last();
  await expect(note).toBeVisible();

  await note.getByRole("button", { name: "Edit note" }).click();
  await note.getByRole("textbox", { name: "Edit note" }).fill(`${text}, edited`);
  await note.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.getByText(`${text}, edited`)).toBeVisible();
  await page.reload();
  await settle(page);
  await expect(panel.getByText(`${text}, edited`)).toBeVisible();

  await note.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(panel.getByText(`${text}, edited`)).toBeHidden();
  await page.reload();
  await settle(page);
  await panel.getByRole("button", { name: /^\d+ resolved$/ }).click();
  await note.getByRole("button", { name: "Reopen", exact: true }).click();
  await page.reload();
  await settle(page);
  await expect(panel.getByText(`${text}, edited`)).toBeVisible();

  page.once("dialog", (d) => void d.accept());
  await note.getByRole("button", { name: "Delete note" }).click();
  await expect(panel.getByText(`${text}, edited`)).toHaveCount(0);
  await page.reload();
  await settle(page);
  await expect(panel.getByText(`${text}, edited`)).toHaveCount(0);
});

test("an offer tagged in a note is a link the keyboard reaches", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of15?tab=discussion");
  await settle(page);
  const tag = page.getByRole("tabpanel", { name: /^Discussion/ }).getByRole("link", { name: "#Ad Grant for Church Giving" });
  await tag.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/offers\/of4$/);
});

test("people who cannot write notes or record results are not asked to", async ({ page }) => {
  await signIn(page, "Marta Vieira"); // Viewer
  await page.goto("/offers/of20?tab=discussion");
  await settle(page);
  await expect(page.getByText("No notes yet.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Write down the thing/)).toHaveCount(0);
  await page.goto("/offers/of20?tab=results");
  await settle(page);
  await expect(page.getByText(/^No results recorded yet\./)).toBeVisible();
  await expect(page.getByText(/^After launch, record the leads/)).toHaveCount(0);
});

test("an arrow on the funnel board is deleted with its Delete button, and stays deleted", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of13?tab=funnel"); // Workspace for Churches: no board yet
  await settle(page);
  const funnel = page.getByRole("tabpanel", { name: "Funnel" });
  // The board says how to change an arrow, not only a box.
  await expect(funnel.getByText(/Select an arrow to label, reverse or delete it\./)).toBeVisible();
  await funnel.getByRole("button", { name: /^Draft from/ }).click();
  const count = funnel.getByText(/^\d+ box(es)? · \d+ arrows?$/);
  await expect(count).toBeVisible();
  const before = Number((await count.innerText()).match(/· (\d+) arrow/)![1]);
  expect(before).toBeGreaterThan(0);

  await funnel.getByRole("button", { name: /^Arrow from / }).first().click();
  const inspector = funnel.getByRole("group", { name: "Arrow" });
  await inspector.getByRole("button", { name: "Delete arrow" }).click();
  await expect(inspector).toHaveCount(0);
  await expect(count).toContainText(`· ${before - 1} arrow`);
  await expect(funnel.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await settle(page);
  await expect(funnel.getByText(/^\d+ box(es)? · \d+ arrows?$/)).toContainText(`· ${before - 1} arrow`);
});
