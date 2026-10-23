# How BrandOS is put together

BrandOS is one Next.js app with five layers. Each layer only calls the one
below it, and every rule lives in exactly one place, so a change is made once
and every screen agrees.

```
  Screens        src/components/**          what people see and click
     │  read the snapshot through WS, call server actions
  Model          src/lib/**                 pure rules: no database, no React
     │  shared by screens and server
  Actions        src/app/*-actions.ts       every change, each one permission-checked
  & routes       src/app/api/**             files, exports, health, cron
     │  load, check, write
  Server         src/server/**              sessions, visibility, storage, mail
     │
  Data           src/db/schema.ts           tables; drizzle/ holds the migrations
```

## Data — `src/db`

- `schema.ts` is the only description of the tables. Migrations in `drizzle/`
  are generated from it and run on start.
- Production data is kept across every release: migrations only add tables
  and nullable or defaulted columns. The demo seed (`seed.ts`) never runs in
  production (`BRANDOS_SEED=off`).

## Server — `src/server`

- `data.ts` reads everything once per request (`readAll`), works out what the
  signed-in person may see (`makeVisibility`, `scopeFor`) and builds the
  **workspace snapshot** sent to the browser (`buildWorkspace`). Nothing the
  person may not see ever leaves the server.
- `session.ts`, `two-factor.ts`, `sign-in-code.ts`, `throttle.ts`: sign-in.
- `storage.ts`, `uploads.ts`: files (local disk or Vercel Blob), always served
  through `/api/files`, which checks visibility.
- `mail.ts` (SMTP or Resend), `notify.ts`, `slack.ts`: outgoing messages.
- `safe-fetch.ts`: the only way the server opens a page someone pasted. Only
  http(s), every address checked at connect time (no private, loopback or
  cloud-metadata addresses), redirects re-checked, time and size capped.
  `link-check.ts` (broken links), `page-picture.ts` (a landing page's share
  picture) and `site-scan.ts` (a brand from its website) all go through it.
- `trash.ts`: the recycle bin. A file is only removed from storage when no
  asset, earlier version or folder still uses it (`unreferenced`).

## Actions and routes — `src/app`

- Every write is a server action that starts with `context(perm)`: who is
  asking, may their role do this (`can` in `lib/access.ts`), may they see this
  item, and — for contributors — do they own it. Hiding a button is never the
  security; the action refuses on its own.
- Clients, brands, services and offers are archived, never deleted. Assets and
  files can be deleted by admins and go to the recycle bin for 30 days.
- One file per area: `actions.ts` (the core records), `file-actions.ts`
  (versions), `folder-actions.ts`, `link-actions.ts`, `star-actions.ts`,
  `results-actions.ts`, `import-actions.ts` and `onboarding-actions.ts`.
- `/api/cron/links` is the daily link check (needs `CRON_SECRET`).

## Model — `src/lib`

Pure functions and constants shared by the screens and the server. The single
sources of truth:

| Question | One place |
|---|---|
| Who may do what | `access.ts` (`PERMISSIONS`, `can`, `canChange`) |
| Who may own an offer, who may delete a CTA | `owners.ts` (`mayOwn`, `ownerChoices`, `canDeleteCta`) |
| What an asset type is and its role in a funnel | `constants.ts` (`ASSET_TYPES`, `roleOf`) |
| A service's numbers (offers, lead magnets, landing pages, funnels, automations, attention) | `ws.ts` (`serviceStats`) |
| How a service's funnels group by entry point | `ws.ts` (`funnelGroups`) |
| The review queue and who it waits on | `ws.ts` (`queue`), `types.ts` (`waitOn`) |
| Search across everything | `ws.ts` (`search`) |
| How dates and times read (European: 16 Oct 2026, 14:30, weeks from Monday) | `format.ts` |
| Upload limits (and what the Brand Kit's guidelines and legal pages take) | `upload-policy.ts` |
| A Brand Kit's completeness, logo variations, legal pages, social links, video and guideline links | `kit.ts` |
| Funnel board rules and the first draft | `funnel.ts` |
| Routes and links | `routes.ts` |
| Whether a link is broken and how to say so | `link-health.ts` |
| Stars (what can be starred, the limit of 30) | `stars.ts` |
| Results per offer: totals, conversion, trend, what worked | `results.ts` |
| Earlier versions of a file | `file-versions.ts` |
| Tracked links (UTM) | `utm.ts` |
| Spreadsheet import: parsing and the plan | `csv.ts`, `import-plan.ts` |

`WS` (`ws.ts`) wraps the snapshot with fast lookups (maps built once per
snapshot). Screens ask `WS`; they never recount or re-filter on their own.

## Screens — `src/components`

- `pages/*` one file per screen; `drawer/*` the asset drawer; `modals/*`
  forms; `app/*` the shell (sidebar, header, search, inbox, theme);
  `features/*` the pieces of stars, results, links, files and onboarding that
  several screens share.
- Shared building blocks in `ui.tsx`: `Btn` (32, 36 or 40px), `Chip` and
  `PILL` (the one pill shape for small labels), `CodeTile`, `Avatar`, `Mark`
  (their text snaps to the type scale with `onScale`), `Field`, `Page`.
  Dialogs use `modals/frame.tsx`: title and Save stay put while the body
  scrolls, and optional fields wait behind `MoreDetail`. Menus use
  `more-menu.tsx`.
- The look is set by tokens in `app/globals.css` and the palette in
  `components/app/theme.ts`: Instrument Serif page titles, Asap text,
  JetBrains Mono labels, green-grey neutrals, petrol accent, and a brand's own
  colours while you are inside that brand.

## Speed

- One read per request; the browser gets one snapshot and works from memory,
  so navigation and search are instant.
- Live updates refresh the snapshot every 30 seconds and when the tab returns.
- Images are lazy-loaded with fixed aspect ratios, so nothing jumps.
