# Links: where each piece mounts

Three features, all ready to mount. Every component is a client component that
reads the workspace through `useApp()`, so it works anywhere inside the app
shell. Every server action re-checks sign-in, role, visibility and ownership,
so hiding a component is never the security.

Files:

| What | File |
|---|---|
| Link warning, "Check again" | `link-status.tsx` (`LinkStatus`, `CheckedAt`, `useCheckAgain`) |
| Broken links list | `broken-links-card.tsx` (`BrokenLinksCard`, `CheckBrandLinksButton`) |
| Page picture | `page-picture-button.tsx` (`PagePictureButton`, `canUsePagePicture`) |
| Tracked links | `utm-builder.tsx` (`UtmBuilder`, `TrackedLinksButton`, `utmDefaults`) |
| Server actions | `src/app/link-actions.ts` (`checkLinkNow`, `checkBrandLinks`, `usePagePicture`) |
| Rules (pure) | `src/lib/link-health.ts`, `src/lib/utm.ts`, `src/lib/page-meta.ts` |
| Server | `src/server/link-check.ts`, `src/server/page-picture.ts`, `src/server/link-fetcher.ts` |
| Daily run | `src/app/api/cron/links/route.ts` (docs/DEPLOY.md, "Daily link check") |

Preview with seed data: `/dev/links` (delete `src/app/(app)/dev/links/` before release).

## 1. `<LinkStatus asset variant? className? />`

Renders nothing unless the last check of the asset's *current* address failed
(an edited address hides the old result at once). Never checked, or opens:
nothing at all.

- **Asset cards** (`src/components/cards.tsx`, `AssetCard`): `variant="badge"`,
  inside the card's text block, after `<StatusLine a={a} />` in the
  `full`/`recent` variants:
  `<LinkStatus asset={a} variant="badge" className="mt-1" />`.
  The badge is plain `<span>`s with no button, so it is safe inside the card's
  big `<button>`.
- **Asset list rows** (brand Assets tab list view, offer page rows, search
  results if they show status): `variant="badge"` next to the status word.
- **Asset drawer header** (`src/components/drawer/asset-drawer.tsx`): the
  `line` variant (default), directly under the title/brand/version block and
  above the Status pills, alongside `ArchivedNote` / `ChangeNote`:
  `<LinkStatus asset={a} className="mb-4" />`.
  It shows "Link not responding (404) · checked 17 Oct, 09:00" and, for people
  with `edit`, a "Check again" text button.

## 2. `<BrokenLinksCard brandId? className? />`

Lists live, visible assets whose link stopped opening, newest result first,
five at a time with "Show all". Renders nothing when every link opens, so it can
be mounted unconditionally.

- **Dashboard** (`src/components/pages/street.tsx`): `<BrokenLinksCard />`
  with no brand, in the column with the review queue / "what is stuck" (it is a
  "show what is stuck" item, not a stat). Rows show the brand name.
- **Brand home** (`src/components/pages/brand.tsx`, `Home`):
  `<BrokenLinksCard brandId={b.id} />`. Includes sub-brands. Admins and
  managers also get a "Check all links" button in its header
  (`checkBrandLinks`, forced, at most 100 links / 45 seconds).
- `CheckBrandLinksButton brandId` can also go on its own (for example in the
  brand's settings or Ctas tab); it renders nothing without `structure`.

## 3. `<PagePictureButton asset onDone? variant? className? />`

"Use the page's picture": fetches the asset's page, takes its share image
(og:image, twitter:image, image_src, else the largest apple-touch-icon) and
stores it as the card thumbnail. Renders nothing unless the asset has a link
and I may upload a thumbnail for it (same rule as Change thumbnail).

- **Drawer thumbnail menu** (`src/components/thumbnail-picker.tsx`,
  `ThumbnailPicker`): add an optional `extra?: ReactNode` prop rendered in the
  button row after "Choose image" and the reset button
  (`<div className="mt-3.5 flex flex-wrap items-center gap-2">`), then pass it
  from the drawer and from `AssetCard`:
  `extra={<PagePictureButton asset={a} onDone={() => setPicking(false)} />}`.
  It is a secondary button, so "Choose image" stays the one primary. The
  panel's focus trap already includes it.
- `variant="menuitem"` gives a full-width row if it ever goes into a
  `CardMenu`-style list instead.

The daily run also does this by itself, once, for Landing page, Lead magnet
and Thank you page assets that have no thumbnail and no image file, the first
time their link opens.

## 4. `<UtmBuilder url offer? asset? cta? />` and `<TrackedLinksButton … />`

Builds the tracked link per channel (Meta, Instagram, Google Ads, LinkedIn,
Email, Organic social with a network picker, QR / print) plus a Custom row,
each with one Copy button (toast "Link copied"). Campaign defaults to the
offer's slug (`free-marketing-audit`), content to the asset's or CTA's slug;
both editable. Works for bare domains (`quokkaforgood.org/audit`). Nothing is
stored.

Use `TrackedLinksButton` (a secondary "Tracked links" button that opens the
builder in a native modal dialog; Escape closes it and focus returns) in rows:

- **Offer page, Key links rows** (`src/components/pages/offer.tsx`): for each
  linked entry/after asset with a URL (landing page, lead magnet, thank-you
  page):
  `<TrackedLinksButton url={a.url} offer={offer} asset={a} />`
- **CTA rows** (offer page primary/secondary CTA, brand Ctas tab):
  `<TrackedLinksButton url={cta.url} offer={offer} cta={cta} />` (on the brand
  tab, without `offer`). It renders nothing when the URL is empty or not a web
  address.

Use `UtmBuilder` directly when a panel already exists (for example a tab in the
drawer for landing pages): `<UtmBuilder url={a.url} asset={a} offer={offer} />`.
Give it a `key` of the URL if the same instance can switch between items, so
its fields reset.

## Notes for the lead

- `assets.linkCheck` rows also carry `url` (the address exactly as checked),
  typed as `StoredLinkCheck` in `src/lib/link-health.ts`. It is extra JSON in
  the existing column, not a schema change; consider adding `url?: string` to
  `LinkCheck` in `schema.ts` and then using `LinkCheck` directly.
- The daily run's history lines and pictures are attributed to the id
  `link-checker` (`LINK_CHECKER` in `src/server/link-fetcher.ts`), which
  `ws.user()` shows as "Unassigned". If you want it to read "BrandOS", map that
  id in `ws.ts`. Routine checks write no history at all; only a link that
  opened and then stops opening does ("found a broken link on").
- `e2e/links-features.spec.ts` needs the dev server started with
  `BRANDOS_ALLOW_PRIVATE_FETCH=1` (honoured only outside production) so the
  checks may reach the test's own little server on 127.0.0.1. The last test
  (daily run) runs only when `CRON_SECRET` is given to the test process, because
  it also opens the seed data's real-world addresses.
- After mounting, the spec's `/dev/links` steps move to the real pages: the
  drawer for `LinkStatus` and the page picture, the dashboard for
  `BrokenLinksCard`, the offer page for tracked links.
