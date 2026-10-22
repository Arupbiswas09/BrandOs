import { expect, test, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";

/*
 * Every action on an asset can be found where people look for it, by every
 * role that may do it, at desktop and phone sizes: taking a file off and
 * putting it back, unlinking, restoring from the archive, cloning a library
 * master, and the "…" menus of cards and rows. Roles are only offered what
 * the server allows them.
 */

/** Partner Co-Marketing (Quokka For Good): an offer no other spec counts, so the assets made here change nothing elsewhere. */
const OFFER = "of16";
const PAGE = `/offers/${OFFER}`;
const run = () => Date.now().toString(36);

/** A tiny valid PNG. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n", "latin1");

/** One asset made through the bulk route with its stored file, in this offer (or the Global Library with `library`). */
async function makeAsset(page: Page, name: string, opts: { library?: boolean } = {}) {
  const files = { name, mimeType: "image/png", buffer: PNG };
  const res = await page.request.post("/api/bulk-assets", {
    multipart: opts.library ? { brandId: "", type: "auto", files } : { brandId: "br1", offerId: OFFER, type: "auto", files },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).assets[0] as { id: string; name: string; file: { key: string; url: string; name: string } };
}

async function addFile(page: Page, assetId: string, name: string) {
  const res = await page.request.post(`/api/assets/${assetId}/files`, { multipart: { file: { name, mimeType: "application/pdf", buffer: PDF } } });
  expect(res.status()).toBe(200);
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("taking a file off an asset asks first, says how to undo it, and History puts it back", async ({ page }) => {
    await signIn(page);
    await page.goto(PAGE);
    const id = run();
    const a = await makeAsset(page, `${id}-cover.png`);
    await addFile(page, a.id, `${id}-brief.pdf`);
    await page.goto(`${PAGE}?asset=${a.id}`);
    await settle(page);
    const drawer = page.getByRole("dialog").first();
    const files = drawer.getByRole("list", { name: "Attached files" });
    const remove = files.getByRole("button", { name: `Remove ${id}-brief.pdf` });

    // In plain sight, not only on hover.
    await expect(remove).toBeVisible();
    expect(await remove.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");

    // It asks first; Escape and Cancel leave the file where it is.
    await remove.click();
    const ask = drawer.getByRole("group", { name: `Remove ${id}-brief.pdf` });
    await expect(ask).toContainText("History keeps the version with it, so it can be put back.");
    await page.keyboard.press("Escape");
    await expect(ask).toHaveCount(0);
    await expect(drawer).toBeVisible();
    await remove.click();
    await ask.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByText(`Removed ${id}-brief.pdf. To put it back, restore the version before in History.`)).toBeVisible();
    await page.reload();
    await settle(page);
    await expect(files.locator(`[data-file="${id}-brief.pdf"]`)).toHaveCount(0);

    // The version before is in History, and restoring it brings the file back, still downloadable.
    await drawer.getByRole("tab", { name: "History" }).click();
    await drawer.getByRole("button", { name: "Restore" }).first().click();
    await expect(page.getByText(/^Restored v\d+\./)).toBeVisible();
    await expect(files.locator(`[data-file="${id}-brief.pdf"]`)).toBeVisible();
    const href = (await files.getByRole("link", { name: `Download ${id}-brief.pdf` }).getAttribute("href"))!;
    expect((await page.request.get(href)).status()).toBe(200);

    // Unlinking is a real button, and an archived asset can be restored from its note.
    await drawer.getByRole("tab", { name: "Overview" }).click();
    await expect(drawer.getByRole("button", { name: "Unlink from Partner Co-Marketing" })).toBeVisible();
    await drawer.getByRole("button", { name: "More asset actions" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await expect(drawer.getByText("Archived. Offers that link to it still show it, greyed out.")).toBeVisible();
    await drawer.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(drawer.getByText("Archived. Offers that link to it still show it, greyed out.")).toHaveCount(0);
  });

  test("an asset card on an offer offers what the asset's own menu does, and Unlink from this offer", async ({ page }) => {
    await signIn(page);
    await page.goto(PAGE);
    const id = run();
    const a = await makeAsset(page, `${id}-card.png`);
    await page.goto(`${PAGE}?tab=assets`);
    await settle(page);
    await page.getByRole("button", { name: `More for ${a.name}` }).click();
    await expect(page.getByRole("menu", { name: `More for ${a.name}` }).getByRole("menuitem"))
      .toHaveText(["Change thumbnail", "Clone", "Link to offers", "Unlink from this offer", "Archive", "Delete"]);
    await page.getByRole("menuitem", { name: "Unlink from this offer" }).click();
    await expect(page.getByText(`Unlinked ${a.name} from Partner Co-Marketing. It is still in Quokka For Good's assets.`)).toBeVisible();
    await expect(page.getByRole("button", { name: `More for ${a.name}` })).toHaveCount(0);
  });

  test("the Global Library keeps its own permission: editors clone a master, and the server refuses changes to it", async ({ page }) => {
    await signIn(page);
    await page.goto("/library");
    const id = run();
    const lib = await makeAsset(page, `${id}-master.png`, { library: true });
    await addFile(page, lib.id, `${id}-notes.pdf`);
    expect(await callAction(page, "/library", "app/actions.ts", "removeFile", [lib.id, `${id}-notes.pdf`])).toContain('"ok":true');
    const versions = await callAction(page, "/library", "app/actions.ts", "listVersions", [lib.id]);
    const versionId = versions.match(/"id":"(av[A-Za-z0-9]+)"/)![1];

    // Tags of a library item can be edited too (CTAs belong to brands; tags do not).
    await page.goto(`/library?asset=ck1`);
    await settle(page);
    await page.getByRole("dialog").first().getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Tags" })).toBeVisible();
    await page.keyboard.press("Escape");

    // An editor: Clone is there, changing the master is not, and the server agrees.
    await signIn(page, "Ines Batz");
    await page.goto("/library?asset=ck1&assetTab=list");
    await settle(page);
    const drawer = page.getByRole("dialog").first();
    await expect(drawer.getByRole("textbox", { name: "Add a check" })).toHaveCount(0);
    await expect(drawer.getByRole("button", { name: "Move up" })).toHaveCount(0);
    await drawer.getByRole("button", { name: "More asset actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Clone" })).toBeVisible();
    await page.keyboard.press("Escape");
    const refused = "Only managers and admins can change the Global Library.";
    expect(await callAction(page, "/library", "app/actions.ts", "addItem", ["ck1", "One more check"])).toContain(refused);
    expect(await callAction(page, "/library", "app/actions.ts", "restoreVersion", [lib.id, versionId])).toContain(refused);
    expect(await callAction(page, "/library", "app/actions.ts", "removeFile", [lib.id, lib.file.name])).toContain(refused);
  });

  test("a contributor is offered only what they may do: clone into a brand, link their own assets", async ({ page }) => {
    await signIn(page, "Leo Park");
    // Someone else's library checklist: no copy editor and no library in the brand chooser, but Clone.
    await page.goto("/library?asset=ck1&assetTab=copy");
    await settle(page);
    const drawer = page.getByRole("dialog").first();
    await expect(drawer.getByRole("button", { name: "Write the copy" })).toHaveCount(0);
    await drawer.getByRole("button", { name: "More asset actions" }).click();
    await page.getByRole("menuitem", { name: "Clone" }).click();
    const clone = page.getByRole("dialog", { name: "Clone and adapt" });
    await expect(clone.getByRole("option", { name: /Global Library/ })).toHaveCount(0);
    await expect(clone.getByRole("button", { name: "Create clone" })).toBeDisabled();
    await clone.getByRole("combobox").selectOption({ label: "Quokka For Good" });
    await expect(clone.getByRole("button", { name: "Create clone" })).toBeEnabled();
    await clone.getByRole("button", { name: "Cancel" }).click();

    await page.goto("/");
    await settle(page);
    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.getByRole("menuitem", { name: /New asset/ }).click();
    await page.getByRole("button", { name: "CHK Checklist" }).click();
    await expect(page.getByRole("button", { name: /Quokka For Good/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /No brand: put it in the Global Library/ })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Their own new offer: the empty Assets tab shows the ways forward, and only their own assets can be linked.
    const body = await callAction(page, "/brands/br1/offers", "app/actions.ts", "saveOffer", [{ brandId: "br1", name: `Leo ${run()}` }]);
    const offerId = body.match(/"id":"(of[A-Za-z0-9]+)"/)![1];
    await page.goto(`/offers/${offerId}?tab=assets`);
    await settle(page);
    const tab = page.getByRole("tabpanel", { name: /^Assets/ });
    await expect(tab.getByRole("button", { name: "New asset" })).toBeVisible();
    await tab.getByRole("button", { name: "Link existing asset" }).click();
    const link = page.getByRole("dialog", { name: /^Link an asset to Leo/ });
    await expect(link.getByText("You can link the assets you own. To link someone else's, ask its owner or an editor.")).toBeVisible();
    // Someone else's asset says whose it is instead of offering a Link the server would refuse.
    const theirs = link.getByText(/^Owned by /).first();
    await expect(theirs).toBeVisible();
    await expect(theirs.locator("xpath=..").getByRole("button")).toHaveCount(0);
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("an asset row's … menu is there on a phone, and checklist controls show without hover", async ({ page }) => {
    await signIn(page);
    await page.goto("/brands/br1/assets");
    await settle(page);
    const more = page.getByRole("button", { name: "More for Free Audit Landing Page" });
    await expect(more).toBeVisible();
    await more.click();
    await expect(page.getByRole("menu", { name: "More for Free Audit Landing Page" }).getByRole("menuitem"))
      .toHaveText(["Change thumbnail", "Clone", "Link to offers", "Archive", "Delete"]);
    await page.keyboard.press("Escape");

    await page.goto("/library?asset=ck2&assetTab=list");
    await settle(page);
    const down = page.getByRole("dialog").first().getByRole("button", { name: "Move down" }).first();
    await expect(down).toBeVisible();
    expect(await down.evaluate((el) => getComputedStyle(el.parentElement!).opacity)).toBe("1");

    // Upload files says so in words on a phone too.
    await page.goto(`${PAGE}?tab=assets`);
    await settle(page);
    await expect(page.getByRole("button", { name: "Upload files" })).toHaveText("Upload files");
  });
});
