import { expect, test, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";

test.use({ viewport: { width: 1440, height: 940 } });

// Global search: one box that finds anything the person can see.

/** "/" focuses the header search box; its results drop down under it. */
async function openSearch(page: Page) {
  const box = page.getByRole("combobox", { name: "Search" });
  // The first keypress can land before hydration finishes; retry until the results open.
  await expect(async () => {
    await page.keyboard.press("/");
    await expect(box).toHaveAttribute("aria-expanded", "true", { timeout: 500 });
  }).toPass({ timeout: 10_000 });
  // The dropdown lives in the header, under the box.
  return { area: page.locator("header"), box, results: page.locator("#search-results") };
}

test("a file name, a tag and two words in different fields", async ({ page }) => {
  await signIn(page);
  const { box, results } = await openSearch(page);

  // A file on an asset, found by its name and shown with the part that matched.
  await box.fill("thursday-a3.pdf");
  const poster = results.getByRole("option", { name: /Thursday Night Poster/ });
  await expect(poster).toBeVisible();
  await expect(poster).toContainText("File:");
  await expect(poster.locator("mark")).toHaveText("thursday-a3.pdf");

  // A tag.
  await box.fill("all-channel");
  await expect(results.getByRole("option", { name: /Free Audit Landing Page/ })).toContainText("Tag: all-channel");

  // Every word has to match, but each may match a different field: the title and a tag.
  await box.fill("audit evergreen");
  const page1 = results.getByRole("option", { name: /Free Audit Landing Page/ });
  await expect(page1).toBeVisible();
  await expect(page1).toContainText("Tag: evergreen");
  await box.fill("audit evergreen nothing-like-this");
  await expect(results).toHaveCount(0);
  await expect(page.locator("header").getByText(/Nothing matches/)).toBeVisible();
});

test("accents and case never matter, and archived things come last, labelled", async ({ page }) => {
  await signIn(page);
  const { box, results } = await openSearch(page);
  await box.fill("LÁNDING pagé");
  await expect(results.getByRole("option", { name: /Free Audit Landing Page/ })).toBeVisible();

  await box.fill("workspace for schools");
  const archived = results.getByRole("option", { name: /Workspace for Schools/ });
  await expect(archived).toBeVisible();
  await expect(archived).toContainText("Archived");
});

test("a discussion note opens the item at its discussion", async ({ page }) => {
  await signIn(page);
  const { box, results } = await openSearch(page);
  await box.fill("lockup old");
  const note = results.getByRole("group", { name: "Notes" }).getByRole("option").first();
  await expect(note).toContainText("LinkedIn Carousel");
  await expect(note).toContainText("old logo lockup");
  await note.click();
  await expect(page).toHaveURL(/asset=as36/);
  await expect(page).toHaveURL(/assetTab=discussion/);
  await expect(page.getByRole("dialog", { name: /LinkedIn Carousel/ }).getByText("Slide four has the old logo lockup")).toBeVisible();
});

test("text inside a funnel box finds its offer", async ({ page }) => {
  await signIn(page);
  // Put a box on an offer's funnel board, as the board itself would.
  const body = await callAction(page, "/offers/of21", "app/funnel-actions.ts", "saveFunnel", [
    "of21",
    { boxes: [{ id: "bx1", kind: "step", x: 40, y: 40, text: "Raffle stall at the spring fete" }], arrows: [] },
  ]);
  expect(body).toContain("\"ok\":true");
  await page.goto("/");
  await settle(page);
  const { box, results } = await openSearch(page);
  await box.fill("fete raffle");
  const offer = results.getByRole("option", { name: /Sponsor A Squad/ });
  await expect(offer).toContainText("Funnel step:");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/offers\/of21$/);
});

test("keyboard: arrows move, Enter opens, and what was opened comes back under Recent", async ({ page }) => {
  await signIn(page);
  let s = await openSearch(page);
  await s.box.fill("christmas");
  const options = s.results.getByRole("option");
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await s.box.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await s.box.press("ArrowUp");
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await s.box.press("Enter");
  await expect(s.box).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(/\/offers\/of17|asset=as19/);
  await settle(page);
  // Visits are recorded as pages open; the list reflects them on the next page load.
  await page.goto("/");
  await settle(page);

  s = await openSearch(page);
  await expect(s.results.getByRole("group", { name: "Recent" }).getByRole("option", { name: /Christmas Appeal/ }).first()).toBeVisible();
  // Esc closes the results and keeps the box; a click anywhere else closes them too.
  await page.keyboard.press("Escape");
  await expect(s.box).toHaveAttribute("aria-expanded", "false");
  await expect(s.results).toHaveCount(0);
  await s.box.click();
  await expect(s.box).toHaveAttribute("aria-expanded", "true");
  await page.mouse.click(1000, 800);
  await expect(s.box).toHaveAttribute("aria-expanded", "false");
});

test("people: emails only for those who manage the team, and a person's own work", async ({ page }) => {
  await signIn(page); // Admin
  let s = await openSearch(page);
  await s.box.fill("joss@quokka");
  await expect(s.results.getByRole("option", { name: /Joss Weekes/ })).toBeVisible();
  await s.box.fill("Joss Weekes");
  await s.results.getByRole("group", { name: "People" }).getByRole("option").first().click();
  await expect(s.area.getByRole("button", { name: /Stop showing only Joss Weekes/ })).toBeVisible();
  await expect(s.results.getByRole("group", { name: "Offers" })).toBeVisible();

  await signIn(page, "Joss Weekes"); // Manager: names only
  s = await openSearch(page);
  await s.box.fill("priya@quokka");
  await expect(s.results).toHaveCount(0);
  await s.box.fill("Priya");
  await expect(s.results.getByRole("group", { name: "People" }).getByRole("option", { name: /Priya Raman/ })).toBeVisible();
});

test("pages and actions are in the same box", async ({ page }) => {
  await signIn(page);
  const { box, results } = await openSearch(page);
  await box.fill("launches");
  await results.getByRole("option", { name: /^Launches/ }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  const again = await openSearch(page);
  await again.box.fill("new offer");
  await again.results.getByRole("option", { name: /New offer/ }).click();
  await expect(page.getByRole("dialog").filter({ hasText: "Offer name" })).toBeVisible();
});

test("inside a brand, results start in that brand, and Tab searches everywhere", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br3");
  await settle(page);
  const s = await openSearch(page);
  await expect(s.area.getByRole("button", { name: "Search everything, not only St Aidan Youth" })).toBeVisible();
  await s.box.fill("thursday");
  await expect(s.results.getByRole("option", { name: /Thursday Night Poster/ })).toBeVisible();
  await s.box.fill("audit");
  await expect(s.area.getByText(/more outside St Aidan Youth/)).toBeVisible();
  // Other tests add "audit" assets, so check with the offer, which has no look-alikes.
  await expect(s.area.getByRole("option", { name: /Free Marketing Audit/ })).toHaveCount(0);
  await s.box.press("Tab");
  await expect(s.area.getByRole("button", { name: /not only St Aidan Youth/ })).toHaveCount(0);
  await expect(s.results.getByRole("option", { name: /^OF Free Marketing Audit/ })).toBeVisible();
  await expect(s.box).toBeFocused();
});

test("copy a link from the results: an offer's page in BrandOS, an asset's own link", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);
  const { box, results } = await openSearch(page);
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

  // ⌘C on the row you are on (nothing selected in the box) copies its link.
  await box.fill("sponsor a squad");
  const offer = results.getByRole("option", { name: /Sponsor A Squad/ }).first();
  await expect(offer).toHaveAttribute("aria-selected", "true");
  await box.press("ControlOrMeta+c");
  await expect(page.getByText("Link copied")).toBeVisible();
  expect(await clipboard()).toMatch(/^https?:\/\/[^/]+\/offers\/of21$/);

  // The link button beside the row does the same; a typed link gets https:// added.
  await box.fill("audit booked thank you");
  const asset = results.getByRole("option", { name: /Audit Booked/ }).first();
  await asset.hover();
  await page.getByTitle("Copy link to Audit Booked — Thank You Page").click();
  await expect.poll(clipboard).toBe("https://quokkaforgood.org/audit/thanks");
  // Copying never opens anything.
  await expect(box).toHaveAttribute("aria-expanded", "true");
});
