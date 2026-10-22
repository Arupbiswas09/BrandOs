import { expect, test, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";

test.use({ viewport: { width: 1440, height: 940 } });

/*
 * Who owns an offer or a CTA, and what that lets them do. Weekly Giving (of18)
 * is St Aidan Parish work, owned by Dana: Leo (Contributor) can see it,
 * Ines (Editor) only sees Quokka For Good, Marta (Viewer) only Northgate.
 */

const summary = (page: Page) => page.getByRole("complementary", { name: "Offer summary" });

test("an offer's owner changes from its Workflow box, and the right to edit moves with it", async ({ page }) => {
  // Before: Leo can see the offer but cannot change it or who owns it.
  await signIn(page, "Leo Park");
  await page.goto("/offers/of18");
  await settle(page);
  await expect(summary(page).getByText("Dana Okafor")).toBeVisible();
  await expect(summary(page).getByRole("combobox", { name: "Owner" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);

  // Priya picks from the people who could own work here: no reviewer or viewer, nobody who cannot see St Aidan.
  await signIn(page);
  await page.goto("/offers/of18");
  await settle(page);
  const owner = summary(page).getByRole("combobox", { name: "Owner" });
  await expect(owner).toHaveValue("do");
  await expect(owner.locator("option")).toHaveText(["Dana Okafor", "Joss Weekes", "Leo Park", "Priya Raman"]);
  await owner.selectOption({ label: "Leo Park" });
  await expect(page.getByRole("status").filter({ hasText: "Leo Park owns this offer now" })).toBeVisible();
  await expect(owner).toHaveValue("lp");

  // It is in the history like any other change.
  await page.goto("/");
  await settle(page);
  await expect(page.getByText("Changed owner: Dana Okafor → Leo Park")).toBeVisible();

  // Now Leo owns it, so Leo can edit it.
  await signIn(page, "Leo Park");
  await page.goto("/offers/of18");
  await settle(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit offer" });
  await dialog.getByLabel(/What is it, in one sentence/).fill("A standing order is a decision made once.");
  await dialog.getByRole("button", { name: "Save offer" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(summary(page).getByText("A standing order is a decision made once.")).toBeVisible();

  // And Leo can hand it back. Then it is Dana's again, and Leo cannot change it.
  await summary(page).getByRole("combobox", { name: "Owner" }).selectOption({ label: "Dana Okafor" });
  await expect(page.getByRole("status").filter({ hasText: "Dana Okafor owns this offer now" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(summary(page).getByRole("combobox", { name: "Owner" })).toHaveCount(0);
});

test("a viewer cannot change an owner, and the server refuses owners who could not own the work", async ({ page }) => {
  // Marta sees Northgate's Spring Intake, read only.
  await signIn(page, "Marta Vieira");
  await page.goto("/offers/of20");
  await settle(page);
  await expect(summary(page).getByText("Owner", { exact: true })).toBeVisible();
  await expect(summary(page).getByRole("combobox", { name: "Owner" })).toHaveCount(0);
  expect(await callAction(page, "/offers/of20", "app/actions.ts", "setOfferOwner", ["of20", "mv"])).toContain("Your role does not allow that");

  await signIn(page);
  // Ines is an editor, but she cannot see St Aidan Parish.
  expect(await callAction(page, "/offers/of18", "app/actions.ts", "setOfferOwner", ["of18", "ib"])).toContain("Only people who create work and can see this brand can own it.");
  // Tom reviews; his role does not create work.
  expect(await callAction(page, "/offers/of18", "app/actions.ts", "setOfferOwner", ["of18", "ta"])).toContain("Only people who create work and can see this brand can own it.");
  // The full save checks the same rule.
  const viaSave = await callAction(page, "/offers/of18", "app/actions.ts", "saveOffer", [{ id: "of18", brandId: "br2", name: "Weekly Giving", ownerId: "ib" }]);
  expect(viaSave).toContain("Only people who create work and can see this brand can own it.");

  // Nothing changed.
  await page.goto("/offers/of18");
  await settle(page);
  await expect(page.getByRole("heading", { name: "Weekly Giving" })).toBeVisible();
  await expect(summary(page).getByRole("combobox", { name: "Owner" })).toHaveValue("do");
});

test("a contributor edits and deletes the CTAs they made, never anyone else's", async ({ page }) => {
  // Ines (Editor) makes a CTA of her own.
  await signIn(page, "Ines Batz");
  const made = await callAction(page, "/brands/br1/kit", "app/actions.ts", "saveCta", [{ brandId: "br1", text: "Ines Owns This", url: "quokkaforgood.org/ines" }]);
  const inesCta = /"id":"(ct[0-9a-f]+)"/.exec(made)?.[1];
  expect(inesCta).toBeTruthy();

  await signIn(page, "Leo Park");
  await page.goto("/brands/br1/kit#kit-ctas");
  await settle(page);
  await page.getByRole("button", { name: "+ New CTA" }).click();
  const create = page.getByRole("dialog", { name: "New CTA" });
  await create.getByLabel("Button text").fill("Leo Owns This");
  await create.getByRole("button", { name: "Save CTA" }).click();
  await expect(create).toHaveCount(0);

  const card = (text: string) => page.getByRole("main").locator(".grid > div").filter({ hasText: text });
  await expect(card("Leo Owns This").getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(card("Leo Owns This").getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  // Ines's, and the older CTAs that have no owner, are not Leo's to change.
  for (const other of ["Ines Owns This", "Book a Free Audit"]) {
    await expect(card(other)).toBeVisible();
    await expect(card(other).getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(card(other).getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  }

  // Leo edits his own.
  await card("Leo Owns This").getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit CTA" });
  await expect(edit.getByText("Made by Leo Park")).toBeVisible();
  await edit.getByLabel("Button text").fill("Leo Changed This");
  await edit.getByRole("button", { name: "Save CTA" }).click();
  await expect(edit).toHaveCount(0);
  await expect(card("Leo Changed This")).toBeVisible();

  // Asked directly, the server still refuses Ines's CTA and the unowned ones.
  expect(await callAction(page, "/brands/br1/kit", "app/actions.ts", "saveCta", [{ id: inesCta, brandId: "br1", text: "Taken over" }])).toContain("Contributors can only change work they own");
  expect(await callAction(page, "/brands/br1/kit", "app/actions.ts", "saveCta", [{ id: "ct1", brandId: "br1", text: "Taken over" }])).toContain("Contributors can only change work they own");
  expect(await callAction(page, "/brands/br1/kit", "app/actions.ts", "deleteItem", ["cta", inesCta])).toContain("Only admins and the person who made a CTA can delete it.");
  expect(await callAction(page, "/brands/br1/kit", "app/actions.ts", "deleteItem", ["cta", "ct1"])).toContain("Only admins and the person who made a CTA can delete it.");

  // Leo deletes his own. It goes to the recycle bin, like every CTA.
  await page.goto("/brands/br1/kit#kit-ctas");
  await settle(page);
  await expect(card("Ines Owns This")).toBeVisible();
  await card("Leo Changed This").getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog", { name: "Delete Leo Changed This?" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Deleted Leo Changed This. An admin can restore it from the Recycle bin for 30 days." })).toBeVisible();
  await expect(card("Leo Changed This")).toHaveCount(0);

  // Restored from the bin, it is still Leo's.
  await signIn(page);
  await page.goto("/trash");
  await settle(page);
  await page.getByRole("button", { name: "Restore Leo Changed This" }).click();
  await expect(page.getByText("Leo Changed This is back")).toBeVisible();
  await signIn(page, "Leo Park");
  await page.goto("/brands/br1/kit#kit-ctas");
  await settle(page);
  await expect(card("Leo Changed This").getByRole("button", { name: "Edit", exact: true })).toBeVisible();

  // Ines deletes hers: whoever made a CTA can delete it, editors too.
  await signIn(page, "Ines Batz");
  await page.goto("/brands/br1/kit#kit-ctas");
  await settle(page);
  await expect(card("Ines Owns This").getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await expect(card("Leo Changed This").getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(card("Leo Changed This").getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await card("Ines Owns This").getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog", { name: "Delete Ines Owns This?" }).getByRole("button", { name: "Delete" }).click();
  await expect(card("Ines Owns This")).toHaveCount(0);
});

test("workspace settings changes show only to people who manage the team", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings?section=uploads");
  await settle(page);
  // Change the upload limits and put them straight back.
  for (let i = 0; i < 2; i++) {
    await page.getByRole("switch", { name: "Allow video" }).click();
    await page.getByRole("button", { name: "Save limits" }).click();
    await expect(page.getByText("Upload limits saved").first()).toBeVisible();
  }
  await page.goto("/");
  await settle(page);
  await expect(page.getByText(/^Changed upload limits/).first()).toBeVisible();

  // Nobody else is sent it, not even hidden in the page: a viewer, a manager and a contributor.
  for (const who of ["Marta Vieira", "Joss Weekes", "Leo Park"]) {
    await signIn(page, who);
    await page.goto("/");
    await settle(page);
    await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();
    await expect(page.getByText(/upload limits/i)).toHaveCount(0);
    expect(await page.content()).not.toContain("changed upload limits");
  }
});
