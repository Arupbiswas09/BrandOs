import { expect, test, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";

/*
 * Stars and results per offer, through the dev preview route that mounts
 * every component alone. Once the components are mounted in the real pages
 * (see src/components/features/*\/MOUNT.md), point these at those pages.
 */

test.use({ viewport: { width: 1440, height: 940 } });

const PREVIEW = "/dev/stars-results";
const STARS = "app/star-actions.ts";
const RESULTS = "app/results-actions.ts";

async function preview(page: Page, offer = "of15") {
  await page.goto(`${PREVIEW}?offer=${offer}`);
  await settle(page);
}

/** The sidebar list (the first, unfolded one on the preview page). */
const sidebarList = (page: Page) => page.getByRole("group", { name: "Starred" }).first();
const card = (page: Page) => page.locator("#starred");

test("a star sticks after a reload, shows in the starred lists, and comes off again", async ({ page }) => {
  await signIn(page);
  await preview(page);
  const NAME = "Ad Grant for Church Reach";
  const star = page.getByRole("button", { name: `Star ${NAME}` });
  const unstar = page.getByRole("button", { name: `Unstar ${NAME}` }).first();

  await expect(star).toHaveAttribute("aria-pressed", "false");
  await expect(sidebarList(page).getByRole("link", { name: NAME })).toHaveCount(0);
  await star.click();
  await expect(unstar).toHaveAttribute("aria-pressed", "true");
  await expect(sidebarList(page).getByRole("link", { name: NAME })).toBeVisible();
  await expect(card(page).getByRole("link", { name: new RegExp(NAME) })).toContainText("Offer · Quokka For Good");

  await page.reload();
  await settle(page);
  await expect(unstar).toHaveAttribute("aria-pressed", "true");
  await expect(sidebarList(page).getByRole("link", { name: NAME })).toBeVisible();
  // The list links to the offer; assets in it open the drawer instead.
  await expect(sidebarList(page).getByRole("link", { name: NAME })).toHaveAttribute("href", "/offers/of1");
  await sidebarList(page).getByRole("button", { name: "Free Audit Landing Page" }).click();
  await expect(page).toHaveURL(/asset=as1/);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/asset=/);

  // Unstarring from the dashboard card takes it off every list.
  await card(page).getByRole("button", { name: `Unstar ${NAME}` }).click();
  await expect(star).toHaveAttribute("aria-pressed", "false");
  await expect(sidebarList(page).getByRole("link", { name: NAME })).toHaveCount(0);
  await page.reload();
  await settle(page);
  await expect(star).toHaveAttribute("aria-pressed", "false");
  await expect(card(page).getByText(NAME)).toHaveCount(0);
});

test("S stars the item whose page it is, and not while typing", async ({ page }) => {
  await signIn(page);
  await preview(page, "of24");
  const NAME = "Thirty-Minute Grant Consultation";
  await page.keyboard.press("s");
  await expect(page.getByText(`Starred ${NAME}`)).toBeVisible();
  await expect(sidebarList(page).getByRole("link", { name: NAME })).toBeVisible();
  // Typing an "s" into a field is just typing.
  await page.getByRole("button", { name: "Record the first results" }).click();
  await page.getByLabel("Lesson learned").pressSequentially("ss");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(sidebarList(page).getByRole("link", { name: NAME })).toBeVisible();
  await page.keyboard.press("s");
  await expect(page.getByText(`Unstarred ${NAME}`)).toBeVisible();
  await expect(sidebarList(page).getByRole("link", { name: NAME })).toHaveCount(0);
});

test("stars are only for things I can see, and stop at 30", async ({ page }) => {
  // Marta sees Northgate only.
  await signIn(page, "Marta Vieira");
  let body = await callAction(page, PREVIEW, STARS, "toggleStar", ["offer", "of1", true]);
  expect(body).toContain("That is not here any more.");
  body = await callAction(page, PREVIEW, STARS, "toggleStar", ["offer", "of20", true]);
  expect(body).toContain("\"ok\":true");
  body = await callAction(page, PREVIEW, STARS, "toggleStar", ["offer", "of20", false]);
  expect(body).toContain("\"ok\":true");

  // Joss starts with no stars; the 31st is refused with a plain reason.
  await signIn(page, "Joss Weekes");
  const ids = [...Array.from({ length: 30 }, (_, i) => `as${i + 1}`), "as32"];
  try {
    for (const id of ids.slice(0, 30)) {
      body = await callAction(page, PREVIEW, STARS, "toggleStar", ["asset", id, true]);
      expect(body, id).toContain("\"ok\":true");
    }
    body = await callAction(page, PREVIEW, STARS, "toggleStar", ["asset", ids[30], true]);
    expect(body).toContain("You can star up to 30 things.");
    await preview(page);
    // The sidebar shows the first ten and points at the rest.
    await expect(sidebarList(page).getByRole("listitem")).toHaveCount(10);
    // Archived ones are left out of the lists, so only "more" is certain.
    await expect(page.getByRole("link", { name: /^\d+ more on the dashboard$/ })).toBeVisible();
    // A refused star goes back, and says why.
    const star = page.getByRole("button", { name: "Star Free Marketing Audit" }).first();
    await star.click();
    await expect(page.getByText("You can star up to 30 things.")).toBeVisible();
    await expect(star).toHaveAttribute("aria-pressed", "false");
  } finally {
    for (const id of ids) await callAction(page, PREVIEW, STARS, "toggleStar", ["asset", id, false]);
  }
});

/** Takes away any results a previous run left on this offer (admin only). */
async function clearResults(page: Page) {
  const remove = page.getByRole("button", { name: /^Remove results for / });
  while (await remove.count()) {
    await remove.first().click();
    await page.getByRole("group", { name: /^Remove the results for / }).getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("group", { name: /^Remove the results for / })).toHaveCount(0);
  }
}

/** The cells of one row of the results table, by period. */
const cells = (page: Page, period: string) => page.getByRole("row", { name: new RegExp(`^${period}`) }).getByRole("cell");

test("record results, correct them, and the totals and conversion add up", async ({ page }) => {
  await signIn(page);
  await preview(page, "of24");
  await clearResults(page);
  await expect(page.getByText("After launch, record the leads, calls booked and conversions for each period")).toBeVisible();

  const fill = async (period: string, leads: string, calls: string, conversions: string, lesson: string) => {
    const form = page.getByRole("form").last();
    await form.getByRole("button", { name: "Custom" }).click();
    await form.getByRole("textbox", { name: /^Period/ }).fill(period);
    await form.getByLabel("Leads").fill(leads);
    await form.getByLabel("Calls booked").fill(calls);
    await form.getByLabel("Conversions").fill(conversions);
    await form.getByLabel("Lesson learned").fill(lesson);
  };

  await page.getByRole("button", { name: "Record the first results" }).click();
  await expect(page.getByRole("form", { name: "Record results" })).toBeVisible();
  await fill("E2E week one", "40", "10", "4", "Short calls book better.");
  await page.getByRole("button", { name: "Save results" }).click();
  await expect(page.getByText("Results for E2E week one recorded")).toBeVisible();
  await expect(cells(page, "E2E week one")).toHaveText(["40", "10", "4", "10.0%", "Short calls book better.", ""]);

  await page.getByRole("button", { name: "Record results", exact: true }).click();
  await fill("E2E week two", "60", "30", "11", "");
  // A number that cannot be right is caught before saving.
  await page.getByRole("form", { name: "Record results" }).getByLabel("Conversions").fill("61");
  await expect(page.getByText("Conversions cannot be more than leads.")).toBeVisible();
  await page.getByRole("form", { name: "Record results" }).getByLabel("Conversions").fill("11");
  await page.getByRole("button", { name: "Save results" }).click();
  await expect(page.getByText("Results for E2E week two recorded")).toBeVisible();
  await expect(cells(page, "E2E week two")).toHaveText(["60", "30", "11", "18.3%", "No lesson written", ""]);
  await expect(cells(page, "Total")).toHaveText(["100", "40", "15", "15.0%", "", ""]);

  // Correct the first period in place.
  await page.getByRole("button", { name: "Edit results for E2E week one" }).click();
  const edit = page.getByRole("form", { name: "Edit results for E2E week one" });
  await expect(edit.getByLabel("Leads")).toHaveValue("40");
  await edit.getByLabel("Conversions").fill("9");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Results for E2E week one updated")).toBeVisible();
  await expect(cells(page, "E2E week one")).toHaveText(["40", "10", "9", "22.5%", "Short calls book better.", ""]);
  await expect(cells(page, "Total")).toHaveText(["100", "40", "20", "20.0%", "", ""]);
  await expect(page.getByText("Conversion fell to 18.3% in E2E week two, down 4.2 points on E2E week one.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Thirty-Minute Grant Consultation/ }).getByText("20.0% conv.")).toBeVisible();

  // The server checks too.
  const body = await callAction(page, PREVIEW, RESULTS, "saveResult", [{ offerId: "of24", period: "Bad", leads: 5, conversions: 9, lesson: "" }]);
  expect(body).toContain("Conversions cannot be more than leads.");

  await preview(page, "of24");
  await clearResults(page);
  await expect(page.getByRole("button", { name: "Record the first results" })).toBeVisible();
});

test("a Contributor cannot record or change results on someone else's offer", async ({ page }) => {
  await signIn(page, "Leo Park");
  await preview(page, "of15"); // Priya's offer
  await expect(page.getByRole("row", { name: /^Launch month/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Record results|^Record the first results/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Edit results for / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Remove results for / })).toHaveCount(0);

  let body = await callAction(page, PREVIEW, RESULTS, "saveResult", [{ id: "rs1", offerId: "of15", period: "Changed", leads: 1, lesson: "" }]);
  expect(body).toContain("Contributors can only record results on offers they own.");
  body = await callAction(page, PREVIEW, RESULTS, "saveResult", [{ offerId: "of15", period: "New", leads: 1, lesson: "" }]);
  expect(body).toContain("Contributors can only record results on offers they own.");
  await preview(page, "of15");
  await expect(cells(page, "Launch month").first()).toHaveText("42");
  await expect(page.getByRole("row", { name: /^Changed|^New/ })).toHaveCount(0);
});

test("only admins remove results; everyone else corrects them", async ({ page }) => {
  await signIn(page, "Joss Weekes"); // Manager
  await preview(page, "of15");
  await expect(page.getByRole("button", { name: "Edit results for Launch month" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Remove results for / })).toHaveCount(0);
  const body = await callAction(page, PREVIEW, RESULTS, "removeResult", ["rs1"]);
  expect(body).toContain("Only admins can remove results.");
  await preview(page, "of15");
  await expect(page.getByRole("row", { name: /^Launch month/ })).toBeVisible();
});

test("what worked compares offers with enough leads, and the badge shows conversion", async ({ page }) => {
  await signIn(page);
  await preview(page);
  await expect(page.getByText("Audits convert best overall (11.7% from 103 leads).").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Free Marketing Audit" }).first()).toHaveAttribute("href", "/offers/of15");
  await expect(page.getByRole("link", { name: /Free Marketing Audit/ }).getByText("11.7% conv.")).toBeVisible();
});
