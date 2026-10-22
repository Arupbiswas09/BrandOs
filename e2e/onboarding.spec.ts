import { readFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { detectDelimiter, parseTable, splitList } from "../src/lib/csv";
import { guessColumns, parseDate, parseDriveLines, planDriveLinks, planImport, type BrandFacts } from "../src/lib/import-plan";
import { scanWith, sniffImage, type Fetcher } from "../src/lib/site-draft";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";

test.use({ viewport: { width: 1440, height: 940 } });

/*
 * Onboarding: start a brand from its website, and import offers, assets and
 * Drive links. Names carry a per-run suffix so the suite can run again on
 * the same database.
 */

const run = Date.now().toString(36).slice(-5);
const FIXTURES = path.join(__dirname, "fixtures", "site");

async function axe(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  const problems = r.violations.map((v) => `${label}: ${v.id} (${v.impact}) × ${v.nodes.length} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(problems, problems.join("\n")).toEqual([]);
}

/* ================================================================ pure parts */

test.describe("CSV and TSV parsing", () => {
  test("quotes, doubled quotes, line breaks inside quotes, BOM and blank lines", () => {
    expect(parseTable('name,note\n"Smith, J","He said ""hi"""\n').rows).toEqual([["name", "note"], ["Smith, J", 'He said "hi"']]);
    expect(parseTable('a,b\n"line one\nline two",x\r\n').rows).toEqual([["a", "b"], ["line one\nline two", "x"]]);
    expect(parseTable("﻿a,b\r\n1,2").rows).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseTable("a,b,\n\n1,2,\n,,\n").rows).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseTable('a, "b c" ,d').rows).toEqual([["a", "b c", "d"]]);
    expect(parseTable('5" screen,x').rows).toEqual([['5" screen', "x"]]);
  });

  test("works out the delimiter: tabs from a paste, semicolons from European Excel", () => {
    expect(detectDelimiter("Offer name\tService\nX\tY\n")).toBe("\t");
    expect(detectDelimiter('a;b\n"1,5";2,5\n')).toBe(";");
    expect(parseTable('a;b\n"1,5";2,5\n').rows).toEqual([["a", "b"], ["1,5", "2,5"]]);
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(parseTable("Name\tNote\nA\t\"two\nlines\"\n").rows).toEqual([["Name", "Note"], ["A", "two\nlines"]]);
    expect(splitList("Revenue, Retention")).toEqual(["Revenue", "Retention"]);
    expect(splitList("Ad Grant, for churches; Audit")).toEqual(["Ad Grant, for churches", "Audit"]);
  });

  test("dates, column guesses and the plan", () => {
    expect(parseDate("15/03/2027")).toEqual({ iso: "2027-03-15" });
    expect(parseDate("2027-04-01")).toEqual({ iso: "2027-04-01" });
    expect(parseDate("1.4.27")).toEqual({ iso: "2027-04-01" });
    expect(parseDate("31/02/2027")).toBeNull();
    expect(parseDate("10/31/2027")?.iso).toBe("2027-10-31");
    expect(guessColumns("offers", ["Offer name", "Offer type", "Launch date", "Pitch", "Goals"])).toEqual(["name", "offerType", "launch", null, "goals"]);
    expect(guessColumns("assets", ["Asset name", "Type", "Link", "Offers"])).toEqual(["name", "type", "url", "offers"]);

    const brand: BrandFacts = {
      services: [{ id: "sv1", name: "Google Ad Grant" }], segments: ["Church", "All segments"], offerTypes: ["Audit"], goals: ["Revenue"],
      offers: [{ id: "of1", name: "Existing offer" }], assets: [{ id: "as1", name: "Old doc", url: "https://docs.google.com/document/d/1AbCdEfGhIjKl/edit" }],
    };
    const plan = planImport("offers", ["name", "service", "segment", "goals"], [
      ["New offer", "google ad grants", "church", "Revenue, Trust"],
      ["existing offer", "", "", ""],
      ["", "Google Ad Grant", "", ""],
      ["Another", "Brand Strategy", "Charities", ""],
    ], brand, { shape: false, publish: false }, { create: { service: ["brand strategy"] }, types: {}, duplicates: [] });
    expect(plan.rows.map((r) => r.include)).toEqual([true, false, false, true]);
    expect(plan.rows[0].offer).toMatchObject({ serviceId: "sv1", segment: "Church", goals: ["Revenue"] });
    expect(plan.rows[1].duplicate).toBe("existing");
    expect(plan.rows[3].offer).toMatchObject({ newService: "Brand Strategy", segment: "All segments" });
    // Without structure or kit rights, new segments and goals cannot be made.
    expect(plan.unknowns.find((u) => u.field === "segment")?.canCreate).toBe(false);
    expect(plan.adds.services).toEqual(["Brand Strategy"]);

    const lines = parseDriveLines("Brief, https://docs.google.com/document/d/1AbCdEfGhIjKl/view?usp=sharing\nhttps://drive.google.com/drive/folders/1ZyXwVuTsRqPo\nhttps://example.com/x");
    const drive = planDriveLinks(lines, brand);
    expect(drive.rows.map((r) => [r.name, r.duplicate, r.include])).toEqual([["Brief", "existing", false], ["Drive folder", null, true], ["Drive file", null, false]]);
  });

  test("reads the fixture site into a draft: name, colours, fonts, logo, services", async () => {
    const get: Fetcher = async (url, o) => {
      const u = new URL(url);
      const file = path.join(FIXTURES, u.pathname.endsWith("/") ? `${u.pathname}index.html` : u.pathname);
      try {
        const body = new Uint8Array(await readFile(file));
        const type = { ".html": "text/html", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" }[path.extname(file)] ?? "application/octet-stream";
        return { status: 200, url, contentType: type, body: body.subarray(0, o.maxBytes), truncated: body.length > o.maxBytes };
      } catch {
        return { status: 404, url, contentType: "text/html", body: new Uint8Array(), truncated: false };
      }
    };
    const { draft, digest } = await scanWith("https://fixture.brandos.test/", get);
    expect(draft.name).toBe("Harbour & Pine Studio");
    expect(draft.tagline).toBe("Brands that feel like home.");
    expect(draft.primary).toBe("#0F5C5A");
    expect(draft.secondary).toBe("#E07A3F");
    // The grey, the near-white, the commented-out magenta and the colour inside a data: URL are left out; near-duplicates merge.
    expect(draft.colours.map((c) => c.hex)).toEqual(["#0F5C5A", "#E07A3F"]);
    expect(draft.fonts.map((f) => [f.name, f.role, f.source])).toEqual([["Fraunces", "Headings", "Google Fonts"], ["Inter", "Body", "Google Fonts"]]);
    expect(draft.logos[0]).toMatchObject({ url: "https://fixture.brandos.test/logo.svg", kind: "logo", type: "image/svg+xml" });
    expect(draft.logos.every((l) => l.preview.startsWith("data:image/"))).toBe(true);
    expect(draft.services.map((s) => s.name)).toEqual(["Brand identity", "Websites", "Content strategy", "Workshops"]);
    expect(draft.services[1].oneLine).toContain("Fast, accessible sites");
    expect(digest).not.toContain("<");
    expect(sniffImage(new TextEncoder().encode("<html><script>"))).toBeNull();
  });
});

/* ================================================================ spreadsheet import */

async function paste(page: Page, text: string) {
  await page.getByLabel("Or paste the rows").fill(text);
}

test("imports pasted offers and assets into a brand, with the mapping checked and a duplicate skipped", async ({ page }) => {
  await signIn(page);
  await page.goto("/import?brand=br1");
  await settle(page);
  await expect(page.getByRole("heading", { level: 1, name: "Bring in offers and assets" })).toBeVisible();

  const offers = [
    ["Offer name", "Service", "Segment", "Pitch", "Promise", "Goals", "Launch date", "Tags", "Notes for us"],
    [`Spring Volunteer Drive ${run}`, "Google Ad Grant", "Church", "Volunteers before money", "Forty new volunteers by May", "Recruitment", "15/03/2027", "spring, volunteers", "ask Tom"],
    [`Brand Workshop ${run}`, `Brand Strategy ${run}`, "", "", "A brand the board agrees on", "Awareness", "2027-04-01", "workshop", ""],
    [`Donor Survey ${run}`, "Impact Report", "Education", "", "", "Revenue", "", "", ""],
    ["Free Marketing Audit", "", "All segments", "", "The way in", "", "", "", ""],
  ].map((r) => r.join("\t")).join("\n");
  await paste(page, offers);
  await expect(page.getByText("4 rows, 9 columns, tab separated")).toBeVisible();

  // The guesses, and one column mapped by hand.
  await expect(page.getByLabel("What Offer name holds")).toHaveValue("name");
  await expect(page.getByLabel("What Launch date holds")).toHaveValue("launch");
  await expect(page.getByLabel("What Notes for us holds")).toHaveValue("");
  await expect(page.getByLabel("What Pitch holds")).toHaveValue("");
  await page.getByLabel("What Pitch holds").selectOption("positioning");

  // A service the brand does not have yet is created by default.
  await expect(page.getByText(`Brand Strategy ${run}`).first()).toBeVisible();
  await expect(page.getByRole("group", { name: `Brand Strategy ${run}: create it or leave it empty` }).getByRole("button", { name: "Create it" })).toHaveAttribute("aria-pressed", "true");

  // The offer that already exists is skipped unless asked otherwise.
  await expect(page.getByText("Quokka For Good already has an offer with this name.")).toBeVisible();
  await expect(page.getByRole("group", { name: "Row 5: skip or import anyway" }).getByRole("button", { name: "Skip" })).toHaveAttribute("aria-pressed", "true");
  await axe(page, "import preview");

  await page.getByRole("button", { name: "Import 3 offers" }).click();
  await expect(page.getByRole("heading", { name: "Imported 3 offers into Quokka For Good" })).toBeVisible();
  await expect(page.getByText("1 row skipped. Also added 1 service.")).toBeVisible();

  // The offer came in as it was previewed: its positioning and launch date.
  const workshop = await page.getByRole("link", { name: `Brand Workshop ${run}` }).getAttribute("href");
  await page.getByRole("link", { name: `Spring Volunteer Drive ${run}` }).click();
  await page.waitForURL(/\/offers\/of/);
  await settle(page);
  await expect(page.getByText("Volunteers before money").first()).toBeVisible();
  await expect(page.getByLabel("Launch date")).toHaveValue("2027-03-15");

  // Then assets, linked to two of the new offers by name.
  await page.goto("/import?brand=br1&kind=assets");
  await settle(page);
  await expect(page.getByRole("button", { name: "Assets", pressed: true })).toBeVisible();
  const assets = [
    ["Asset name", "Type", "Link", "Channel", "Status", "Offers"],
    [`Volunteer landing page ${run}`, "LP", "www.quokkaforgood.org/volunteer", "Google Ads", "Ready", `Spring Volunteer Drive ${run}; Brand Workshop ${run}`],
    [`Workshop slides ${run}`, "Google Slides", "https://docs.google.com/presentation/d/1QwErTyUiOp12345/edit", "", "Live", `Brand Workshop ${run}`],
  ].map((r) => r.join("\t")).join("\n");
  await paste(page, assets);
  await expect(page.getByLabel("What Link holds")).toHaveValue("url");
  await page.getByRole("button", { name: "Import 2 assets" }).click();
  await expect(page.getByRole("heading", { name: "Imported 2 assets into Quokka For Good" })).toBeVisible();

  await page.goto(workshop!);
  await settle(page);
  await expect(page.getByText(`Volunteer landing page ${run}`).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(`Workshop slides ${run}`).filter({ visible: true }).first()).toBeVisible();
});

test("the server plans the import again and refuses what the person may not do", async ({ page }) => {
  const rows = { brandId: "br2", kind: "offers", columns: ["name"], rows: [[`Sneaky ${run}`]], choices: { create: {}, types: {}, duplicates: [] } };
  await signIn(page, "Ines Batz"); // Editor, Quokka For Good only
  expect(await callAction(page, "/import", "app/import-actions.ts", "importRows", [rows])).toContain("That brand is not here any more.");
  await signIn(page, "Marta Vieira"); // Viewer
  expect(await callAction(page, "/import", "app/import-actions.ts", "importRows", [{ ...rows, brandId: "br4" }])).toContain("Your role does not allow that.");
  await page.goto("/import");
  await expect(page.getByText("Your role cannot add work")).toBeVisible();
  // Too many rows is refused before anything is read.
  await signIn(page);
  const many = { ...rows, brandId: "br1", rows: Array.from({ length: 501 }, (_, i) => [`Row ${i}`]) };
  expect(await callAction(page, "/import", "app/import-actions.ts", "importRows", [many])).toContain("Import up to 500 at a time.");
});

/* ================================================================ Drive links */

test("imports pasted Google Drive links as Drive link assets on an offer, and knows them the second time", async ({ page }) => {
  await signIn(page);
  await page.goto("/import?brand=br1&mode=drive&offer=of15");
  await settle(page);
  const id = `1Dr${run}AbCdEfGhIj`;
  const text = [`Audit brief ${run}, https://docs.google.com/document/d/${id}/edit?usp=sharing`, `https://drive.google.com/drive/folders/1Fo${run}lderXyZ123`, "https://example.com/not-drive"].join("\n");
  await page.getByLabel("Google Drive, Docs, Sheets or Slides links").fill(text);
  await expect(page.getByLabel("Link them to an offer")).toHaveValue("of15");
  await expect(page.getByLabel("Name for link 1")).toHaveValue(`Audit brief ${run}`);
  await expect(page.getByLabel("Name for link 2")).toHaveValue("Drive folder");
  await page.getByLabel("Name for link 2").fill(`Audit photos ${run}`);
  await expect(page.getByText("This is not a Google Drive, Docs, Sheets, Slides or Forms link.")).toBeVisible();
  await axe(page, "drive links");
  await page.getByRole("button", { name: "Import 2 links" }).click();
  await expect(page.getByRole("heading", { name: "Imported 2 assets into Quokka For Good" })).toBeVisible();

  await page.goto("/offers/of15");
  await settle(page);
  await expect(page.getByText(`Audit brief ${run}`).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(`Audit photos ${run}`).filter({ visible: true }).first()).toBeVisible();

  // The same link again (copied with /view) is spotted and skipped.
  await page.goto("/import?brand=br1&mode=drive");
  await settle(page);
  await page.getByLabel("Google Drive, Docs, Sheets or Slides links").fill(`https://docs.google.com/document/d/${id}/view`);
  await expect(page.getByText("Quokka For Good already has this link or name.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import 0 links" })).toBeDisabled();
});

/* ================================================================ from a website */

test("scanning never opens private addresses, and only managers and admins may start a brand", async ({ page }) => {
  await signIn(page);
  for (const url of ["http://127.0.0.1:3000/", "http://localhost/", "http://169.254.169.254/latest/meta-data/"]) {
    const body = await callAction(page, "/brands/new/from-website", "app/onboarding-actions.ts", "scanWebsite", [url]);
    expect(body).toContain("private network");
  }
  expect(await callAction(page, "/brands/new/from-website", "app/onboarding-actions.ts", "scanWebsite", ["ftp://example.com/"])).toContain("Only http and https");
  await signIn(page, "Ines Batz"); // Editor
  await page.goto("/brands/new/from-website");
  await expect(page.getByText("Only managers and admins add brands")).toBeVisible();
  expect(await callAction(page, "/brands/new/from-website", "app/onboarding-actions.ts", "scanWebsite", ["https://example.com/"])).toContain("Your role cannot add brands.");
});

test("a brand from its website: scan, check the draft, create it with its services and logo", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/new/from-website");
  await settle(page);
  await axe(page, "from website, start");
  await page.getByLabel("Website address").fill("https://fixture.brandos.test/");
  await page.getByRole("button", { name: "Scan the website" }).click();
  // The fixture site is only served by a dev server started with BRANDOS_SCAN_FIXTURES (never in production).
  const review = page.getByRole("heading", { name: "Check the draft" });
  const failed = page.getByRole("alert").filter({ hasText: /could not reach|private network|took too long/ });
  await expect(review.or(failed)).toBeVisible({ timeout: 30_000 });
  test.skip(await failed.isVisible(), "This server does not serve the scan fixture (start it with BRANDOS_SCAN_FIXTURES=e2e/fixtures/site).");

  await expect(page.getByLabel("Brand name")).toHaveValue("Harbour & Pine Studio");
  await expect(page.getByLabel("Tagline")).toHaveValue("Brands that feel like home.");
  await expect(page.getByRole("group", { name: "Role of #0F5C5A" }).getByRole("button", { name: "Primary" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Font name").first()).toHaveValue("Fraunces");
  await expect(page.getByRole("radio", { name: /Logo in the header/ })).toBeChecked();
  await axe(page, "from website, review");

  // Edit: a new name, swap the colours, drop a service, file it under a new client.
  const name = `Harbour and Pine ${run}`;
  await page.getByLabel("Brand name").fill(name);
  await page.getByRole("group", { name: "Role of #E07A3F" }).getByRole("button", { name: "Primary" }).click();
  await expect(page.getByRole("group", { name: "Role of #0F5C5A" }).getByRole("button", { name: "Secondary" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("checkbox", { name: "Add Workshops" }).uncheck();
  await page.getByRole("button", { name: "A new client" }).click();
  await page.getByLabel("New client's name").fill(`Harbour Client ${run}`);
  await expect(page.getByText(`Creates ${name} with 2 colours, 2 fonts, 3 services and its logo.`)).toBeVisible();
  await page.getByRole("button", { name: "Create brand" }).click();

  await page.waitForURL(/\/brands\/br[a-z0-9]+$/, { timeout: 20_000 });
  await settle(page);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  const brandUrl = page.url();
  await page.goto(`${brandUrl}/services`);
  await settle(page);
  await expect(page.getByText("Content strategy").first()).toBeVisible();
  await expect(page.getByText("Workshops")).toHaveCount(0);
  // The logo is a master file, so it sits in the Brand Kit with the colours and fonts.
  await page.goto(`${brandUrl}/kit`);
  await settle(page);
  await expect(page.getByText(`${name} logo`).filter({ visible: true }).first()).toBeVisible();
  // The kit opens one section at a time.
  const kit = page.getByRole("tablist", { name: "Brand kit sections" });
  await kit.getByRole("tab", { name: "Typography" }).click();
  await expect(page.getByText("Fraunces").filter({ visible: true }).first()).toBeVisible();
  await kit.getByRole("tab", { name: "Colour" }).click();
  await expect(page.getByText("#E07A3F").filter({ visible: true }).first()).toBeVisible();
});

test("the way in: the New menu, an Import button on a brand's Offers and Assets, and the pages' breadcrumbs", async ({ page }) => {
  await signIn(page);
  // Inside a brand, the New menu's import goes to that brand and a new brand goes under its client.
  await page.goto("/brands/br1");
  await settle(page);
  await page.getByRole("button", { name: "New", exact: true }).click();
  const menu = page.getByRole("menu", { name: "New" });
  await expect(menu.getByRole("menuitem", { name: /Brand from a website/ })).toHaveAttribute("href", "/brands/new/from-website?client=cl1");
  await expect(menu.getByRole("menuitem", { name: /Import from a spreadsheet/ })).toHaveAttribute("href", "/import?brand=br1");
  await page.keyboard.press("Escape");

  // A bordered Import beside each tab's one primary button, never a second primary.
  await page.goto("/brands/br1/offers");
  await settle(page);
  await expect(page.getByRole("link", { name: "Import", exact: true })).toHaveAttribute("href", "/import?brand=br1");
  await page.goto("/brands/br1/assets");
  await settle(page);
  await expect(page.getByRole("link", { name: "Import", exact: true })).toHaveAttribute("href", "/import?brand=br1&kind=assets");
  await page.getByRole("link", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\/import\?brand=br1&kind=assets$/);
  await settle(page);
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByRole("listitem")).toHaveText(["Dashboard", "Import"]);
  await axe(page, "import");

  // "new" is not a brand: the page is not themed as one and says what it is.
  await page.goto("/brands/new/from-website?client=cl1");
  await settle(page);
  await expect(crumbs.getByRole("listitem")).toHaveText(["Dashboard", "New brand from a website"]);
  await expect(page.getByRole("heading", { level: 1, name: "Start a brand from its website" })).toBeVisible();
  await axe(page, "from website");

  // A Viewer gets neither.
  await signIn(page, "Marta Vieira");
  await page.goto("/brands/br4/assets");
  await settle(page);
  await expect(page.getByRole("link", { name: "Import", exact: true })).toHaveCount(0);
});
