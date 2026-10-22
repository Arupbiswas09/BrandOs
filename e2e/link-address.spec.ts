import { expect, test } from "@playwright/test";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";
import { linkAddressIssue, linkAdvice } from "../src/lib/link-health";

/*
 * Two links pasted into one address field can never open. BrandOS says so in
 * plain words, before saving and in the link check, instead of a bare "404".
 */

test.use({ viewport: { width: 1440, height: 940 } });

test("the rules: a space or two links in one address, and advice for each failure", () => {
  expect(linkAddressIssue("drive.google.com/drive/folders/abc")).toBeNull();
  expect(linkAddressIssue("  https://example.org/page  ")).toBeNull();
  expect(linkAddressIssue("drive.google.com/drive/u/2/folders/abc https://docs.google.com/x")).toBe("Two links in one address");
  expect(linkAddressIssue("example.org/my page")).toBe("A space in the address");
  expect(linkAdvice({ status: null, error: "Two links in one address" }, "a.org b.org")).toMatch(/^Keep one link here/);
  expect(linkAdvice({ status: 404, error: undefined }, "drive.google.com/drive/folders/abc")).toMatch(/Drive's Share button/);
  expect(linkAdvice({ status: 404, error: undefined }, "example.org/gone")).toMatch(/isn't there any more/);
  expect(linkAdvice({ status: null, error: "No such domain" }, "exampel.org")).toMatch(/misspelt/);
});

test("the asset form says when an address holds two links, and the server refuses it", async ({ page }) => {
  await signIn(page);
  await page.goto("/offers/of15?asset=as1");
  await settle(page);
  await page.getByRole("dialog").first().getByRole("button", { name: "Edit", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Edit asset" });
  const url = form.getByRole("textbox", { name: /^Live URL/ });
  const before = await url.inputValue();
  await url.fill("quokkaforgood.org/audit https://drive.google.com/drive/folders/abc");
  await expect(form.getByText("This has two links in it. Keep one here; add the other as its own asset or in the notes.")).toBeVisible();
  await expect(form.getByRole("button", { name: "Save asset" })).toBeDisabled();
  await url.fill(before);
  await expect(form.getByRole("button", { name: "Save asset" })).toBeEnabled();
  await page.keyboard.press("Escape");

  const body = await callAction(page, "/offers/of15", "app/actions.ts", "saveAsset", [{
    brandId: "br1", name: "Two links test", type: "Landing page", url: "example.org/a https://example.org/b", offerIds: [],
  }]);
  expect(body).toContain("Put one link in the address");
  expect(body).not.toContain('"ok":true');
});
