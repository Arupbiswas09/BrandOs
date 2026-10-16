import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

test("an offer opens on its assets, with the key links beside them", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);
  await page.goto("/offers/of15");
  await settle(page);

  await expect(page.getByRole("tab", { name: /^Assets/ })).toHaveAttribute("aria-selected", "true");
  const links = page.getByRole("complementary", { name: "Offer summary" });
  await expect(links.getByRole("heading", { name: "Key links" })).toBeInViewport();

  // The landing page comes first, with Open and Copy link right there.
  const open = links.getByRole("link", { name: "Open Free Audit Landing Page" });
  await expect(open).toBeInViewport();
  await expect(open).toHaveAttribute("href", /^https:\/\//);
  await expect(open).toHaveAttribute("target", "_blank");
  await links.getByRole("button", { name: "Copy link to Free Audit Landing Page" }).click();
  await expect(page.getByText("Link copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^https:\/\/.+/);

  // Calls to action are labels with their destination, not buttons.
  await expect(links.getByRole("link", { name: /Book a Free Audit/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Book a Free Audit" })).toHaveCount(0);

  // One way to change the offer in the header; everything else is in its menu.
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adapt for another segment" })).toHaveCount(0);
  await page.getByRole("button", { name: "More offer actions" }).click();
  await expect(page.getByRole("menu", { name: "More offer actions" }).getByRole("menuitem")).toHaveText(["Adapt for another segment", "Move back to draft", "Archive"]);
  await page.keyboard.press("Escape");
  // Approve only appears while something is actually in review.
  await expect(links.getByText("Not reviewed")).toBeVisible();
  await expect(links.getByRole("button", { name: "Approve" })).toHaveCount(0);
});

test("offer tabs: arrow keys, the URL and links to the discussion", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of15");
  await settle(page);
  const assets = page.getByRole("tab", { name: /^Assets/ });
  await assets.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Funnel" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Funnel" })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\?tab=funnel$/);
  await expect(page.getByRole("tabpanel", { name: "Funnel" })).toBeVisible();

  // Opening a box's asset and closing it again keeps the board: the drawer's own section is ?assetTab=.
  await page.getByRole("tabpanel", { name: "Funnel" }).getByRole("button", { name: /^Open Free Audit Landing Page/ }).first().click();
  await expect(page).toHaveURL(/\?tab=funnel&asset=as1$/);
  await expect(page.getByRole("tab", { name: "Funnel" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\?tab=funnel$/);
  await expect(page.getByRole("tab", { name: "Funnel" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: /^Discussion/ }).click();
  await expect(page).toHaveURL(/\?tab=discussion$/);
  await page.reload();
  await settle(page);
  await expect(page.getByRole("tab", { name: /^Discussion/ })).toHaveAttribute("aria-selected", "true");

  // A link can name both: the page's tab and the drawer's section.
  await page.goto("/offers/of1?tab=funnel&asset=as1&assetTab=history");
  await settle(page);
  await expect(page.getByRole("tab", { name: "Funnel" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("dialog").getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/offers\/of1\?tab=funnel$/);
  // On an offer page ?tab=discussion is the page's tab, so an asset opened there starts on its overview.
  await page.goto("/offers/of1?tab=discussion&asset=as1");
  await settle(page);
  await expect(page.getByRole("dialog").getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");

  // Search and the inbox link to "#discussion".
  await page.goto("/offers/of1#discussion");
  await settle(page);
  await expect(page.getByRole("tab", { name: /^Discussion/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByPlaceholder(/Add a note/)).toBeVisible();
});

test("the asset drawer leads with what you came for", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of1?asset=as1");
  await settle(page);
  const drawer = page.getByRole("dialog", { name: "Free Audit Landing Page" });
  await expect(drawer.getByRole("button", { name: "Close" })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Open", exact: true })).toHaveAttribute("href", /^https:\/\//);
  await expect(drawer.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Edit", exact: true })).toBeVisible();

  // The sections are in reach without scrolling. There is no client tab or share link.
  const tabs = drawer.getByRole("tablist", { name: "Asset sections" });
  await expect(tabs).toBeInViewport();
  await expect(drawer.getByRole("tab", { name: "Client" })).toHaveCount(0);
  await expect(drawer.getByText(/Manage client links|Cleared to send|Visible to client/)).toHaveCount(0);
  await expect(drawer.getByText("Approved", { exact: false })).toHaveCount(1);

  await drawer.getByRole("button", { name: "More asset actions" }).click();
  await expect(page.getByRole("menu", { name: "More asset actions" }).getByRole("menuitem")).toHaveText(["Change thumbnail", "Clone", "Link to offers", "Archive", "Delete"]);
  await page.keyboard.press("Escape");

  // A file asset leads with Download instead.
  await page.goto("/offers/of1?asset=as41");
  await settle(page);
  const flow = page.getByRole("dialog", { name: "Audit Request Nurture Flow" });
  await expect(flow.getByRole("link", { name: "Open", exact: true })).toHaveCount(0);
});

test("resolved notes fold away (and an old ?tab= link still opens the drawer's section)", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1/assets?asset=as38&tab=discussion");
  await settle(page);
  const drawer = page.getByRole("dialog");
  const toggle = drawer.getByRole("button", { name: "1 resolved" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(drawer.getByText(/Worth building a real page/)).toHaveCount(0);
  await toggle.click();
  await expect(drawer.getByText(/Worth building a real page/)).toBeVisible();
});

test("on a phone the offer header never cuts its actions off, and the summary folds", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto("/offers/of15");
  await settle(page);
  for (const name of ["Edit", "More offer actions"]) {
    const box = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
    expect(box.x + box.width, `${name} is cut off`).toBeLessThanOrEqual(390);
  }
  await expect(page.getByRole("heading", { name: "Key links" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Positioning" })).toBeHidden();
  await page.getByRole("button", { name: "Show details" }).click();
  await expect(page.getByRole("heading", { name: "Positioning" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
});
