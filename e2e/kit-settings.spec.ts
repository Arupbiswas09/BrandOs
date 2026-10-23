import { expect, test } from "@playwright/test";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

// One section at a time, with the section in the address, so nothing needs a long scroll.

test("the Brand Kit shows one section at a time and keeps it in the address", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1/kit");
  await settle(page);
  await expect(page.getByRole("heading", { name: "Quokka For Good", level: 1 })).toBeVisible();
  await expect(page.getByText("Brand kit · v2026.1")).toBeVisible();
  const sections = page.getByRole("tablist", { name: "Brand kit sections" });
  // No guidelines to read in the demo, so the kit opens on the logo.
  await expect(sections.getByRole("tab", { name: "Logo" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Colour", level: 2 })).toHaveCount(0);

  await sections.getByRole("tab", { name: "Colour" }).click();
  await expect(page).toHaveURL(/\/brands\/br1\/kit#kit-colour$/);
  await expect(page.getByRole("heading", { name: "Colour", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Logo", level: 2 })).toHaveCount(0);
  // Print values and the contrast matrix wait behind a click.
  await expect(page.getByText("Print values").first()).toBeVisible();
  await expect(page.getByRole("table", { name: /Contrast/ })).toBeHidden();
  await page.getByText("Check contrast pairings").click();
  await expect(page.getByRole("table", { name: /Contrast/ })).toBeVisible();

  // Arrow keys move between sections, and a reload stays put.
  await sections.getByRole("tab", { name: "Colour" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/#kit-type$/);
  await expect(sections.getByRole("tab", { name: "Typography" })).toBeFocused();
  await page.reload();
  await settle(page);
  await expect(sections.getByRole("tab", { name: "Typography" })).toHaveAttribute("aria-selected", "true");

  // "Edit kit" opens the editor on the section you are reading.
  await sections.getByRole("tab", { name: "Brand tone" }).click();
  await page.getByRole("button", { name: "Edit kit" }).click();
  await expect(page.getByRole("dialog").getByRole("tab", { name: "Brand tone" })).toHaveAttribute("aria-selected", "true");
});

test("a complete kit says nothing about completeness; an incomplete one says what is missing in one line", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1/kit");
  await settle(page);
  await expect(page.getByText(/Kit completeness|sections? missing/)).toHaveCount(0);
  await page.goto("/brands/br3/kit");
  await settle(page);
  await expect(page.getByText(/^\d+ sections? missing: /)).toBeVisible();
});

test("Settings opens one section at a time, with plain copy", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  await settle(page);
  const nav = page.getByRole("tablist", { name: "Settings sections" });
  await expect(nav.getByRole("tab", { name: "Profile" })).toHaveAttribute("aria-selected", "true");
  for (const [tab, section] of [["Appearance", "appearance"], ["Notifications", "notifications"], ["Calendar", "calendar"], ["Slack and export", "workspace"], ["Upload limits", "uploads"]]) {
    await nav.getByRole("tab", { name: tab }).click();
    await expect(page).toHaveURL(new RegExp(`/settings\\?section=${section}$`));
    await expect(page.getByText(/RESEND_API_KEY|SLACK_WEBHOOK_URL|CRON_SECRET|MAX_UPLOAD_MB|[Dd]ue-date/)).toHaveCount(0);
  }
  // The house colours and brand strengths live in Appearance.
  await page.goto("/settings?section=appearance");
  await settle(page);
  await expect(page.getByRole("radiogroup", { name: "Colour set" }).getByRole("radio")).toHaveCount(5);
  await expect(page.getByRole("radiogroup", { name: "Inside a brand" }).getByRole("radio")).toHaveCount(3);
});

test("Launches opens as a list, remembers the month view, and links to the calendar feed", async ({ page }) => {
  await signIn(page);
  await page.goto("/calendar");
  await settle(page);
  await expect(page.getByRole("heading", { name: /^Next 30 days/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Launched recently/ })).toBeVisible();
  await expect(page.getByText("Launch calendar feed")).toHaveCount(0);
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.getByRole("button", { name: "Previous month" })).toBeVisible();
  await page.reload();
  await settle(page);
  await expect(page.getByRole("button", { name: "Month", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("link", { name: "Add launches to your calendar" }).click();
  await expect(page).toHaveURL(/\/settings\?section=calendar$/);
  await expect(page.getByText("Launch calendar feed")).toBeVisible();
});

test("the Global Library lists items as rows grouped by kind, with no zero counts", async ({ page }) => {
  await signIn(page);
  await page.goto("/library");
  await settle(page);
  await expect(page.getByRole("heading", { name: /^Checklists\s*5$/ })).toBeVisible();
  const pills = page.getByRole("group", { name: "Type" });
  await expect(pills.getByRole("button", { name: /\d/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Google Ad Grant Approval/ }).click();
  await expect(page.getByRole("dialog", { name: "Google Ad Grant Approval" })).toBeVisible();
});
