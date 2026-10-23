import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { callAction } from "./server-action";
import { settle, signIn } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/*
 * The Brand Kit's newer parts: guidelines as a PDF, a slide deck or a Google
 * link; Brand tone; videos; social links; legal pages; logo variations; and
 * uploading and replacing kit files. Kit editors change them, everyone else
 * reads them, and the server refuses anyone else's save.
 *
 * Northgate Athletics (br4) is used so the Quokka kit other specs read stays
 * as seeded. Marta (Viewer) sees Northgate; Ines (Editor) sees Quokka only.
 */

const KIT = "/brands/br4/kit";
const SLIDES = "https://docs.google.com/presentation/d/1NorthgateDeckAbCdEfGh/edit#slide=id.p";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** A one-page PDF with a correct cross-reference table. */
function pdf(text = "Terms and conditions") {
  const stream = `BT /F1 28 Tf 48 300 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 396] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const at: number[] = [];
  objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const LABELS: Record<string, string> = {
  guidelines: "Guidelines", logo: "Logo", tone: "Brand tone", videos: "Videos", social: "Social links", legal: "Legal", files: "Files",
};

/** Opens a section of Northgate's kit the way people do: from the page, by its tab. */
async function section(page: Page, key: string) {
  if (new URL(page.url()).pathname !== KIT) {
    await page.goto(`${KIT}#kit-${key}`);
    await settle(page);
    return;
  }
  await page.getByRole("tablist", { name: "Brand kit sections" }).getByRole("tab", { name: LABELS[key], exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#kit-${key}$`));
}

async function axe(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("[data-contrast-sample]").analyze();
  expect(r.violations.map((v) => `${name}: ${v.id} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

/** Picks a file through the button that opens the file chooser. */
async function choose(page: Page, open: () => Promise<void>, file: { name: string; mimeType: string; buffer: Buffer }) {
  const chooser = page.waitForEvent("filechooser");
  await open();
  await (await chooser).setFiles(file);
}

test("a kit editor fills the new parts of the Brand Kit, and they survive a reload and reach the export", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);

  // Guidelines: a slide deck first. It cannot show in a browser, so it is a file card with Download.
  await section(page, "guidelines");
  const guides = page.getByRole("region", { name: "Guidelines" });
  await expect(guides.getByText(/No guidelines for Northgate Athletics yet/)).toBeVisible();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await choose(page, () => page.getByRole("menuitem", { name: "Upload a PDF or slide deck" }).click(),
    { name: "northgate-guidelines.pptx", mimeType: PPTX, buffer: Buffer.from("PK deck") });
  await expect(page.getByText("northgate-guidelines.pptx is up")).toBeVisible();
  const deck = guides.locator("[data-guide=file]");
  await expect(deck).toContainText("Slide decks can't be shown in a browser");
  await expect(deck.getByRole("link", { name: /Download/ })).toHaveAttribute("href", /\/api\/files\/assets\/.+northgate-guidelines\.pptx$/);

  // A Google Slides link: added from the deck's card, and it previews once asked.
  await deck.getByRole("button", { name: "Add a Google Slides link" }).click();
  const dlg = page.getByRole("dialog", { name: "Add a guidelines link" });
  await dlg.getByRole("textbox", { name: /^Link/ }).fill("docs.google.com/presentation/d/x one docs.google.com/presentation/d/y");
  await dlg.getByRole("button", { name: "Add link" }).click();
  await expect(dlg.getByText("Put one link here. This has two in it.")).toBeVisible();
  await dlg.getByRole("textbox", { name: /^Link/ }).fill(SLIDES);
  await dlg.getByRole("textbox", { name: /^Name/ }).fill("Northgate brand deck");
  await dlg.getByRole("button", { name: "Add link" }).click();
  await expect(dlg).toHaveCount(0);
  const card = guides.locator("[data-guide=link]");
  await expect(card).toContainText("Northgate brand deck");
  await expect(card).toContainText("Google Slides");
  await card.getByRole("button", { name: /^Load preview/ }).click();
  await expect(card.locator("iframe")).toHaveAttribute("src", /^https:\/\/docs\.google\.com\/presentation\/d\/1NorthgateDeckAbCdEfGh\//);
  // The deck waits under the link, still one click from Download.
  await guides.getByText(/^\d+ other files? (or|and) links?$/).click();
  await expect(guides.getByRole("list", { name: "Other guidelines" }).getByRole("link", { name: /Download northgate-guidelines\.pptx/ })).toBeVisible();
  await axe(page, "guidelines");

  // Brand tone: the old Voice section, renamed. The editor opens on it.
  await section(page, "tone");
  await expect(page.getByRole("heading", { name: "Brand tone", level: 2 })).toBeVisible();
  await expect(page.getByText("Encouraging, never patronising.")).toBeVisible();
  await page.getByRole("button", { name: "Edit kit" }).click();
  const kit = page.getByRole("dialog", { name: "Edit the Brand Kit" });
  await expect(kit.getByRole("tab", { name: "Brand tone" })).toHaveAttribute("aria-selected", "true");
  await kit.getByRole("textbox", { name: /^We are tone words/ }).fill("Encouraging\nDirect");
  await kit.getByRole("button", { name: "Save kit" }).click();
  await expect(kit).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Brand tone" }).getByText("Direct", { exact: true })).toBeVisible();

  // Videos: only players BrandOS can frame are taken.
  await section(page, "videos");
  await page.getByRole("button", { name: "Add a video" }).click();
  const vid = page.getByRole("dialog", { name: "Add a video" });
  await vid.getByRole("textbox", { name: /^Video link/ }).fill("example.com/our-film");
  await vid.getByRole("textbox", { name: /^Title/ }).fill("Spring intake film");
  await vid.getByRole("button", { name: "Add video" }).click();
  await expect(vid.getByText(/Paste a YouTube, Vimeo, Loom or Google Drive video link/)).toBeVisible();
  await vid.getByRole("textbox", { name: /^Video link/ }).fill("https://youtu.be/dQw4w9WgXcQ?t=42");
  await vid.getByRole("button", { name: "Add video" }).click();
  await expect(vid).toHaveCount(0);
  const film = page.getByRole("list", { name: "Brand videos" }).getByRole("listitem").filter({ hasText: "Spring intake film" });
  await film.getByRole("button", { name: /^Play here/ }).click();
  await expect(film.locator("iframe")).toHaveAttribute("src", /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  await axe(page, "videos");

  // Social links: one link per field, on the right network; a handle becomes the address.
  await section(page, "social");
  await expect(page.getByText("No social links yet.")).toBeVisible();
  await page.getByRole("button", { name: "Add social links" }).click();
  const soc = page.getByRole("dialog", { name: "Social links" });
  await soc.getByRole("textbox", { name: "Website address" }).fill("northgateathletics.org");
  await soc.getByRole("textbox", { name: "Instagram address" }).fill("instagram.com/northgate instagram.com/northgate.juniors");
  await soc.getByRole("textbox", { name: "LinkedIn address" }).fill("facebook.com/northgate");
  await soc.getByRole("button", { name: "Save links" }).click();
  await expect(soc.getByText("Put one link here. This has two in it.")).toBeVisible();
  await expect(soc.getByText(/That is not a LinkedIn address/)).toBeVisible();
  await axe(page, "social dialog");
  await soc.getByRole("textbox", { name: "Instagram address" }).fill("@northgateathletics");
  await soc.getByRole("textbox", { name: "LinkedIn address" }).fill("linkedin.com/company/northgate-athletics");
  await soc.getByRole("button", { name: "Add another profile" }).click();
  await soc.getByRole("textbox", { name: "What it is" }).fill("Strava club");
  await soc.getByRole("textbox", { name: "Strava club address" }).fill("strava.com/clubs/northgate");
  await soc.getByRole("button", { name: "Save links" }).click();
  await expect(soc).toHaveCount(0);
  const links = page.getByRole("list", { name: "Social links" });
  await expect(links.getByRole("listitem")).toHaveCount(4);
  const insta = links.locator("[data-network=instagram]");
  await expect(insta).toContainText("@northgateathletics");
  await expect(insta.getByRole("link", { name: /Open Instagram/ })).toHaveAttribute("href", "https://www.instagram.com/northgateathletics");
  await expect(insta.getByRole("button", { name: /Copy/ })).toBeVisible();
  await expect(links.locator("[data-network=custom]")).toContainText("Strava club");
  // The server checks the address too, whatever the page sends.
  expect(await callAction(page, KIT, "app/actions.ts", "saveKitPart", [{ brandId: "br4", social: [{ id: "x1", network: "instagram", url: "instagram.com/a instagram.com/b" }] }]))
    .toContain("Put one link here. This has two in it.");
  await settle(page);
  await section(page, "social");
  await expect(links.getByRole("listitem")).toHaveCount(4);
  await axe(page, "social");

  // Legal: the privacy policy as a link, the terms as an uploaded PDF that previews.
  await section(page, "legal");
  const legal = page.getByRole("list", { name: "Legal pages" });
  await legal.getByRole("button", { name: "Add a link to the privacy policy" }).click();
  const priv = page.getByRole("dialog", { name: "Link to the privacy policy" });
  await priv.getByRole("textbox", { name: /^Link/ }).fill("northgateathletics.org/privacy");
  await priv.getByRole("button", { name: "Save" }).click();
  await expect(priv).toHaveCount(0);
  await expect(legal.locator("[data-legal=privacy]").getByRole("link", { name: /Open Privacy policy/ })).toHaveAttribute("href", "https://northgateathletics.org/privacy");
  await legal.getByRole("button", { name: "Upload a file for the terms and conditions" }).click();
  const terms = page.getByRole("dialog", { name: "Upload the terms and conditions" });
  await terms.locator("input[type=file]").setInputFiles({ name: "northgate-terms.pdf", mimeType: "application/pdf", buffer: pdf() });
  await terms.getByRole("button", { name: "Upload" }).click();
  await expect(terms).toHaveCount(0);
  const termsRow = legal.locator("[data-legal=terms]");
  await expect(termsRow).toContainText("northgate-terms.pdf");
  await termsRow.getByRole("button", { name: /^Preview/ }).click();
  await expect(termsRow.locator("iframe")).toHaveAttribute("src", /\/api\/files\/assets\/.+northgate-terms\.pdf\?inline=1$/);
  await axe(page, "legal");

  // Logo variations: the label decides the ground the logo sits on.
  await section(page, "logo");
  await page.getByRole("button", { name: "Label variations" }).click();
  const lab = page.getByRole("dialog", { name: "Logo variations" });
  await lab.getByRole("combobox", { name: "What Northgate Logo is" }).selectOption("On dark");
  await lab.getByRole("button", { name: "Save" }).click();
  await expect(lab).toHaveCount(0);
  const tile = page.getByRole("list", { name: "Logo variations" }).getByRole("button", { name: /Northgate Logo/ });
  await expect(tile).toHaveAttribute("data-ground", "dark");
  await expect(tile).toContainText("On dark");
  await axe(page, "logo");
  // Labels are kept by the logo's id, so a logo deleted and then restored from the recycle bin keeps its label.
  expect(await callAction(page, KIT, "app/actions.ts", "deleteItem", ["asset", "as29"])).toContain('"ok":true');
  await page.goto("/trash");
  await settle(page);
  await page.getByRole("button", { name: "Restore Northgate Logo" }).click();
  await expect(page.getByText("Northgate Logo is back")).toBeVisible();
  await page.goto(`${KIT}#kit-logo`);
  await settle(page);
  await expect(tile).toHaveAttribute("data-ground", "dark");

  // Files: upload a new font asset, then replace its file. The earlier file is kept as a version.
  await section(page, "files");
  await page.getByRole("button", { name: "Upload files" }).click();
  const up = page.getByRole("dialog", { name: "Upload to the Brand Kit" });
  await up.getByRole("textbox", { name: /^Name/ }).fill("Northgate Sans");
  await up.locator("input[type=file]").setInputFiles({ name: "NorthgateSans-Regular.woff2", mimeType: "font/woff2", buffer: Buffer.from("wOF2 regular") });
  await up.getByRole("button", { name: "Upload" }).click();
  await expect(up).toHaveCount(0);
  const font = page.getByRole("list", { name: "Files in Northgate Sans" });
  await expect(font).toContainText("NorthgateSans-Regular.woff2");
  await choose(page, () => font.getByRole("button", { name: "Replace NorthgateSans-Regular.woff2" }).click(),
    { name: "NorthgateSans-Regular.woff2", mimeType: "font/woff2", buffer: Buffer.from("wOF2 regular, hinted") });
  await expect(page.getByText(/Replaced NorthgateSans-Regular\.woff2\. The earlier file is kept/)).toBeVisible();
  await expect(font.getByRole("button", { name: "1 earlier version" })).toBeVisible();
  await axe(page, "files");

  // All of it is still there after a reload.
  await page.reload();
  await settle(page);
  await expect(font.getByRole("button", { name: "1 earlier version" })).toBeVisible();
  await section(page, "guidelines");
  await expect(guides.locator("[data-guide=link]")).toContainText("Northgate brand deck");
  await section(page, "legal");
  await expect(legal.locator("[data-legal=terms]")).toContainText("northgate-terms.pdf");
  await section(page, "videos");
  await expect(page.getByRole("list", { name: "Brand videos" })).toContainText("Spring intake film");

  // The exported guidelines carry the new sections, and leave out the empty ones.
  await page.goto("/guidelines/br4");
  await settle(page);
  for (const h of ["Brand tone", "Videos", "Social links", "Legal", "Guidelines documents"]) await expect(page.getByRole("heading", { name: h, level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Imagery", level: 2 })).toHaveCount(0);
  await expect(page.locator("[data-doc=logo-variations]")).toContainText("On dark");
  await expect(page.getByRole("link", { name: "Spring intake film" })).toHaveAttribute("href", "https://youtu.be/dQw4w9WgXcQ?t=42");
  await expect(page.getByRole("link", { name: "Terms and conditions" })).toHaveAttribute("href", /northgate-terms\.pdf$/);
  await expect(page.getByText("@northgateathletics · instagram.com/northgateathletics")).toBeVisible();
  await axe(page, "export");
});

test("everyone else reads the new parts, and the server refuses their saves", async ({ page }) => {
  // A viewer sees Northgate's kit, read only.
  await signIn(page, "Marta Vieira");
  await section(page, "social");
  await expect(page.getByRole("list", { name: "Social links" }).getByRole("listitem")).toHaveCount(4);
  await expect(page.getByRole("button", { name: /^(Edit links|Add social links)$/ })).toHaveCount(0);
  await section(page, "guidelines");
  await expect(page.locator("[data-guide=link]")).toContainText("Northgate brand deck");
  await expect(page.getByRole("button", { name: /^(Add|More for .*)$/ })).toHaveCount(0);
  await section(page, "legal");
  await expect(page.getByRole("list", { name: "Legal pages" }).getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^(Add a link|Upload a file|More for)/ })).toHaveCount(0);
  await section(page, "videos");
  await expect(page.getByRole("button", { name: /^(Add a video|More for)/ })).toHaveCount(0);
  await section(page, "logo");
  await expect(page.getByRole("button", { name: "Label variations" })).toHaveCount(0);
  await section(page, "files");
  await expect(page.getByRole("button", { name: /^(Upload files|Replace)/ })).toHaveCount(0);
  expect(await callAction(page, KIT, "app/actions.ts", "saveKitPart", [{ brandId: "br4", videos: [] }])).toContain("Your role does not allow that.");

  // An editor creates assets but does not edit the kit: no kit buttons, and the server says no.
  await signIn(page, "Ines Batz");
  await page.goto("/brands/br1/kit#kit-social");
  await settle(page);
  await expect(page.getByText("No social links yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Edit links|Add social links)$/ })).toHaveCount(0);
  await page.goto("/brands/br1/kit#kit-legal");
  await settle(page);
  await expect(page.getByText("No privacy policy or terms here yet.")).toBeVisible();
  await page.goto("/brands/br1/kit#kit-logo");
  await settle(page);
  await expect(page.getByRole("button", { name: "Label variations" })).toHaveCount(0);
  expect(await callAction(page, "/brands/br1/kit", "app/actions.ts", "saveKitPart", [{ brandId: "br1", social: [{ id: "s1", network: "website", url: "quokkaforgood.org" }] }]))
    .toContain("Your role does not allow that.");
  expect(await callAction(page, "/brands/br1/kit", "app/actions.ts", "saveKitPart", [{ brandId: "br1", logoVariants: { as16: "Primary" } }]))
    .toContain("Your role does not allow that.");
  // Nothing was saved.
  await page.goto("/");
  await page.goto("/brands/br1/kit#kit-social");
  await settle(page);
  await expect(page.getByText("No social links yet.")).toBeVisible();
});

test("the old Voice and Guidelines PDF anchors still land on their sections", async ({ page }) => {
  await signIn(page);
  await page.goto("/brands/br1/kit#kit-voice");
  await settle(page);
  await expect(page.getByRole("tablist", { name: "Brand kit sections" }).getByRole("tab", { name: "Brand tone" })).toHaveAttribute("aria-selected", "true");
  await page.goto("/brands/br1/kit#kit-pdf");
  await settle(page);
  await expect(page.getByRole("tablist", { name: "Brand kit sections" }).getByRole("tab", { name: "Guidelines" })).toHaveAttribute("aria-selected", "true");
});
