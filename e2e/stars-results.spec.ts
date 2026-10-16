import { expect, test, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";

/*
 * Stars and results per offer, where people use them: the star in the offer,
 * brand, service and client headers and in the asset drawer, the S key, the
 * starred lists in the sidebar and on the dashboard, the offer's Results tab,
 * the conversion badge on offer rows and cards, and What worked on a brand's
 * Strategy.
 */

test.use({ viewport: { width: 1440, height: 940 } });

const STARS = "app/star-actions.ts";
const RESULTS = "app/results-actions.ts";

/** An offer page, on its Results tab. */
async function results(page: Page, offer: string) {
  await page.goto(`/offers/${offer}?tab=results`);
  await settle(page);
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await settle(page);
}

/** The sidebar's Starred list. */
const sidebarList = (page: Page) => page.getByRole("navigation", { name: "Main" }).getByRole("group", { name: "Starred" });
/** The dashboard's Starred card. */
const card = (page: Page) => page.locator("#starred");

test("a star on the offer page and in the drawer sticks after a reload", async ({ page }) => {
  await signIn(page);
  // Unstarred to begin with, whatever an earlier run left.
  await callAction(page, "/offers/of1", STARS, "toggleStar", ["offer", "of1", false]);
  await page.goto("/offers/of1");
  await settle(page);
  const NAME = "Ad Grant for Church Reach";
  const star = page.getByRole("button", { name: `Star ${NAME}` });
  const unstar = page.getByRole("button", { name: `Unstar ${NAME}` });
  await expect(star).toHaveAttribute("aria-pressed", "false");
  await star.click();
  await expect(unstar).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await settle(page);
  await expect(unstar).toHaveAttribute("aria-pressed", "true");
  await unstar.click();
  await expect(star).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await settle(page);
  await expect(star).toHaveAttribute("aria-pressed", "false");

  // An asset is starred from its drawer, first in the top bar.
  await page.goto("/offers/of1?asset=as41");
  await settle(page);
  const drawer = page.getByRole("dialog", { name: "Audit Request Nurture Flow" });
  await drawer.getByRole("button", { name: "Star Audit Request Nurture Flow" }).click();
  await expect(drawer.getByRole("button", { name: "Unstar Audit Request Nurture Flow" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await settle(page);
  await drawer.getByRole("button", { name: "Unstar Audit Request Nurture Flow" }).click();
  await expect(drawer.getByRole("button", { name: "Star Audit Request Nurture Flow" })).toHaveAttribute("aria-pressed", "false");
});

test("a star sticks after a reload, shows in the starred lists, and comes off again", async ({ page }) => {
  await signIn(page);
  await callAction(page, "/", STARS, "toggleStar", ["service", "sv1", false]);
  await visit(page, "/services/sv1");
  const NAME = "Google Ad Grant";
  const star = page.getByRole("button", { name: `Star ${NAME}`, exact: true });
  const unstar = page.getByRole("button", { name: `Unstar ${NAME}` });

  await expect(star).toHaveAttribute("aria-pressed", "false");
  await expect(sidebarList(page).getByRole("link", { name: NAME })).toHaveCount(0);
  await star.click();
  await expect(unstar).toHaveAttribute("aria-pressed", "true");
  await expect(sidebarList(page).getByRole("link", { name: NAME })).toBeVisible();
  // On its own page the sidebar row says so.
  await expect(sidebarList(page).getByRole("link", { name: NAME })).toHaveAttribute("aria-current", "page");

  await page.reload();
  await settle(page);
  await expect(unstar).toHaveAttribute("aria-pressed", "true");
  await expect(sidebarList(page).getByRole("link", { name: NAME })).toHaveAttribute("href", "/services/sv1");
  // Assets in the list open the drawer instead of a page.
  await sidebarList(page).getByRole("button", { name: "Free Audit Landing Page" }).click();
  await expect(page).toHaveURL(/asset=as1/);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/asset=/);

  // From 1024px the sidebar holds up to ten stars, so the dashboard card stays out of the way; narrower, it lists them with their context.
  await visit(page, "/");
  await expect(card(page)).toBeHidden();
  await page.setViewportSize({ width: 900, height: 940 });
  await expect(card(page).getByRole("link", { name: new RegExp(NAME) })).toContainText("Service · Quokka For Good");

  // Unstarring from the dashboard card takes it off every list.
  await card(page).getByRole("button", { name: `Unstar ${NAME}` }).click();
  await expect(card(page).getByText(NAME)).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 940 });
  await expect(sidebarList(page).getByRole("link", { name: NAME })).toHaveCount(0);
  await visit(page, "/services/sv1");
  await expect(star).toHaveAttribute("aria-pressed", "false");
});

test("brands, services and clients carry a star for everyone who can see them", async ({ page }) => {
  // Marta is a Viewer and sees Northgate only: she changes nothing, but she can star.
  await signIn(page, "Marta Vieira");
  try {
    for (const [path, name] of [["/clients/cl3", "Northgate Athletics Trust"], ["/brands/br4", "Northgate Athletics"], ["/services/sv7", "Season Membership"]]) {
      await visit(page, path);
      await page.getByRole("button", { name: `Star ${name}`, exact: true }).click();
      await expect(page.getByRole("button", { name: `Unstar ${name}` })).toHaveAttribute("aria-pressed", "true");
      await expect(sidebarList(page).getByRole("link", { name, exact: true })).toHaveAttribute("href", path);
    }
    // The sidebar lists all three, so the dashboard does not list them again.
    await visit(page, "/");
    await expect(sidebarList(page).getByRole("listitem")).toHaveCount(3);
    await expect(card(page)).toBeHidden();
  } finally {
    for (const [kind, id] of [["client", "cl3"], ["brand", "br4"], ["service", "sv7"]]) await callAction(page, "/", STARS, "toggleStar", [kind, id, false]);
  }
  // With nothing starred, the dashboard says what stars are for.
  await visit(page, "/");
  await expect(sidebarList(page)).toHaveCount(0);
  await expect(card(page).getByText("Star the offers and assets you use most to keep them here.")).toBeVisible();
});

test("S stars the page it is on, and not while typing", async ({ page }) => {
  await signIn(page);
  // Start from the seed's stars, whatever an earlier run left.
  await callAction(page, "/", STARS, "toggleStar", ["service", "sv2", false]);
  await callAction(page, "/", STARS, "toggleStar", ["brand", "br1", true]);
  await visit(page, "/services/sv2");
  const NAME = "Website Design";
  // The first press waits until the page is listening (a dev server may still be hydrating it).
  await expect(async () => {
    if (!(await page.getByText(`Starred ${NAME}`, { exact: true }).count())) await page.keyboard.press("s");
    await expect(page.getByText(`Starred ${NAME}`, { exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(sidebarList(page).getByRole("link", { name: NAME })).toBeVisible();
  await expect(page.getByRole("button", { name: `Unstar ${NAME}` })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("s");
  await expect(page.getByText(`Unstarred ${NAME}`)).toBeVisible();
  await expect(sidebarList(page).getByRole("link", { name: NAME })).toHaveCount(0);

  // On a brand (starred in the seed data): an "s" typed into its search is just typing.
  await visit(page, "/brands/br1");
  await page.getByRole("searchbox", { name: "Find a service" }).pressSequentially("ss");
  await expect(page.getByRole("button", { name: "Unstar Quokka For Good" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("searchbox", { name: "Find a service" }).fill("");
  await page.getByRole("heading", { level: 1, name: "Quokka For Good" }).click();
  await page.keyboard.press("s");
  await expect(page.getByText("Unstarred Quokka For Good")).toBeVisible();
  await page.keyboard.press("s");
  await expect(page.getByText("Starred Quokka For Good", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unstar Quokka For Good" })).toHaveAttribute("aria-pressed", "true");
  // Saved, not only shown.
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: "Unstar Quokka For Good" })).toHaveAttribute("aria-pressed", "true", { timeout: 2000 });
  }).toPass({ timeout: 15_000 });

  // The keyboard shortcuts list says so.
  const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(async () => {
    if (!(await help.count())) await page.keyboard.press("?");
    await expect(help).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(help.getByText("Star or unstar this page")).toBeVisible();
});

test("S on an offer page stars the offer; with the drawer open it stars the asset", async ({ page }) => {
  await signIn(page);
  // Unstarred to begin with, whatever an earlier run left.
  await callAction(page, "/offers/of24", STARS, "toggleStar", ["offer", "of24", false]);
  await callAction(page, "/offers/of24", STARS, "toggleStar", ["asset", "as41", false]);
  await results(page, "of24");
  const NAME = "Thirty-Minute Grant Consultation";
  await page.keyboard.press("s");
  await expect(page.getByText(`Starred ${NAME}`)).toBeVisible();
  await expect(page.getByRole("button", { name: `Unstar ${NAME}` })).toHaveAttribute("aria-pressed", "true");
  // Typing an "s" into a field is just typing.
  await page.getByRole("button", { name: "Record the first results" }).click();
  await page.getByLabel("Lesson learned").pressSequentially("ss");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: `Unstar ${NAME}` })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("s");
  await expect(page.getByText(`Unstarred ${NAME}`)).toBeVisible();
  await expect(page.getByRole("button", { name: `Star ${NAME}` })).toHaveAttribute("aria-pressed", "false");

  // With the asset drawer open, S stars the asset in front, not the offer behind it.
  await page.goto("/offers/of1?asset=as41");
  await settle(page);
  const ASSET = "Audit Request Nurture Flow";
  const drawer = page.getByRole("dialog", { name: ASSET });
  await page.keyboard.press("s");
  await expect(page.getByText(`Starred ${ASSET}`, { exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: `Unstar ${ASSET}` })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("s");
  await expect(drawer.getByRole("button", { name: `Star ${ASSET}` })).toHaveAttribute("aria-pressed", "false");
});

test("stars are only for things I can see, and stop at 30", async ({ page }) => {
  // Marta sees Northgate only.
  await signIn(page, "Marta Vieira");
  let body = await callAction(page, "/", STARS, "toggleStar", ["offer", "of1", true]);
  expect(body).toContain("That is not here any more.");
  body = await callAction(page, "/", STARS, "toggleStar", ["offer", "of20", true]);
  expect(body).toContain("\"ok\":true");
  body = await callAction(page, "/", STARS, "toggleStar", ["offer", "of20", false]);
  expect(body).toContain("\"ok\":true");

  // Joss starts with no stars; the 31st is refused with a plain reason.
  await signIn(page, "Joss Weekes");
  const ids = [...Array.from({ length: 30 }, (_, i) => `as${i + 1}`), "as32"];
  try {
    for (const id of ids.slice(0, 30)) {
      body = await callAction(page, "/", STARS, "toggleStar", ["asset", id, true]);
      expect(body, id).toContain("\"ok\":true");
    }
    body = await callAction(page, "/", STARS, "toggleStar", ["asset", ids[30], true]);
    expect(body).toContain("You can star up to 30 things.");
    await visit(page, "/");
    // The sidebar shows the first ten and points at the rest, on the dashboard's card.
    await expect(sidebarList(page).getByRole("listitem")).toHaveCount(10);
    // Archived ones are left out of the lists, so only "more" is certain.
    await page.getByRole("link", { name: /^\d+ more on the dashboard$/ }).click();
    await expect(card(page)).toBeInViewport();
    await expect(card(page).getByRole("button", { name: /^Show all \d+$/ })).toBeVisible();
    // A refused star goes back, and says why.
    await visit(page, "/services/sv1");
    const star = page.getByRole("button", { name: "Star Google Ad Grant", exact: true });
    await star.click();
    await expect(page.getByText("You can star up to 30 things.")).toBeVisible();
    await expect(star).toHaveAttribute("aria-pressed", "false");
  } finally {
    for (const id of ids) await callAction(page, "/", STARS, "toggleStar", ["asset", id, false]);
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
  await results(page, "of24");
  await clearResults(page);
  await expect(page.getByText("After launch, record the leads, calls booked and conversions for each period")).toBeVisible();
  // No periods, no count on the tab.
  await expect(page.getByRole("tab", { name: "Results", exact: true })).toHaveAttribute("aria-selected", "true");

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
  await expect(page.getByRole("tab", { name: /^Results/ })).toContainText("1");

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

  // The offer's row in its brand's list carries the conversion.
  await page.goto("/brands/br1/offers");
  await settle(page);
  await expect(page.getByRole("link", { name: /Thirty-Minute Grant Consultation/ }).getByText("20.0% conv.")).toBeVisible();

  // The server checks too.
  const body = await callAction(page, "/offers/of24", RESULTS, "saveResult", [{ offerId: "of24", period: "Bad", leads: 5, conversions: 9, lesson: "" }]);
  expect(body).toContain("Conversions cannot be more than leads.");

  await results(page, "of24");
  await clearResults(page);
  await expect(page.getByRole("button", { name: "Record the first results" })).toBeVisible();
});

test("a Contributor cannot record or change results on someone else's offer", async ({ page }) => {
  await signIn(page, "Leo Park");
  await results(page, "of15"); // Priya's offer
  await expect(page.getByRole("row", { name: /^Launch month/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Record results|^Record the first results/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Edit results for / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Remove results for / })).toHaveCount(0);

  let body = await callAction(page, "/offers/of15", RESULTS, "saveResult", [{ id: "rs1", offerId: "of15", period: "Changed", leads: 1, lesson: "" }]);
  expect(body).toContain("Contributors can only record results on offers they own.");
  body = await callAction(page, "/offers/of15", RESULTS, "saveResult", [{ offerId: "of15", period: "New", leads: 1, lesson: "" }]);
  expect(body).toContain("Contributors can only record results on offers they own.");
  await results(page, "of15");
  await expect(cells(page, "Launch month").first()).toHaveText("42");
  await expect(page.getByRole("row", { name: /^Changed|^New/ })).toHaveCount(0);
});

test("only admins remove results; everyone else corrects them", async ({ page }) => {
  await signIn(page, "Joss Weekes"); // Manager
  await results(page, "of15");
  await expect(page.getByRole("button", { name: "Edit results for Launch month" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Remove results for / })).toHaveCount(0);
  const body = await callAction(page, "/offers/of15", RESULTS, "removeResult", ["rs1"]);
  expect(body).toContain("Only admins can remove results.");
  await results(page, "of15");
  await expect(page.getByRole("row", { name: /^Launch month/ })).toBeVisible();
});

test("offer rows and cards show the conversion", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1/offers");
  await settle(page);
  await expect(page.getByRole("link", { name: /Free Marketing Audit/ }).getByText("11.7% conv.")).toBeVisible();
  // Screen readers hear the whole sentence.
  await expect(page.getByRole("link", { name: /Free Marketing Audit/ }).getByText("11.7% of 103 leads converted")).toBeAttached();
  await expect(page.getByRole("link", { name: /Ad Grant for Church Reach/ }).getByText("10.7% conv.")).toBeVisible();
  // An offer with no results has no badge.
  await expect(page.getByRole("link", { name: /Ad Grant for School Enrolment/ }).getByText(/conv\./)).toHaveCount(0);
  // The cards say the same.
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Cards" }).click();
  await expect(page.getByRole("link", { name: /Free Marketing Audit/ }).getByText("11.7% conv.")).toBeVisible();
});


test("what worked compares offers with enough leads, on the brand's Strategy", async ({ page }) => {
  await signIn(page);
  await visit(page, "/brands/br1/strategy");
  const box = page.getByRole("heading", { name: "What worked" }).locator("..");
  await expect(box.getByText("Audits convert best overall (11.7% from 103 leads).")).toBeVisible();
  await expect(box.getByRole("link", { name: "Open Free Marketing Audit" })).toHaveAttribute("href", "/offers/of15");
  // Below two comparable offers it says nothing at all (St Aidan has no recorded results).
  await visit(page, "/brands/br2/strategy");
  await expect(page.getByRole("heading", { name: "What worked" })).toHaveCount(0);
});
