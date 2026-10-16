import { expect, test } from "@playwright/test";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";

test.use({ viewport: { width: 1440, height: 940 } });

// Checks for the 28 Sep client review.

test("brand sections live in the sidebar, not in a second row of tabs", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1");
  await settle(page);
  await expect(page.getByRole("heading", { name: "Quokka For Good", level: 1 })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  const sections = page.getByRole("group", { name: "Quokka For Good sections" });
  await expect(sections.getByRole("link", { name: "CTAs" })).toHaveCount(0);
  await sections.getByRole("link", { name: "Offers" }).click();
  await expect(page).toHaveURL(/\/brands\/br1\/offers$/);
  // Inside a section there is no second brand header (the breadcrumb says where you are), and no borrowed actions.
  await expect(page.getByRole("heading", { name: "Quokka For Good", level: 1 })).toHaveCount(0);
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

test("only admins archive clients, nobody deletes them, and only admins see the team", async ({ page }) => {
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
  await expect(page.getByRole("menuitem", { name: /Delete/ })).toHaveCount(0);
});

test("nobody can delete a client, brand, sub-brand, service or offer, not even an admin", async ({ page }) => {
  await signIn(page); // Admin
  // Not offered anywhere.
  for (const [path, more] of [["/clients/cl2", "More client actions"], ["/brands/br3", null], ["/services/sv1", null], ["/offers/of19", "More offer actions"]] as const) {
    await page.goto(path);
    await settle(page);
    if (more && (await page.getByRole("button", { name: more }).count())) await page.getByRole("button", { name: more }).click();
    await expect(page.getByRole("button", { name: /^Delete (client|brand|service|offer)/ })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /^Delete (client|brand|service|offer)/ })).toHaveCount(0);
  }
  // And refused by the server when asked directly.
  for (const [kind, id] of [["brand", "br3"], ["offer", "of19"], ["client", "cl2"], ["service", "sv1"]]) {
    const body = await callAction(page, "/", "app/actions.ts", "deleteItem", [kind, id]);
    expect(body).toContain("Clients, brands, services and offers are never deleted. Archive it instead");
  }
  await page.goto("/brands/br3/offers");
  await settle(page);
  await expect(page.getByText("Thursday Night Sign-ups")).toBeVisible();
});

test("the client page shows the primary contact, and activity keeps the change visible", async ({ page }) => {
  await signIn(page);
  await page.goto("/clients/cl1");
  await settle(page);
  await expect(page.getByText("Primary contact")).toBeVisible();
  await expect(page.getByText(/^Updated · client since /)).toBeVisible();
});

test("share with the client is gone; the kit exports as a PDF", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1");
  await settle(page);
  await expect(page.getByText(/Share with the client/)).toHaveCount(0);
  // The export lives in the Brand Kit; the brand home keeps to its services.
  await page.goto("/brands/br1/kit");
  await settle(page);
  await expect(page.getByText(/Share with the client/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Export brand kit" })).toHaveAttribute("href", "/guidelines/br1");
});
