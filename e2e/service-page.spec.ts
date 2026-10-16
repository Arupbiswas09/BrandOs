import { expect, test } from "@playwright/test";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 940 } });

// Checks for the 16 Oct client review (brand home, services tab, service page) and the 17 Oct reorganisation.

/** A 1×1 PNG, so the tests need no fixture files. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const ADS = "Google Search Ads — Grant Intent"; // as3, linked to offers of Google Ad Grant (sv1)

test("the five counts are the service page's tabs, and the choice stays in the address", async ({ page }) => {
  await signIn(page);
  await page.goto("/services/sv1");
  await settle(page);
  await expect(page.getByText(/^SERVICE · Quokka For Good$/i)).toBeVisible();
  await expect(page.getByText(/^Updated .+ by \w+$/)).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "What this service holds" });
  const tab = (label: string) => tabs.getByRole("tab", { name: new RegExp(`^\\d+\\s*${label}$`) });
  await expect(tabs.getByRole("tab")).toHaveCount(6);
  await expect(tab("Offers")).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel");

  // Offers by segment, as cards.
  await expect(panel.getByRole("heading", { name: /^Church\W*\d+ offers$/ })).toBeVisible();
  await expect(panel.getByRole("link", { name: /Ad Grant for Church Reach/ })).toBeVisible();

  await tab("Landing pages").click();
  await expect(page).toHaveURL(/\?tab=landing-pages$/);
  await expect(panel.getByRole("button", { name: /^Free Audit Landing Page/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: new RegExp(`^${ADS}`) })).toHaveCount(0);

  // Arrow keys move between the tabs.
  await page.keyboard.press("ArrowRight");
  await expect(tab("Funnels")).toBeFocused();
  await expect(tab("Funnels")).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByText("No entry point", { exact: true })).toBeVisible();
  await expect(panel.getByText("These offers have no landing page or lead magnet linked.")).toBeVisible();

  await tab("Automations").click();
  await expect(panel.getByRole("button", { name: /^Audit Request Nurture Flow/ })).toBeVisible();

  // A reload keeps the tab; a row in the asset list opens the asset, and closing it keeps the tab.
  await tab("All assets").click();
  await page.reload();
  await settle(page);
  await expect(tab("All assets")).toHaveAttribute("aria-selected", "true");
  await panel.getByRole("button", { name: new RegExp(`^${ADS}`) }).click();
  const drawer = page.getByRole("dialog", { name: ADS });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(/\?tab=assets$/);
  await expect(tab("All assets")).toHaveAttribute("aria-selected", "true");
});

test("the service's offers are cards by segment, with rows one click away and the choice remembered", async ({ page }) => {
  await signIn(page);
  await page.goto("/services/sv1");
  await settle(page);
  const panel = page.getByRole("tabpanel");
  const view = panel.getByRole("group", { name: "View" });
  await expect(view.getByRole("button", { name: "Cards" })).toHaveAttribute("aria-pressed", "true");
  // Each segment is a heading with its count, over a list of cards.
  // (The import test may have added one to Church, so the count is read from the heading.)
  const heading = panel.getByRole("heading", { name: /^Church\W*\d+ offers$/ });
  const n = Number((await heading.textContent())!.match(/(\d+) offers/)![1]);
  const church = panel.getByRole("list", { name: /^Church\W*\d+ offers$/ });
  await expect(church.getByRole("listitem")).toHaveCount(n);
  const card = church.getByRole("link", { name: /Ad Grant for Church Reach/ });
  await expect(card).toContainText("Every week somebody in your parish searches");
  await expect(card).toContainText(/Active\W*\d+ assets?/);
  await expect(card).toHaveAttribute("href", "/offers/of1");
  // At 1440×900 the first cards are on screen without scrolling.
  await page.setViewportSize({ width: 1440, height: 900 });
  const onScreen = await panel.getByRole("listitem").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().bottom <= window.innerHeight).length);
  expect(onScreen).toBeGreaterThanOrEqual(4);

  await view.getByRole("button", { name: "List" }).click();
  await expect(panel.getByRole("region", { name: /^Church/ })).toBeVisible();
  await expect(panel.getByRole("region", { name: /^Church/ }).getByRole("link", { name: /Ad Grant for Church Reach/ })).toBeVisible();
  await page.reload();
  await settle(page);
  await expect(page.getByRole("tabpanel").getByRole("group", { name: "View" }).getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tabpanel").getByRole("group", { name: "View" }).getByRole("button", { name: "Cards" }).click();
});

test("the right-hand column says what the service is and what needs someone", async ({ page }) => {
  await signIn(page);
  await page.goto("/services/sv1");
  await settle(page);
  const about = page.getByRole("complementary", { name: "About this service" });
  await expect(about.getByRole("heading", { name: "About" })).toBeVisible();
  await expect(about.getByText(/Account rebuild and ongoing management/)).toBeVisible();
  await expect(about.getByRole("heading", { name: /^Needs attention · \d+$/ })).toBeVisible();
  await expect(about.getByText("No entry point").first()).toBeVisible();
  await about.getByRole("link", { name: "Ad Grant for School Enrolment" }).click();
  await expect(page).toHaveURL(/\/offers\/of2$/);

  // Below 1280px it folds into a Details disclosure above the tabs.
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/services/sv1");
  await settle(page);
  const details = page.getByRole("button", { name: /^Details/ });
  await expect(details).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText(/Account rebuild and ongoing management/)).toBeHidden();
  await details.click();
  await expect(page.getByText(/Account rebuild and ongoing management/)).toBeVisible();
});

test("archiving a service sits in the … menu, never Delete", async ({ page }) => {
  await signIn(page);
  await page.goto("/services/sv1");
  await settle(page);
  await expect(page.getByRole("button", { name: "Archive service" })).toHaveCount(0);
  await page.getByRole("button", { name: "More service actions" }).click();
  const menu = page.getByRole("menu", { name: "More service actions" });
  await expect(menu.getByRole("menuitem", { name: "Archive service" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Delete/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("every asset row downloads its files or opens its link", async ({ page }) => {
  await signIn(page);
  const up = await page.request.post("/api/assets/as3/files", { multipart: { file: { name: "service-row.png", mimeType: "image/png", buffer: PNG } } });
  expect(up.status()).toBe(200);
  await page.goto("/services/sv1?tab=assets");
  await settle(page);
  const assets = page.getByRole("tabpanel");

  // One file downloads directly; several come as one zip.
  const download = assets.getByRole("link", { name: new RegExp(`^Download (all of )?${ADS}$`) });
  await expect(download).toHaveAttribute("href", /\/api\/(assets\/as3\/download|files\/)/);
  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  expect(file.suggestedFilename()).toMatch(/\.(zip|png)$/);
  await expect(page.getByRole("dialog", { name: ADS })).toHaveCount(0);

  // A Drive link opens the link in a new tab instead, and its link can be copied.
  const drive = assets.getByRole("link", { name: "Open link to Grant Application Source Files" });
  await expect(drive).toHaveAttribute("href", /^https:\/\//);
  await expect(drive).toHaveAttribute("target", "_blank");
  await expect(assets.getByRole("button", { name: "Copy link to Grant Application Source Files" })).toBeVisible();

  // Nothing uploaded and no link: a quiet note, not a dead button.
  await expect(assets.getByText("No files yet").first()).toBeVisible();
});

test("the brand home leads with its services, codes explained above them", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1");
  await settle(page);
  await expect(page.getByRole("heading", { name: "Quokka For Good", level: 1 })).toBeVisible();
  const services = page.getByRole("region", { name: "Services" });
  await expect(services.getByRole("link", { name: /^Google Ad Grant/ })).toBeVisible();
  await expect(services.getByRole("link", { name: /^Standalone offers/ })).toBeVisible();
  await expect(page.getByText("MAG lead magnets")).toBeVisible();
  // The legend comes before the cards, and every count says its words.
  const legend = await page.getByText("MAG lead magnets").boundingBox();
  const card = await services.getByRole("link", { name: /^Google Ad Grant/ }).boundingBox();
  expect(legend!.y).toBeLessThan(card!.y);
  await expect(services.getByRole("link", { name: /^Google Ad Grant/ })).toContainText(/\d+ offers/);
  await expect(page.getByText("Everything in this brand")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Delete/ })).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Find a service" }).fill("website");
  await expect(services.getByRole("link")).toHaveCount(1);
  await expect(services.getByRole("link", { name: /^Website Design/ })).toBeVisible();
  await page.getByRole("searchbox", { name: "Find a service" }).fill("");

  // The switch counts the same things the cards count.
  const attention = page.getByRole("group", { name: "Show services" }).getByRole("button", { name: /^Needs attention · \d+$/ });
  const total = Number((await attention.textContent())!.match(/(\d+)$/)![1]);
  const each = await services.getByText(/^\d+ things? needs? attention/).allTextContents();
  expect(each.reduce((n, t) => n + Number(t.match(/^(\d+)/)![1]), 0)).toBe(total);
  await attention.click();
  await expect(services.getByRole("link").first()).toContainText(/needs? attention/);

  await services.getByRole("link", { name: /^Google Ad Grant/ }).click();
  await expect(page).toHaveURL(/\/services\/sv1$/);
});

test("the services tab has no coverage grid and no asset squares", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1/services");
  await settle(page);
  await expect(page.getByRole("heading", { name: "Coverage" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "No offer here yet" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Google Ad Grant/ })).toContainText(/\d+ offers/);
  // Offer types stay editable from the Strategy tab.
  await page.goto("/brands/br1/strategy");
  await settle(page);
  await expect(page.getByRole("button", { name: "+ New type" })).toBeVisible();
});

test("the brand's offers are rows grouped by service, with a Cards view that is remembered", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1/offers");
  await settle(page);
  const group = page.getByRole("region", { name: /^Google Ad Grant/ });
  await expect(group.getByRole("link", { name: /Ad Grant for Church Reach/ })).toBeVisible();
  await expect(page.getByRole("region", { name: /^Standalone/ })).toBeVisible();

  // Groups fold away and come back.
  const fold = group.getByRole("button", { name: /^Google Ad Grant/ });
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(group.getByRole("link", { name: /Ad Grant for Church Reach/ })).toBeHidden();
  await fold.click();
  await expect(group.getByRole("link", { name: /Ad Grant for Church Reach/ })).toBeVisible();

  const view = page.getByRole("group", { name: "View" });
  await expect(view.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
  await view.getByRole("button", { name: "Cards" }).click();
  await page.reload();
  await settle(page);
  await expect(page.getByRole("group", { name: "View" }).getByRole("button", { name: "Cards" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "List" }).click();
});

test("brand assets: a list by default, a grid with no empty picture frames, and a Not linked filter", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1/assets");
  await settle(page);
  await expect(page.getByText(/not linked to any offer/)).toHaveCount(0);
  const list = page.getByRole("list", { name: "Assets" });
  await expect(list.getByRole("button", { name: /^Free Audit Landing Page/ })).toBeVisible();
  // Not linked is a filter beside the others, shown while anything is unlinked (other tests may have linked the seeded one).
  const notLinked = page.getByRole("button", { name: /^Not linked \(\d+\)$/ });
  if (await notLinked.count()) {
    const n = Number((await notLinked.textContent())!.match(/\((\d+)\)/)![1]);
    await notLinked.click();
    await expect(notLinked).toHaveAttribute("aria-pressed", "true");
    await expect(list.getByRole("listitem")).toHaveCount(n);
    await notLinked.click();
  }

  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Grid" }).click();
  await expect(page.getByRole("list", { name: "Assets" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Landing page Free Audit Landing Page/ })).toBeVisible();
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "List" }).click();
});
