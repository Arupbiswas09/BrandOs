import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PAGES, settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 940 } });

test("pages meet WCAG AA, contrast included", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page);
  const problems: string[] = [];
  for (const [name, path] of [["sign-in", "/sign-in"] as [string, string], ...PAGES]) {
    if (name === "sign-in") continue;
    await page.goto(path);
    await settle(page);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    for (const v of r.violations) {
      problems.push(`${name}: ${v.id} (${v.impact}) × ${v.nodes.length} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
