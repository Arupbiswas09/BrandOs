import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";

test.use({ viewport: { width: 1440, height: 940 } });

/*
 * Undo after deleting on an offer's funnel board: a toast with an Undo
 * button (and ⌘Z on the board) puts back exactly what went, through the
 * board's own autosave. Each test leaves the seeded boards as it found them;
 * the throwaway board on of21 is emptied again (search.spec writes its own).
 */

const board = (page: Page) => page.getByRole("tabpanel", { name: "Funnel" });
const count = (funnel: Locator) => funnel.getByText(/^\d+ box(es)? · \d+ arrows?$/);
const undoButton = (page: Page) => page.getByRole("button", { name: "Undo", exact: true });

/** Every box and arrow on the board as its name and place, in board order. */
async function snapshot(funnel: Locator) {
  const boxes = await funnel.locator("[data-funnel-box]").evaluateAll((els) =>
    els.map((e) => { const s = (e.parentElement as HTMLElement).style; return `${e.getAttribute("aria-label")} @ ${s.left} ${s.top} ${s.width}`; }));
  const arrows = await funnel.locator("[data-funnel-arrow]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  return { boxes, arrows };
}

test("deleting a box takes its arrows; Undo puts it all back as it was, and it is still there after a reload", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of15?tab=funnel");
  await settle(page);
  const funnel = board(page);
  await expect(count(funnel)).toHaveText("8 boxes · 6 arrows");
  const before = await snapshot(funnel);

  // The landing page has three arrows in and one out.
  await funnel.getByRole("button", { name: /^Step: Free Audit Landing Page/ }).click();
  await funnel.getByRole("group", { name: "Box" }).getByRole("button", { name: "Delete box" }).click();
  await expect(count(funnel)).toHaveText("7 boxes · 2 arrows");
  await expect(page.getByRole("status").filter({ hasText: "Deleted the box and its 4 arrows" })).toBeVisible();
  // The delete saves on its own; Undo is a second change, not a reload.
  await expect(funnel.getByText("Saved", { exact: true })).toBeVisible();

  await undoButton(page).click();
  await expect(undoButton(page)).toHaveCount(0);
  await expect(count(funnel)).toHaveText("8 boxes · 6 arrows");
  await expect(funnel.getByRole("button", { name: /^Step: Free Audit Landing Page/ })).toBeFocused();
  await expect(funnel.getByText("Saved", { exact: true })).toBeVisible();
  expect(await snapshot(funnel)).toEqual(before);

  await page.reload();
  await settle(page);
  await expect(count(funnel)).toHaveText("8 boxes · 6 arrows");
  expect(await snapshot(funnel)).toEqual(before);
});

test("an arrow comes back with its label and ends, from a keyboard-reached Undo or ⌘Z", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of15?tab=funnel");
  await settle(page);
  const funnel = board(page);
  const before = await snapshot(funnel);
  const arrow = funnel.getByRole("button", { name: "Arrow from The audit to Thirty-Minute Grant Consultation, labelled booked call" });

  // Delete with the keyboard, then Tab to the toast's Undo: a real button, held while it has focus.
  await arrow.focus();
  await page.keyboard.press("Enter");
  await expect(funnel.getByRole("group", { name: "Arrow" })).toBeVisible();
  await arrow.focus();
  await page.keyboard.press("Delete");
  await expect(arrow).toHaveCount(0);
  await expect(count(funnel)).toHaveText("8 boxes · 5 arrows");
  const toast = page.getByRole("status").filter({ hasText: "Deleted the arrow" });
  await expect(toast).toBeVisible();
  // The status says only what happened; the button sits beside it.
  await expect(toast).not.toContainText("Undo");
  const undo = undoButton(page);
  for (let i = 0; i < 60 && !(await undo.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(undo).toBeFocused();
  await expect(undo).toHaveAccessibleDescription("Deleted the arrow");
  await page.waitForTimeout(9000); // longer than a toast with an action stays on its own
  await expect(undo).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(undo).toHaveCount(0);
  await expect(arrow).toBeFocused();
  await expect(funnel.getByText("Saved", { exact: true })).toBeVisible();
  expect(await snapshot(funnel)).toEqual(before);

  // ⌘Z on the board does the same for the newest delete whose Undo is showing.
  await arrow.click();
  await funnel.getByRole("group", { name: "Arrow" }).getByRole("button", { name: "Delete arrow" }).click();
  await expect(count(funnel)).toHaveText("8 boxes · 5 arrows");
  await expect(undo).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(undo).toHaveCount(0);
  await expect(count(funnel)).toHaveText("8 boxes · 6 arrows");
  await expect(funnel.getByText("Saved", { exact: true })).toBeVisible();

  await page.reload();
  await settle(page);
  expect(await snapshot(funnel)).toEqual(before);
});

/** A small board on Northgate's Sponsor A Squad (of21), which Marta (Viewer, Northgate only) can see. Saved as Priya. */
async function smallBoard(page: Page, funnel: unknown = {
  boxes: [{ id: "bv1", kind: "step", x: 40, y: 40, text: "Sponsor pack" }, { id: "bv2", kind: "stage", x: 320, y: 40, text: "Signed" }],
  arrows: [{ id: "av1", from: "bv1", to: "bv2", label: "yes" }],
}) {
  await signIn(page);
  expect(await callAction(page, "/offers/of21", "app/funnel-actions.ts", "saveFunnel", ["of21", funnel])).toContain("\"ok\":true");
}

test("Undo goes when the board does: leaving the Funnel tab closes it", async ({ page }) => {
  await smallBoard(page);
  await page.goto("/offers/of21?tab=funnel");
  await settle(page);
  const funnel = board(page);
  await funnel.getByRole("button", { name: /^Step: Sponsor pack/ }).click();
  await funnel.getByRole("group", { name: "Box" }).getByRole("button", { name: "Delete box" }).click();
  await expect(undoButton(page)).toBeVisible();
  await page.getByRole("tab", { name: /^Assets/ }).click();
  await expect(undoButton(page)).toHaveCount(0);
  await page.getByRole("tab", { name: "Funnel" }).click();
  await expect(count(funnel)).toHaveText("1 box · 0 arrows");
  await smallBoard(page, { boxes: [], arrows: [] });
});

test("a box whose file was deleted since comes back from Undo still linked", async ({ page }) => {
  await signIn(page);
  const funnel = board(page);
  // A box linked to a file that is then deleted reads "Not available".
  await page.goto("/offers/of15?asset=as4");
  await settle(page);
  const drawer = page.getByRole("dialog", { name: "Nonprofit Weekly Sponsorship" });
  await drawer.getByRole("button", { name: "More asset actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete Nonprofit Weekly Sponsorship?" }).getByRole("button", { name: "Delete" }).click();
  await expect(drawer).toHaveCount(0);
  await page.goto("/offers/of15?tab=funnel");
  await settle(page);
  const gone = funnel.getByRole("button", { name: /^Step: Not available/ });
  await expect(gone).toHaveCount(1);

  // Deleted and saved, then undone: the board saves again without a complaint, link and all.
  await gone.click();
  await page.keyboard.press("Delete");
  await expect(gone).toHaveCount(0);
  await expect(funnel.getByText("Saved", { exact: true })).toBeVisible();
  await undoButton(page).click();
  await expect(gone).toHaveCount(1);
  await expect(funnel.getByText("Saved", { exact: true })).toBeVisible();
  await expect(funnel.getByText("Not saved")).toHaveCount(0);
  await page.reload();
  await settle(page);
  await expect(gone).toHaveCount(1);

  // The file comes back from the recycle bin, and the box names it again.
  await page.goto("/trash");
  await settle(page);
  await page.getByRole("button", { name: "Restore Nonprofit Weekly Sponsorship" }).click();
  await expect(page.getByText("Nonprofit Weekly Sponsorship is back")).toBeVisible();
  await page.goto("/offers/of15?tab=funnel");
  await settle(page);
  await expect(funnel.getByRole("button", { name: /^Step: Nonprofit Weekly Sponsorship/ })).toBeVisible();
});

test("a made-up Undo note does not let a box link to another brand's file", async ({ page }) => {
  await signIn(page);
  // of21 is Northgate's; as4 is a Quokka For Good file. Without a real note the usual check refuses it.
  const body = await callAction(page, "/offers/of21", "app/funnel-actions.ts", "saveFunnel", [
    "of21",
    { boxes: [{ id: "bforged", kind: "step", x: 40, y: 40, text: "", link: { type: "asset", id: "as4" } }], arrows: [] },
    ["eyJvIjoib2YyMSJ9.not-a-real-signature"],
  ]);
  expect(body).toContain("A box links to something you cannot see, or to something from another brand.");
});

test("a viewer sees the board but cannot delete, so there is nothing to undo", async ({ page }) => {
  await smallBoard(page);
  await signIn(page, "Marta Vieira");
  await page.goto("/offers/of21?tab=funnel");
  await settle(page);
  const funnel = board(page);
  await expect(funnel.getByText("Sponsor pack")).toBeVisible();
  await expect(funnel.getByText("1 arrow", { exact: false })).toBeVisible();
  await expect(funnel.getByRole("button", { name: /^(Step|Stage|Note):|^Arrow from|^Delete/ })).toHaveCount(0);
  await funnel.getByText("Sponsor pack").click();
  await page.keyboard.press("Delete");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(funnel.getByText("Sponsor pack")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Done: Deleted/ })).toHaveCount(0);
  await expect(undoButton(page)).toHaveCount(0);
  // The server says no on its own, too.
  expect(await callAction(page, "/offers/of21", "app/funnel-actions.ts", "saveFunnel", ["of21", { boxes: [], arrows: [] }])).toContain("Your role does not allow that.");

  // Back to an empty board for the rest of the suite.
  await smallBoard(page, { boxes: [], arrows: [] });
});

test("the Undo toast meets WCAG AA", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of15?tab=funnel");
  await settle(page);
  const funnel = board(page);
  await funnel.getByRole("button", { name: /labelled 34% convert$/ }).click();
  await funnel.getByRole("group", { name: "Arrow" }).getByRole("button", { name: "Delete arrow" }).click();
  const toast = page.getByRole("status").filter({ hasText: "Deleted the arrow" });
  await expect(toast).toBeVisible();
  await page.waitForTimeout(300); // let it finish sliding in
  await undoButton(page).hover(); // held while the pointer is on it
  const r = await new AxeBuilder({ page }).include(".animate-toast").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  const problems = r.violations.map((v) => `${v.id} × ${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(problems, problems.join("\n")).toEqual([]);
  await undoButton(page).click();
  await expect(count(funnel)).toHaveText("8 boxes · 6 arrows");
  await expect(funnel.getByText("Saved", { exact: true })).toBeVisible();
});
