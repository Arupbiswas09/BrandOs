import { expect, test } from "@playwright/test";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 940 } });

test("a deleted brand comes back from the recycle bin with everything inside", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br3");
  await settle(page);
  await page.getByRole("button", { name: "Delete brand" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/clients\//);
  await expect(page.getByRole("navigation", { name: "Main" }).getByText("St Aidan Youth")).toHaveCount(0);

  await page.goto("/trash");
  await settle(page);
  await expect(page.getByText("St Aidan Youth")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).first().click();
  await expect(page.getByText("St Aidan Youth is back")).toBeVisible();

  await page.goto("/brands/br3/offers");
  await settle(page);
  await expect(page.getByText("Thursday Night Sign-ups")).toBeVisible();
});
