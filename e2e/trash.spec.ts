import { expect, test } from "@playwright/test";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 940 } });

test("a deleted offer comes back from the recycle bin with its assets still linked", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of19");
  await settle(page);
  await page.getByRole("button", { name: "More offer actions" }).click();
  await page.getByRole("menuitem", { name: "Delete offer" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/brands\/br3\/offers$/);
  await expect(page.getByRole("link", { name: /Thursday Night Sign-ups/ })).toHaveCount(0);

  await page.goto("/trash");
  await settle(page);
  await expect(page.getByText("Thursday Night Sign-ups")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).first().click();
  await expect(page.getByText("Thursday Night Sign-ups is back")).toBeVisible();

  await page.goto("/services/sv6");
  await settle(page);
  const funnels = page.getByRole("region", { name: "Funnels" });
  await expect(funnels.getByRole("link", { name: "Thursday Night Sign-ups" })).toBeVisible();
  await expect(page.getByRole("region", { name: "All assets" }).getByText("Thursday Night Poster")).toBeVisible();
});

test("clients, brands and services can be archived but never deleted", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br3");
  await settle(page);
  await expect(page.getByRole("button", { name: "Archive brand" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Delete/ })).toHaveCount(0);
  await page.goto("/services/sv6");
  await settle(page);
  await expect(page.getByRole("button", { name: "Archive service" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Delete/ })).toHaveCount(0);
});
