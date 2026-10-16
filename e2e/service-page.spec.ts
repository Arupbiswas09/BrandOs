import { expect, test, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 940 } });

// Checks for the 16 Oct client review: brand home, the services tab and the service page.

/** A 1×1 PNG, so the tests need no fixture files. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const ADS = "Google Search Ads — Grant Intent"; // as3, linked to offers of Google Ad Grant (sv1)

const tile = (page: Page, label: string) => page.getByRole("button", { name: new RegExp(`^\\d+\\s*${label}$`) });

test("the count tiles take you to their section", async ({ page }) => {
  await signIn(page);
  await page.goto("/services/sv1");
  await settle(page);
  await expect(page.getByText(/^SERVICE · Quokka For Good$/i)).toBeVisible();
  await expect(page.getByText(/^\d+ assets? linked across \d+ offers?$/)).toBeVisible();
  // The old "needs attention" list is gone; every asset is listed instead.
  await expect(page.getByRole("heading", { name: "Needs attention" })).toHaveCount(0);

  await tile(page, "Landing pages").click();
  await expect(page.getByRole("heading", { name: "All assets" })).toBeFocused();
  await expect(page.getByRole("button", { name: /^Landing pages\s*\d/ })).toHaveAttribute("aria-pressed", "true");
  const assets = page.getByRole("region", { name: "All assets" });
  await expect(assets.getByRole("button", { name: /Free Audit Landing Page/ })).toBeVisible();
  await expect(assets.getByRole("button", { name: new RegExp(ADS) })).toHaveCount(0);

  await tile(page, "Automations").click();
  await expect(page.getByRole("button", { name: /^Automations\s*\d/ })).toHaveAttribute("aria-pressed", "true");
  await expect(assets.getByRole("button", { name: /Audit Request Nurture Flow/ })).toBeVisible();

  await tile(page, "Funnels").click();
  await expect(page.getByRole("heading", { name: "Funnels" })).toBeFocused();
  const funnels = page.getByRole("region", { name: "Funnels" });
  await expect(funnels.getByText("No entry point")).toBeVisible();
  await expect(funnels.getByText("These offers have no landing page or lead magnet linked.")).toBeVisible();

  await tile(page, "Offers").click();
  await expect(page.getByRole("heading", { name: "Offers", exact: true })).toBeFocused();
  await expect(page.getByRole("region", { name: "Offers" }).getByRole("heading", { name: /^Church\W*2 offers$/ })).toBeVisible();

  // A funnel's offer goes to the offer; a row in the asset list opens the asset.
  await assets.getByRole("button", { name: /^All\s*\d/ }).click();
  await assets.getByRole("button", { name: new RegExp(ADS) }).click();
  await expect(page.getByRole("dialog", { name: ADS })).toBeVisible();
});

test("every asset row downloads its files or opens its link", async ({ page }) => {
  await signIn(page);
  const up = await page.request.post("/api/assets/as3/files", { multipart: { file: { name: "service-row.png", mimeType: "image/png", buffer: PNG } } });
  expect(up.status()).toBe(200);
  await page.goto("/services/sv1");
  await settle(page);
  const assets = page.getByRole("region", { name: "All assets" });

  // One file downloads directly; several come as one zip.
  const download = assets.getByRole("link", { name: new RegExp(`^Download (all of )?${ADS}$`) });
  await expect(download).toHaveAttribute("href", /\/api\/(assets\/as3\/download|files\/)/);
  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  expect(file.suggestedFilename()).toMatch(/\.(zip|png)$/);
  await expect(page.getByRole("dialog", { name: ADS })).toHaveCount(0);

  // A Drive link opens the link in a new tab instead.
  const drive = assets.getByRole("link", { name: "Open link to Grant Application Source Files" });
  await expect(drive).toHaveAttribute("href", /^https:\/\//);
  await expect(drive).toHaveAttribute("target", "_blank");

  // Nothing uploaded and no link: a quiet note, not a dead button.
  await expect(assets.getByText("No files yet").first()).toBeVisible();
});

test("the brand home leads with its services", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1");
  await settle(page);
  await expect(page.getByRole("heading", { name: "Quokka For Good", level: 1 })).toBeVisible();
  const services = page.getByRole("region", { name: "Services" });
  await expect(services.getByRole("link", { name: /^Google Ad Grant/ })).toBeVisible();
  await expect(services.getByRole("link", { name: /^Standalone offers/ })).toBeVisible();
  await expect(page.getByText("MAG lead magnets")).toBeVisible();
  await expect(page.getByText("Everything in this brand")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Delete/ })).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Find a service" }).fill("website");
  await expect(services.getByRole("link")).toHaveCount(1);
  await expect(services.getByRole("link", { name: /^Website Design/ })).toBeVisible();
  await page.getByRole("searchbox", { name: "Find a service" }).fill("");

  await page.getByRole("group", { name: "Show services" }).getByRole("button", { name: /^Needs attention · \d+$/ }).click();
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
