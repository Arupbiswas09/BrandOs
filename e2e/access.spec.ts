import { expect, test } from "@playwright/test";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 940 } });

test("admins see the role table and who sees each client", async ({ page }) => {
  await signIn(page);
  await page.goto("/team");
  await settle(page);
  await page.getByRole("tab", { name: "Roles and permissions" }).click();
  const table = page.getByRole("table", { name: "What each role can do" });
  await expect(table.getByRole("row", { name: /Manage the team/ })).toBeVisible();
  await expect(table.getByText("Own work")).toBeVisible();
  await page.getByRole("tab", { name: "Who sees what" }).click();
  await expect(page.getByText("Ruth Hale")).toBeVisible();
});

test("a contributor creates work but cannot change other people's", async ({ page }) => {
  await signIn(page, "Leo Park");
  await expect(page.getByText("Contributor — edit your own work").first()).toBeVisible();
  await page.goto("/offers/of1");
  await settle(page);
  await expect(page.getByRole("heading", { name: "Ad Grant for Church Reach" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await page.goto("/brands/br1/kit");
  await settle(page);
  await expect(page.getByRole("button", { name: "Edit kit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New", exact: true })).toBeVisible();
});

test("a client guest sees only shared work and none of the internal pages", async ({ page }) => {
  await signIn(page, "Ruth Hale");
  await expect(page.getByText("Client — shared work only").first()).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByText("St Aidan Parish").first()).toBeVisible();
  await expect(nav.getByText("Global Library")).toHaveCount(0);
  await expect(nav.getByText("Team and access")).toHaveCount(0);
  await page.goto("/team");
  await page.waitForURL("/");
  await page.goto("/brands/br1");
  await settle(page);
  await expect(page.getByText("This brand is not here")).toBeVisible();
});

test("the server refuses what the interface hides", async ({ page }) => {
  await signIn(page, "Marta Vieira");
  // A viewer's session calling the upload API directly is turned away.
  const res = await page.request.post("/api/assets/as1/files", { multipart: { file: { name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("x") } } });
  expect([403, 404]).toContain(res.status());
});
