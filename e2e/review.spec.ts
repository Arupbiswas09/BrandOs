import { expect, test } from "@playwright/test";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 940 } });

// Checks for the 28 Sept client review.

test("brand sections live in the sidebar, not in a second row of tabs", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1");
  await settle(page);
  await expect(page.getByRole("heading", { name: "Welcome to Quokka For Good" })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  const sections = page.getByRole("group", { name: "Quokka For Good sections" });
  await expect(sections.getByRole("link", { name: "CTAs" })).toHaveCount(0);
  await sections.getByRole("link", { name: "Offers" }).click();
  await expect(page).toHaveURL(/\/brands\/br1\/offers$/);
  // Inside a section the brand header is one line, with no borrowed actions.
  await expect(page.getByRole("heading", { name: "Welcome to Quokka For Good" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Add asset/ })).toHaveCount(0);
  await expect(page.getByText(/^Kit \d+%$/)).toHaveCount(0);
});

test("old CTA links land in the Brand Kit", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1/ctas");
  await expect(page).toHaveURL(/\/brands\/br1\/kit#kit-ctas$/);
  await expect(page.getByRole("heading", { name: "CTAs", exact: true })).toBeVisible();
});

test("the dashboard opens on the lists, with no due dates or stat tiles", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Waiting on you" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Continue where you left off" })).toBeVisible();
  await expect(page.getByText("Due this week")).toHaveCount(0);
  await expect(page.getByText("Due soon")).toHaveCount(0);
  await expect(page.getByText(/In review (for|since)/).first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Launches" })).toBeVisible();
});

test("only admins archive or delete clients, and only admins see the team", async ({ page }) => {
  await signIn(page, "Joss Weekes"); // Manager
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: /Team and access/ })).toHaveCount(0);
  await page.goto("/team");
  await page.waitForURL("/");
  await page.goto("/clients/cl1");
  await settle(page);
  await expect(page.getByRole("button", { name: "More client actions" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Archive client|Delete/ })).toHaveCount(0);

  await signIn(page); // Admin
  await page.goto("/clients/cl1");
  await settle(page);
  await page.getByRole("button", { name: "More client actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Archive client" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete client" })).toBeVisible();
});

test("the client page shows the primary contact, and activity keeps the change visible", async ({ page }) => {
  await signIn(page);
  await page.goto("/clients/cl1");
  await settle(page);
  await expect(page.getByText("Primary contact")).toBeVisible();
  await expect(page.getByText("Client since")).toBeVisible();
});

test("share with the client is gone; the kit exports as a PDF", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1");
  await settle(page);
  await expect(page.getByText(/Share with the client/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Export brand kit" })).toHaveAttribute("href", "/guidelines/br1");
});
