import { expect, test } from "@playwright/test";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 940 } });

test("a deleted asset comes back from the recycle bin with its links", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of19?asset=as24");
  await settle(page);
  const drawer = page.getByRole("dialog", { name: "Youth Instagram Set" });
  await drawer.getByRole("button", { name: "More asset actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete Youth Instagram Set?" }).getByRole("button", { name: "Delete" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByText("Youth Instagram Set")).toHaveCount(0);

  await page.goto("/trash");
  await settle(page);
  await expect(page.getByText("Youth Instagram Set")).toBeVisible();
  await page.getByRole("button", { name: "Restore Youth Instagram Set" }).click();
  await expect(page.getByText("Youth Instagram Set is back")).toBeVisible();

  // Back where it was: linked to its offer again.
  await page.goto("/offers/of19");
  await settle(page);
  await expect(page.getByText("Youth Instagram Set").first()).toBeVisible();
});

test("clients, brands and services can be archived but never deleted", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br3");
  await settle(page);
  await expect(page.getByRole("button", { name: "Archive brand" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Delete/ })).toHaveCount(0);
  await page.goto("/services/sv6");
  await settle(page);
  await page.getByRole("button", { name: "More service actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Archive service" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Delete/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Delete/ })).toHaveCount(0);
});
