import type { Page } from "@playwright/test";

export async function signIn(page: Page, name = "Priya Raman") {
  await page.goto("/sign-in");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.waitForURL("/");
  await page.waitForLoadState("networkidle");
}

/** Waits for the page to settle: network idle plus the entrance animation. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(700);
}

export const PAGES: [string, string][] = [
  ["street", "/"],
  ["library", "/library"],
  ["team", "/team"],
  ["client", "/clients/cl2"],
  ["brand-home", "/brands/br1"],
  ["brand-services", "/brands/br1/services"],
  ["brand-offers", "/brands/br1/offers"],
  ["brand-assets", "/brands/br1/assets"],
  ["brand-kit", "/brands/br1/kit"],
  ["brand-ctas", "/brands/br1/ctas"],
  ["service", "/services/sv1"],
  ["offer", "/offers/of1"],
  ["asset-drawer", "/offers/of1?asset=as1"],
];
