# Onboarding: mounting notes

Two features, both already live as their own pages:

| Page | File | What it is |
| --- | --- | --- |
| `/brands/new/from-website` | `src/app/(app)/brands/new/from-website/page.tsx` | Start a brand from its website (`FromWebsite`) |
| `/import` | `src/app/(app)/import/page.tsx` | Import offers, assets or Drive links (`ImportFlow`) |

Nothing in the existing screens was edited. What is left for the lead is linking
to these pages from the redesigned screens, below. The dev preview
`src/app/(app)/dev/onboarding/page.tsx` (and `preview.tsx` next to it) shows every
piece with the demo data; delete both before release.

## Links into the pages

Build links with the helpers in `entry-points.tsx`, never by hand:

- `fromWebsiteHref(clientId?)` → `/brands/new/from-website[?client=cl1]` (pre-picks that client)
- `importHref({ brandId?, kind?: "offers" | "assets", mode?: "sheet" | "drive", offerId? })` → `/import?brand=br1&kind=assets…`

Query parameters the pages read: from-website `client`, `url` (pre-fills the field, never auto-scans);
import `brand`, `kind`, `mode=drive`, `offer` (Drive links: pre-picks the offer to link to).

## 1. Header "+ New" menu (`src/components/app/new-menu.tsx`)

```tsx
import { useOnboardingMenuItems } from "@/components/features/onboarding/entry-points";
const extra = useOnboardingMenuItems({ brandId: h.brand?.id, clientId: h.clientId }); // h = whereAmI(ws, pathname)
```

Each item is `{ key, label, hint, icon, href }` and only appears when the person may use it
("Brand from a website" needs `structure`; "Import from a spreadsheet" needs `edit` and a brand).
They navigate (`router.push(item.href)` or a `Link` with `role="menuitem"`) rather than opening a modal.
Put them last, after "New client", under a thin divider. Labels: **Brand from a website**,
**Import from a spreadsheet**. Note `e2e/new-menu.spec.ts` asserts the exact item list; add the two
labels there.

## 2. Brand Offers and Assets tabs (`src/components/pages/brand.tsx`)

A quiet text link next to the tab's own primary action ("+ New offer" / "+ Add asset"),
never a second primary button:

```tsx
import { ImportLink } from "@/components/features/onboarding/entry-points";
<ImportLink brandId={b.id} kind="offers" />   // Offers tab
<ImportLink brandId={b.id} kind="assets" />   // Assets tab
```

It renders nothing for people who cannot edit.

## 3. Empty workspace dashboard (`src/components/pages/street.tsx`)

When the person can see no brands (or no offers and assets yet), show under the empty
state's sentence:

```tsx
import { StartFromExisting } from "@/components/features/onboarding/entry-points";
<StartFromExisting />
```

Two cards ("Start a brand from its website", "Import from a spreadsheet"), each only for
people allowed to do it; it renders nothing otherwise.

## 4. Shell details for the lead

- Breadcrumbs: `parsePath("/brands/new/from-website")` reads as brand `new`, so the crumb says
  "Dashboard › Brand". Map `brands/new/*` to "Dashboard › New brand" and `/import` to
  "Dashboard › Import" in `useCrumbs` (`src/components/app/shell.tsx`).
- Optional: a "Start from a website" link on a client page (`fromWebsiteHref(client.id)`), and an
  "Import Drive links" item in an offer's asset menu (`importHref({ brandId, mode: "drive", offerId })`).

## Components

| Component | File | Props |
| --- | --- | --- |
| `FromWebsite` | `from-website.tsx` | `clientId?`, `initialUrl?` |
| `ImportFlow` | `import-flow.tsx` | `brandId?`, `kind?`, `mode?: "sheet" \| "drive"`, `offerId?` |
| `SheetImport`, `DriveImport` | `sheet-import.tsx`, `drive-import.tsx` | used by `ImportFlow` |
| `ImportLink`, `StartFromExisting`, `useOnboardingMenuItems` | `entry-points.tsx` | see above |

Server side: `src/app/onboarding-actions.ts` (`scanWebsite`, `createBrandFromDraft`),
`src/app/import-actions.ts` (`importRows`, `importDriveLinks`), `src/server/site-scan.ts`,
`src/server/site-ai.ts`; pure rules in `src/lib/site-draft.ts`, `src/lib/import-plan.ts`,
`src/lib/csv.ts`.

## Tests

`e2e/onboarding.spec.ts`. The website test needs a server started with
`BRANDOS_SCAN_FIXTURES=<repo>/e2e/fixtures/site` and not in production mode (the fixture host
`fixture.brandos.test` is read from that folder; every other address still goes through
safeFetch). Under `next start` that test skips itself; everything else runs anywhere.

## A real Google Drive folder import (not built)

Today people paste Drive links. Importing a whole folder needs Google's permission, which the
workspace does not have yet:

1. A Google Cloud project with the **Google Drive API** enabled.
2. An **OAuth client** (type "Web application") with redirect URI
   `https://<app>/api/import/drive/callback`, and its id and secret set as `GOOGLE_DRIVE_CLIENT_ID`
   and `GOOGLE_DRIVE_CLIENT_SECRET`.
3. An **OAuth consent screen** (Internal, if the agency uses Google Workspace, so no verification
   is needed) with the scope `https://www.googleapis.com/auth/drive.readonly`
   (or the narrower `drive.metadata.readonly` if only names and links are imported).

How it would plug in: a "Connect Google Drive" button on the Drive links step starts the OAuth
flow (`/api/import/drive/start` → Google → `/callback`, state and PKCE in a signed cookie); the
token is kept only for the session. The person pastes a folder link; the server lists it with
`GET https://www.googleapis.com/drive/v3/files?q='<folderId>' in parents and trashed=false&fields=files(id,name,mimeType,webViewLink)`
(paging, up to 500), and turns each file into the same `{ name, url }` lines this page already
previews, so `planDriveLinks` and `importDriveLinks` stay unchanged. Files would stay links to
Drive, not copies.
