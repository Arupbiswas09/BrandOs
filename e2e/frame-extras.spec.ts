import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";

// The frame's small extras: one name for the queue, a way back to the setup
// steps, archived clients in the sidebar, and tabs that say when there are more.

async function axe(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("[data-contrast-sample]").analyze();
  const problems = r.violations.map((v) => `${where}: ${v.id} (${v.impact}) × ${v.nodes.length} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(problems, problems.join("\n")).toEqual([]);
}

/** The part of `tab` that shows inside the scrolling `list`, in px from each edge (negative: cut off). */
async function room(list: Locator, tab: Locator) {
  const l = (await list.boundingBox())!;
  const t = (await tab.boundingBox())!;
  return { left: t.x - l.x, right: l.x + l.width - (t.x + t.width) };
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the queue is called Your queue wherever a person reads it", async ({ page }) => {
    await signIn(page);
    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("button", { name: /^Your queue/ }).click();
    const panel = page.getByRole("dialog", { name: "Your queue" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Your queue", { exact: true })).toBeVisible();
    await expect(page.getByText("Inbox", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);

    // The I key and search open the same thing, by the same name.
    await page.keyboard.press("i");
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    const box = page.getByRole("combobox", { name: "Search" });
    await box.click();
    await box.fill("inbox");
    await page.locator("#search-results").getByRole("option", { name: /^Your queue/ }).click();
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");

    // Out of the search box, so the key is not typed into it.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" }).getByText("Open your queue")).toBeVisible();
  });

  test("an archived client is under the sidebar's toggle, and opens", async ({ page }) => {
    await signIn(page);
    const nav = page.getByRole("navigation", { name: "Main" });
    const toggle = nav.getByRole("button", { name: /^\d+ archived clients?$/ });
    const harlow = nav.getByRole("link", { name: /Harlow Community Trust/ });
    // Folded at first: archived clients stay out of the way.
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(harlow).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(harlow).toContainText("Archived");
    await axe(page, "sidebar with archived clients");
    await harlow.click();
    await expect(page).toHaveURL(/\/clients\/cl4$/);
    await expect(page.getByRole("heading", { name: "Harlow Community Trust" })).toBeVisible();
    await expect(harlow).toHaveAttribute("aria-current", "page");
    // Remembered in this browser.
    await page.reload();
    await settle(page);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(harlow).toBeVisible();

    // Only people who can see an archived client see it: Marta works on Northgate alone.
    await signIn(page, "Marta Vieira");
    await expect(nav.getByRole("link", { name: /Northgate/ }).first()).toBeVisible();
    await expect(nav.getByRole("button", { name: /archived client/ })).toHaveCount(0);
    await expect(harlow).toHaveCount(0);
  });

  test("hiding Get set up and bringing it back survives a reload", async ({ page }) => {
    // The demo is fully set up, so the card never shows. For a moment Leo is an admin who sees no clients yet.
    const leo = (access: string, groupIds: string[]) => ({ id: "lp", name: "Leo Park", email: "leo@quokkaforgood.org", role: "Freelance copywriter", access, allClients: false, clientIds: [], brandIds: [], groupIds });
    await signIn(page);
    expect(await callAction(page, "/team", "app/actions.ts", "savePerson", [leo("Admin", [])])).toContain('"ok":true');
    try {
      await signIn(page, "Leo Park");
      const card = page.getByRole("heading", { name: "Get set up" });
      const hide = page.getByRole("button", { name: "Hide the setup steps" });
      const back = page.getByRole("button", { name: "Show setup steps" });
      await expect(card).toBeVisible();
      await expect(back).toHaveCount(0);

      // The × hides it, and leaves a quiet way back where it was (focus goes there, not to the top of the page).
      await hide.click();
      await expect(card).toHaveCount(0);
      await expect(back).toBeFocused();
      await axe(page, "dashboard with the setup steps hidden");
      await page.reload();
      await settle(page);
      await expect(card).toHaveCount(0);
      await back.click();
      await expect(card).toBeVisible();
      await expect(hide).toBeFocused();
      await page.reload();
      await settle(page);
      await expect(card).toBeVisible();

      // Settings → Profile has the same switch, on the same stored choice.
      await hide.click();
      await page.goto("/settings");
      await settle(page);
      const toggle = page.getByRole("switch", { name: "Show the setup steps on the Dashboard" });
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await axe(page, "settings with the setup switch");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await page.goto("/");
      await settle(page);
      await expect(card).toBeVisible();
      await page.reload();
      await settle(page);
      await expect(card).toBeVisible();
    } finally {
      await signIn(page);
      expect(await callAction(page, "/team", "app/actions.ts", "savePerson", [leo("Contributor", ["g1"])])).toContain('"ok":true');
    }

    // Nothing to bring back once every step is done: no switch in Settings, no link on the Dashboard.
    await page.goto("/");
    await settle(page);
    await expect(page.getByRole("heading", { name: "Waiting on you" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Get set up" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show setup steps" })).toHaveCount(0);
    await page.goto("/settings");
    await settle(page);
    await expect(page.getByRole("switch", { name: "Show the setup steps on the Dashboard" })).toHaveCount(0);
  });

  test("Slack and export says who sees it truthfully, admins or not", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings?section=workspace");
    await settle(page);
    await expect(page.getByText("Settings for the whole workspace, shown only to people who may use them.")).toBeVisible();
    await expect(page.getByText(/Only admins see these/)).toHaveCount(0);
  });

  test("tabs that fit have no fade", async ({ page }) => {
    await signIn(page);
    await page.goto("/audit");
    await settle(page);
    const list = page.getByRole("tablist");
    await expect(list).not.toHaveAttribute("data-more", /.+/);
    expect(await list.evaluate((el) => getComputedStyle(el).maskImage)).toBe("none");
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the bottom bar says Queue and opens Your queue", async ({ page }) => {
    await signIn(page);
    const quick = page.getByRole("navigation", { name: "Quick navigation" });
    const queue = quick.getByRole("button", { name: /^Queue(, \d+ waiting)?$/ });
    await expect(queue).toBeVisible();
    await expect(quick.getByText("Inbox")).toHaveCount(0);
    await queue.click();
    await expect(page.getByRole("dialog", { name: "Your queue" })).toBeVisible();
  });

  test("Audit log tabs fade where there are more, and keep the selected tab in view", async ({ page }) => {
    await signIn(page);
    await page.goto("/audit");
    await settle(page);
    const list = page.getByRole("tablist");
    // Six tabs do not fit at 390px: the far edge fades, the near one does not.
    await expect(list).toHaveAttribute("data-more", "end");
    expect(await list.evaluate((el) => getComputedStyle(el).maskImage)).toContain("linear-gradient");
    expect((await room(list, page.getByRole("tab", { name: "Exports" }))).right).toBeLessThan(0);
    await axe(page, "audit log on a phone");

    // Choosing the last tab brings it fully into view, and the cue moves to the other edge.
    await page.getByRole("tab", { name: "Exports" }).click();
    await expect(page).toHaveURL(/kind=exports/);
    await expect(list).toHaveAttribute("data-more", "start");
    const last = await room(list, page.getByRole("tab", { name: "Exports", selected: true }));
    expect(last.left).toBeGreaterThanOrEqual(0);
    expect(last.right).toBeGreaterThanOrEqual(-1);

    // Arriving on a tab in the middle: it is in view and clear of the fades on both sides.
    await page.goto("/audit?kind=signins");
    await settle(page);
    await expect(list).toHaveAttribute("data-more", "both");
    const mid = await room(list, page.getByRole("tab", { name: "Sign-ins", selected: true }));
    expect(mid.left).toBeGreaterThanOrEqual(39);
    expect(mid.right).toBeGreaterThanOrEqual(39);
  });
});
