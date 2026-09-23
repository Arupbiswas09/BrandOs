import { expect, test } from "@playwright/test";
import { PAGES, settle, signIn } from "./helpers";

const SIZES = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop", width: 1440, height: 940 },
];

for (const size of SIZES) {
  test.describe(`${size.name} ${size.width}px`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("every page fits the screen", async ({ page }, info) => {
      test.setTimeout(180_000);
      await signIn(page);
      for (const [name, path] of PAGES) {
        await page.goto(path);
        await settle(page);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${name} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
        await expect(page.locator("header")).toBeVisible();
        await page.screenshot({ path: info.outputPath(`${size.name}-${name}.png`), fullPage: true });
      }
    });

    test("navigation is reachable", async ({ page }) => {
      await signIn(page);
      if (size.width < 1024) {
        await page.getByRole("button", { name: "Open navigation" }).click();
      }
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Global Library" }).click();
      await expect(page).toHaveURL(/\/library$/);
      await expect(page.getByRole("heading", { name: "Global Library" })).toBeVisible();
    });
  });
}
