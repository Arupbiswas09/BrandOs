import { expect, test } from "@playwright/test";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";

test.use({ viewport: { width: 1440, height: 940 } });

test("admins see the role table and who sees each client", async ({ page }) => {
  await signIn(page);
  await page.goto("/team");
  await settle(page);
  await page.getByRole("tab", { name: "Roles and permissions" }).click();
  const table = page.getByRole("table", { name: "What each role can do" });
  await expect(table.getByRole("row", { name: /Manage the team/ })).toBeVisible();
  await expect(table.getByText("Own work")).toBeVisible();
  // BrandOS is internal only: no Client column.
  await expect(table.getByRole("columnheader", { name: "Client" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Who sees what" }).click();
  await expect(page.getByText("Leo Park").first()).toBeVisible();
});

test("a contributor creates work but cannot change other people's", async ({ page }) => {
  await signIn(page, "Leo Park");
  await expect(page.getByText("Contributor: edit your own work").first()).toBeVisible();
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

test("someone with the old Client role cannot sign in, and shows as No access", async ({ page }) => {
  // Not offered on the sign-in page.
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await settle(page);
  await expect(page.getByRole("button", { name: /Priya Raman/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ruth Hale/ })).toHaveCount(0);

  // Asked for directly, the server refuses: no session, and the sign-in page says why in plain words.
  await callAction(page, "/sign-in", "app/actions.ts", "signInAs", ["rh"]);
  expect((await page.context().cookies()).some((c) => c.name === "bos_session")).toBe(false);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/sign-in?error=no-access");
  await expect(page.getByRole("alert").filter({ hasText: "does not have access to BrandOS" })).toBeVisible();

  // Admins see them as "No access", and the Client role is not offered for anyone.
  await signIn(page);
  await page.goto("/team");
  await settle(page);
  const row = page.getByRole("listitem").filter({ hasText: "Ruth Hale" });
  await expect(row.getByText("No access").filter({ visible: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "View as" })).toHaveCount(0);
  await row.getByRole("button", { name: "Access for Ruth Hale" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit access" });
  await expect(dialog.getByText(/had the old Client role and cannot sign in/)).toBeVisible();
  const roles = dialog.getByRole("radiogroup", { name: "Role", exact: true }).getByRole("radio");
  await expect(roles).toHaveCount(6);
  await expect(roles.filter({ hasText: /^Client/ })).toHaveCount(0);
});

test("the server refuses what the interface hides", async ({ page }) => {
  await signIn(page, "Marta Vieira");
  // A viewer's session calling the upload API directly is turned away.
  const res = await page.request.post("/api/assets/as1/files", { multipart: { file: { name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("x") } } });
  expect([403, 404]).toContain(res.status());
});
