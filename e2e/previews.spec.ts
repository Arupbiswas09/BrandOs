import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { settle, signIn } from "./helpers";
import { callAction } from "./server-action";
import { EMBED_ORIGINS, linkEmbed, linkPreview, linkSource } from "../src/lib/embeds";

/*
 * Previews of Google files, Drive folders, PDFs and videos, where people add
 * them (the asset form) and where they look at them (the asset panel). The
 * third-party pages are stood in for by the test, so nothing here depends on
 * Google or YouTube answering.
 */

test.use({ viewport: { width: 1440, height: 940 } });

/** Partner Co-Marketing (Quokka For Good): the offer the file specs use, so other specs' counts stay as they are. */
const OFFER = "of16";
const PAGE = `/offers/${OFFER}`;

/** Ids the length Google's are: a Doc's 44 characters, a Drive file's or folder's 33. */
const DOC = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdEF";
const FILE = "1aBcDeFgHiJkLmNoPqRsTuVwXyZ012345";
const PUB = "2PACX-1vRaBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
const FORM = "1FAIpQLSdAbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdEFghIjK";

const run = () => Math.random().toString(36).slice(2, 7);

/** A small page standing in for Google, YouTube and the rest inside the frames. */
const STAND_IN = '<!doctype html><html lang="en"><head><title>Stand-in preview</title></head><body><main><h1>Stand-in preview</h1><p>What the site would show.</p></main></body></html>';

async function standIns(page: Page, privateDoc?: string) {
  await page.route(/^https:\/\/(docs\.google\.com|drive\.google\.com|www\.youtube-nocookie\.com|player\.vimeo\.com|www\.loom\.com|www\.figma\.com)\//, (r) => r.fulfill({ status: 200, contentType: "text/html", body: STAND_IN }));
  await page.route(/^https:\/\/accounts\.google\.com\//, (r) => r.fulfill({ status: 200, contentType: "text/html", body: STAND_IN, headers: { "x-frame-options": "DENY" } }));
  // A private file: Google sends anyone not signed in on to its sign-in page, which the page's policy does not frame.
  // Registered last, because the route added last is the one asked first.
  if (privateDoc) await page.route(new RegExp(`^https://docs\\.google\\.com/document/d/${privateDoc}/`), (r) => r.fulfill({ status: 302, headers: { location: "https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fdocs.google.com%2F" } }));
}

/** A brand asset that is a link, made the way the asset form makes it. */
async function linkAsset(page: Page, name: string, type: string, url: string) {
  const body = await callAction(page, PAGE, "app/actions.ts", "saveAsset", [{ brandId: "br1", name, type, url, offerIds: [OFFER] }]);
  expect(body).toContain('"ok":true');
  return body.match(/"id":"(as[a-z0-9]+)"/)![1];
}

test("linkEmbed reads every form of Google, Drive, YouTube, Vimeo and Loom link people paste", () => {
  const src = (u: string) => linkEmbed(u)?.src ?? null;

  // Drive folders: with the account slot (/u/2/), the phone view, a resource key, the old folderview, a shared drive.
  const folder = `https://drive.google.com/embeddedfolderview?id=${FILE}#list`;
  expect(src(`https://drive.google.com/drive/folders/${FILE}?usp=sharing`)).toBe(folder);
  expect(src(`drive.google.com/drive/u/2/folders/${FILE}`)).toBe(folder);
  expect(src(`https://drive.google.com/drive/u/0/mobile/folders/${FILE}`)).toBe(folder);
  expect(src(`https://drive.google.com/drive/mobile/folders/${FILE}?usp=drive_link`)).toBe(folder);
  expect(src(`https://drive.google.com/folderview?id=${FILE}`)).toBe(folder);
  expect(src(`https://drive.google.com/drive/u/1/folders/${FILE}?resourcekey=0-AbC_dE`)).toBe(`https://drive.google.com/embeddedfolderview?id=${FILE}&resourcekey=0-AbC_dE#list`);
  expect(src("https://drive.google.com/drive/folders/0ABcdEfGhIjKlUk9PVA")).toBe("https://drive.google.com/embeddedfolderview?id=0ABcdEfGhIjKlUk9PVA#list");
  expect(linkEmbed(`drive.google.com/drive/u/2/folders/${FILE}`)).toMatchObject({ provider: "Google Drive", kind: "folder", label: "Drive folder", open: "Open in Google Drive", shape: "page", signIn: true });

  // Drive files, PDFs among them: every way Drive hands out a link to one.
  const file = `https://drive.google.com/file/d/${FILE}/preview`;
  for (const u of [
    `https://drive.google.com/file/d/${FILE}/view?usp=drive_link`,
    `https://drive.google.com/file/d/${FILE}/view?usp=sharing`,
    `https://drive.google.com/file/d/${FILE}`,
    `https://drive.google.com/file/u/1/d/${FILE}/view`,
    `https://drive.google.com/a/agency.org/file/d/${FILE}/view`,
    `https://drive.google.com/open?id=${FILE}`,
    `https://drive.google.com/uc?export=download&id=${FILE}`,
    `https://drive.google.com/u/0/uc?id=${FILE}&export=download`,
    `https://drive.usercontent.google.com/download?id=${FILE}&export=download&authuser=0`,
    `https://drive.usercontent.google.com/u/2/uc?id=${FILE}&export=download`,
    `https://docs.google.com/file/d/${FILE}/edit`,
  ]) expect(src(u), u).toBe(file);
  expect(src(`https://drive.google.com/file/d/${FILE}/view?usp=sharing&resourcekey=0-XyZ`)).toBe(`${file}?resourcekey=0-XyZ`);

  // Docs, Sheets and Slides: with the account slot, an old Workspace domain, tabs, sheet and slide anchors.
  const doc = `https://docs.google.com/document/d/${DOC}/preview`;
  for (const u of [
    `https://docs.google.com/document/d/${DOC}/edit`,
    `https://docs.google.com/document/u/1/d/${DOC}/edit?usp=sharing`,
    `https://docs.google.com/document/d/${DOC}/edit?tab=t.0#heading=h.abc123`,
    `https://docs.google.com/a/agency.org/document/d/${DOC}/edit`,
    `docs.google.com/document/d/${DOC}`,
  ]) expect(src(u), u).toBe(doc);
  expect(linkEmbed(`https://docs.google.com/document/d/${DOC}/edit`)).toMatchObject({ provider: "Google Docs", kind: "doc", label: "Google Doc", open: "Open in Google Docs", signIn: true });
  // A Word file kept in Drive and opened in Docs previews as the Drive file it is.
  expect(linkEmbed(`https://docs.google.com/document/d/${DOC}/edit?usp=sharing&ouid=1&rtpof=true&sd=true`)).toMatchObject({ provider: "Google Docs", src: `https://drive.google.com/file/d/${DOC}/preview` });
  expect(src(`https://docs.google.com/spreadsheets/d/${DOC}/edit#gid=0`)).toBe(`https://docs.google.com/spreadsheets/d/${DOC}/preview`);
  expect(src(`https://docs.google.com/spreadsheets/u/0/d/${DOC}/htmlview`)).toBe(`https://docs.google.com/spreadsheets/d/${DOC}/preview`);
  expect(src(`https://docs.google.com/presentation/d/${DOC}/edit#slide=id.p`)).toBe(`https://docs.google.com/presentation/d/${DOC}/preview`);
  expect(src(`https://docs.google.com/presentation/d/${DOC}/edit?usp=sharing#slide=id.g2b1c`)).toBe(`https://docs.google.com/presentation/d/${DOC}/preview`);
  expect(linkEmbed(`https://docs.google.com/spreadsheets/d/${DOC}/edit#gid=0`)?.provider).toBe("Google Sheets");
  expect(linkEmbed(`https://docs.google.com/presentation/d/${DOC}/edit#slide=id.p`)?.provider).toBe("Google Slides");

  // Published to the web.
  expect(src(`https://docs.google.com/document/d/e/${PUB}/pub`)).toBe(`https://docs.google.com/document/d/e/${PUB}/pub?embedded=true`);
  expect(src(`https://docs.google.com/spreadsheets/d/e/${PUB}/pubhtml`)).toBe(`https://docs.google.com/spreadsheets/d/e/${PUB}/pubhtml?widget=true&headers=false`);
  expect(src(`https://docs.google.com/presentation/d/e/${PUB}/pub?start=false&loop=false&delayms=3000`)).toBe(`https://docs.google.com/presentation/d/e/${PUB}/embed?start=false&loop=false`);

  // Forms: the link people share, and the editor's.
  expect(linkEmbed(`https://docs.google.com/forms/d/e/${FORM}/viewform?usp=sf_link`)).toMatchObject({ provider: "Google Forms", label: "Google Form", src: `https://docs.google.com/forms/d/e/${FORM}/viewform?embedded=true` });
  expect(src(`https://docs.google.com/forms/d/${DOC}/edit`)).toBe(`https://docs.google.com/forms/d/${DOC}/viewform?embedded=true`);

  // Not a file: Drive's own pages, and ids too short to be Google's.
  for (const u of [
    "https://drive.google.com/drive/my-drive", "https://drive.google.com/drive/u/0/home", "https://drive.google.com/drive/shared-with-me",
    "https://docs.google.com/document/d/short/edit", "https://drive.google.com/drive/folders/abc", "https://docs.google.com/document/u/0/",
  ]) expect(linkEmbed(u), u).toBeNull();

  // YouTube: share links with ?si=, Shorts (which stand tall), live, the phone site, start times, playlists.
  const yt = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
  for (const u of [
    "https://youtu.be/dQw4w9WgXcQ?si=AbCdEf12345", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx&index=2", "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/live/dQw4w9WgXcQ?si=x", "https://www.youtube.com/embed/dQw4w9WgXcQ", "https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
    "youtube.com/watch?app=desktop&v=dQw4w9WgXcQ",
  ]) expect(src(u), u).toBe(yt);
  expect(linkEmbed("https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share")).toMatchObject({ src: yt, shape: "portrait", label: "YouTube Short" });
  expect(src("https://youtu.be/dQw4w9WgXcQ?si=x&t=95")).toBe(`${yt}?start=95`);
  expect(src("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s")).toBe(`${yt}?start=90`);
  expect(src("https://www.youtube.com/playlist?list=PLAbCdEfGhIjKlMnOp")).toBe("https://www.youtube-nocookie.com/embed/videoseries?list=PLAbCdEfGhIjKlMnOp");
  expect(linkEmbed("https://www.youtube.com/@quokkaforgood")).toBeNull();
  expect(linkEmbed("https://youtu.be/tooshort")).toBeNull();

  // Vimeo: plain, unlisted (with its hash in the path or ?h=), review and manage links, channels and showcases; not live events.
  expect(src("https://vimeo.com/76979871")).toBe("https://player.vimeo.com/video/76979871?dnt=1");
  expect(src("https://vimeo.com/76979871/8272103f6e")).toBe("https://player.vimeo.com/video/76979871?dnt=1&h=8272103f6e");
  expect(src("https://vimeo.com/76979871?share=copy")).toBe("https://player.vimeo.com/video/76979871?dnt=1");
  expect(src("https://player.vimeo.com/video/76979871?h=8272103f6e&badge=0")).toBe("https://player.vimeo.com/video/76979871?dnt=1&h=8272103f6e");
  expect(src("https://vimeo.com/user1234567/review/76979871/8272103f6e")).toBe("https://player.vimeo.com/video/76979871?dnt=1&h=8272103f6e");
  expect(src("https://vimeo.com/manage/videos/76979871")).toBe("https://player.vimeo.com/video/76979871?dnt=1");
  expect(src("https://vimeo.com/channels/1234567/76979871")).toBe("https://player.vimeo.com/video/76979871?dnt=1");
  expect(src("https://vimeo.com/showcase/1234567/video/76979871")).toBe("https://player.vimeo.com/video/76979871?dnt=1");
  expect(linkEmbed("https://vimeo.com/event/1234567")).toBeNull();
  expect(linkEmbed("https://vimeo.com/showcase/1234567")).toBeNull();

  // Loom: the share link, with a session id or a title in it.
  const loom = "https://www.loom.com/embed/0123456789abcdef0123456789abcdef";
  expect(src("https://www.loom.com/share/0123456789abcdef0123456789abcdef")).toBe(loom);
  expect(src("https://www.loom.com/share/0123456789abcdef0123456789abcdef?sid=1a2b3c")).toBe(loom);
  expect(src("https://www.loom.com/share/Homepage-walkthrough-0123456789abcdef0123456789abcdef")).toBe(loom);
  expect(linkEmbed("https://www.loom.com/share/folder/abc")).toBeNull();

  // Every frame comes from one of the origins the page's policy allows.
  for (const u of [`drive.google.com/drive/u/2/folders/${FILE}`, `https://docs.google.com/forms/d/e/${FORM}/viewform`, "https://youtu.be/dQw4w9WgXcQ", "https://vimeo.com/76979871", "https://www.loom.com/share/0123456789abcdef0123456789abcdef", "https://www.figma.com/design/AbCdEf123456/Home"]) {
    const s = linkEmbed(u)!.src;
    expect(EMBED_ORIGINS.some((o) => s.startsWith(`${o}/`)), s).toBe(true);
  }

  // A PDF on another website cannot be framed: it is named as a PDF, to open. A web page is neither.
  expect(linkPreview("https://www.example.org/files/Annual%20Report.PDF?v=2")).toEqual({ type: "pdf", href: "https://www.example.org/files/Annual%20Report.PDF?v=2" });
  expect(linkPreview("https://quokkaforgood.org/audit")).toBeNull();
  expect(linkSource("https://www.example.org/report.pdf")).toMatchObject({ label: "PDF", kind: "pdf" });
  expect(linkSource("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({ label: "YouTube", kind: "video", open: "Open on YouTube" });
  expect(linkSource(`https://docs.google.com/document/d/${DOC}/edit`)).toMatchObject({ label: "Google Doc", kind: "doc" });
  expect(linkSource("javascript:alert(1)")).toBeNull();
});

test("a new video takes a YouTube link up front, plays it in the form, and again in its panel", async ({ page }) => {
  await standIns(page);
  await signIn(page);
  await page.goto(PAGE);
  await settle(page);
  const id = run();
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menu", { name: "New" }).getByRole("menuitem", { name: /New asset/ }).click();
  const form = page.getByRole("dialog", { name: "What are you making?" });
  await form.getByRole("button", { name: /^VID\s*Video$/ }).click();
  const video = page.getByRole("dialog", { name: "New video" });
  // Name, then the link, then files: the link is not behind More detail.
  const link = video.getByRole("textbox", { name: /^Video link/ });
  await expect(link).toBeVisible();
  await expect(video.getByRole("button", { name: /^More detail/ })).toHaveAttribute("aria-expanded", "false");
  await video.getByRole("textbox", { name: /^Asset name/ }).fill(`Launch film ${id}`);

  // Something it cannot play says so, calmly; a YouTube share link plays right under the field.
  await link.fill("https://www.tiktok.com/@quokka/video/7301234567890123456");
  await expect(video.getByText("No player for this site. The link still opens from the asset.")).toBeVisible();
  await link.fill("https://youtu.be/dQw4w9WgXcQ?si=AbCdEf12345");
  const player = video.locator('figure[data-provider="YouTube"] iframe');
  await expect(player).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  await expect(player).toHaveAttribute("title", "YouTube video preview");
  await expect(video.getByText("No player for this site")).toHaveCount(0);
  await video.getByRole("button", { name: "Save asset" }).click();

  // The panel opens on the new video with its player already showing.
  const drawer = page.getByRole("dialog", { name: `Launch film ${id}` });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Hide preview" })).toHaveAttribute("aria-expanded", "true");
  const frame = drawer.locator('figure[data-provider="YouTube"]');
  await expect(frame.locator("iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  await expect(frame).toHaveAttribute("data-state", "shown");
  await expect(frame.getByRole("link", { name: "Open on YouTube" })).toHaveAttribute("href", "https://youtu.be/dQw4w9WgXcQ?si=AbCdEf12345");
  await expect(drawer.getByText("Campaign asset · Video")).toContainText("YouTube");

  // On the offer's card it reads as a YouTube video, from a drawn icon, not a picture fetched from YouTube.
  await page.keyboard.press("Escape");
  const card = page.getByRole("button", { name: new RegExp(`^Video Launch film ${id}`) });
  await expect(card).toContainText("YouTube");
  await expect(card.locator("img")).toHaveCount(0);
});

test("a Drive folder link with an account slot (/u/2/) shows the folder's files as soon as the panel opens", async ({ page }) => {
  await standIns(page);
  await signIn(page);
  const url = `https://drive.google.com/drive/u/2/folders/${FILE}?usp=sharing`;
  const a = await linkAsset(page, `Source files ${run()}`, "Drive link", url);
  await page.goto(`${PAGE}?asset=${a}`);
  await settle(page);
  const drawer = page.getByRole("dialog");
  const frame = drawer.locator('figure[data-provider="Google Drive"]');
  await expect(frame.locator("iframe")).toHaveAttribute("src", `https://drive.google.com/embeddedfolderview?id=${FILE}#list`);
  await expect(frame.locator("iframe")).toHaveAttribute("title", "Drive folder preview");
  // However it ends up, the way out is right there, and so is why it might be empty.
  await expect(frame.getByRole("link", { name: "Open in Google Drive" })).toHaveAttribute("href", url);
  await expect(frame.getByText("Private files show here only when you're signed in to Google with an account that can see them.")).toBeVisible();
  await expect(drawer.getByText("Campaign asset · Drive link")).toContainText("Drive folder");
});

test("a Google Doc previews in the panel: open by default on a document, one click away on anything else", async ({ page }) => {
  await standIns(page);
  await signIn(page);
  const url = `https://docs.google.com/document/u/1/d/${DOC}/edit?usp=sharing`;
  const docAsset = await linkAsset(page, `Brief ${run()}`, "Document", url);
  await page.goto(`${PAGE}?asset=${docAsset}`);
  await settle(page);
  let drawer = page.getByRole("dialog");
  const frame = drawer.locator('figure[data-provider="Google Docs"]');
  await expect(frame.locator("iframe")).toHaveAttribute("src", `https://docs.google.com/document/d/${DOC}/preview`);
  await expect(frame).toHaveAttribute("data-state", "shown");
  await expect(frame.getByRole("button", { name: "Full screen" })).toBeVisible();
  await expect(frame.getByRole("link", { name: "Open in Google Docs" })).toHaveAttribute("href", url);

  // Where the Doc is changed, the form: its link is up front, and the same preview is one click under it.
  await drawer.getByRole("button", { name: "Edit", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Edit asset" });
  await expect(form.getByRole("textbox", { name: /^Doc link/ })).toHaveValue(url);
  await expect(form.locator("iframe")).toHaveCount(0);
  await form.getByRole("button", { name: "Preview the Google Doc" }).click();
  await expect(form.locator('figure[data-provider="Google Docs"] iframe')).toHaveAttribute("src", `https://docs.google.com/document/d/${DOC}/preview`);
  await expect(form.getByRole("button", { name: "Hide preview" })).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");

  // A post that points at a Doc: folded until asked, then one click shows it. Nothing from Google loads before.
  const post = await linkAsset(page, `Post copy ${run()}`, "Social post", `https://docs.google.com/spreadsheets/d/${DOC}/edit#gid=0`);
  const asked: string[] = [];
  page.on("request", (r) => { if (/google\.com/.test(r.url())) asked.push(r.url()); });
  await page.goto(`${PAGE}?asset=${post}`);
  await settle(page);
  drawer = page.getByRole("dialog");
  await expect(drawer.locator("iframe")).toHaveCount(0);
  expect(asked).toEqual([]);
  await drawer.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(drawer.locator('figure[data-provider="Google Sheets"] iframe')).toHaveAttribute("src", `https://docs.google.com/spreadsheets/d/${DOC}/preview`);
});

test("a private Google file says to sign in, with Open in Google Docs, never a blank frame", async ({ page }) => {
  const priv = "1PrIvAtEdOcUmEnTiDfOrThEsIgNiNcHeCkXyZ012345";
  await standIns(page, priv);
  await signIn(page);
  const url = `https://docs.google.com/document/d/${priv}/edit`;
  const a = await linkAsset(page, `Private brief ${run()}`, "Document", url);
  await page.goto(`${PAGE}?asset=${a}`);
  await settle(page);
  const frame = page.getByRole("dialog").locator('figure[data-provider="Google Docs"]');
  await expect(frame).toHaveAttribute("data-state", "sign-in");
  await expect(frame.locator("iframe")).toHaveCount(0);
  await expect(frame.getByRole("status")).toContainText("Sign in to Google to see it here");
  await expect(frame.getByRole("status")).toContainText("This document is private.");
  await expect(frame.getByRole("status").getByRole("link", { name: "Open in Google Docs" })).toHaveAttribute("href", url);
  // Trying again asks Google afresh (and here is turned away again).
  await frame.getByRole("button", { name: "Try again" }).click();
  await expect(frame).toHaveAttribute("data-state", "sign-in");
});

test("a PDF on another website is a card that opens it, not a broken frame", async ({ page }) => {
  await signIn(page);
  const url = "https://www.example.org/files/annual-report-2025.pdf";
  const a = await linkAsset(page, `Annual report ${run()}`, "Document", url);
  await page.goto(`${PAGE}?asset=${a}`);
  await settle(page);
  const drawer = page.getByRole("dialog");
  const card = drawer.locator('figure[data-preview="pdf-link"]');
  await expect(card).toContainText("annual-report-2025.pdf");
  await expect(card).toContainText("A PDF on example.org. It can't be shown inside BrandOS, so it opens in a new tab.");
  await expect(card.getByRole("link", { name: "Open the PDF" })).toHaveAttribute("href", url);
  await expect(drawer.locator("iframe")).toHaveCount(0);
});

test("the panel with a preview open meets WCAG 2.2 AA, at 1440 and 390", async ({ page }) => {
  await standIns(page);
  await signIn(page);
  const tags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
  const doc = await linkAsset(page, `Brief ${run()}`, "Document", `https://docs.google.com/document/d/${DOC}/edit`);
  const pdf = await linkAsset(page, `Report ${run()}`, "Document", "https://www.example.org/report.pdf");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const a of [doc, pdf]) {
      await page.goto(`${PAGE}?asset=${a}`);
      await settle(page);
      await expect(page.getByRole("dialog").locator("figure[data-preview]")).toBeVisible();
      const r = await new AxeBuilder({ page }).withTags(tags).analyze();
      const problems = r.violations.map((v) => `${width} ${a}: ${v.id} (${v.impact}) × ${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      expect(problems, problems.join("\n")).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    }
  }
});
