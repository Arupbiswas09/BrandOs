# BrandOS

Every client, brand, offer and asset an agency works on, in one place.
Built from the *BrandOS v3* Claude Design prototype. Developed by Arup.

- **Dashboard**: KPIs, a get-set-up checklist, and tabs for what is waiting on you, what is due soon and recent activity.
- **Clients → brands → sub-brands**: each brand re-skins the app in its own colours.
- **Services and offers**: an offer is a service argued at one segment. The coverage grid shows which combinations nobody has written yet.
- **Assets**: exist once and link to as many offers as they support. Files, copy, checklists, prompts, versions, discussion and client sign-off in one drawer.
- **Brand Kit**: industry-standard guidelines — logo rules (clear space, minimum sizes, misuse), colours with HEX, RGB, CMYK and Pantone plus WCAG contrast checks and a pairing grid, typefaces and a type scale, voice (we are / we are not, words to use and avoid, examples), imagery, do's and don'ts, files, and a completeness score. **Guidelines PDF** prints the whole kit as a document; client share links include it.
- **Strategy**: goals, segments and offer types for each brand.
- **Review**: send for review, request changes, approve; everything lands in the right person's queue.
- **Access**: seven roles × client scope. **Admin**, **Manager**, **Editor**, **Contributor** (edits only their own work), **Reviewer**, **Viewer**, and **Client**, an outside guest who sees only work cleared to send. Team → *Roles and permissions* shows the full matrix and *Who sees what* shows everyone who can open each client. The browser hides what you cannot do; every server action and API route checks again.
- **Notifications**: the bell, the tab title and the installed app's icon count what needs you (reviews, requested changes, unread @mentions). New items pop up as they arrive, with optional desktop notifications (Settings → Notifications).
- **Due dates and Calendar**: assets have due dates and offers have launch dates. Late work is flagged everywhere, the queue sorts by urgency, and the Calendar shows what is overdue, the next two weeks, and the month.
- **Brand health**: eight checks on each brand (proof, CTAs, goals, unlinked assets, coverage gaps, overdue work, stale reviews, unapproved client items), each linking to what needs fixing.
- **Image previews**: uploaded images show on asset cards and in the asset panel.
- **Editable notes**: edit or delete your own notes; admins can delete any.
- **Recycle bin**: anything deleted can be restored for 30 days (Settings menu → Recycle bin, admins).
- **Live updates**: teammates' changes appear within 30 seconds, and immediately when you return to the tab.
- **Email** (when `RESEND_API_KEY` is set): invites, password resets, review requests, requested changes, approvals and @mentions. Each person chooses instant, daily digest or off per kind of event in **Settings → Notifications**.
- **Daily digest** (when `CRON_SECRET` is set and something calls `/api/cron/digest` each morning): one email with everything queued plus the person's work due in the next two days or overdue. See `docs/DEPLOY.md`.
- **Slack** (optional, `SLACK_WEBHOOK_URL`): review requests, approvals, change requests and new client links posted to one channel, with links. Admins can send a test message from Settings.
- **Calendar feed**: a private `.ics` link per person (Settings or Calendar page) with due dates and offer launches they can see, and a reminder the day before. Regenerate or turn it off at any time.
- **Client share links, AI copy drafting, version history, installable app**: see below.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 and pick a teammate. The database is created and
seeded with a demo agency on first request (stored in `.data/`). Delete
`.data/` to start over, or use **Reset demo data** at the bottom of the sidebar (demo mode only;
it never appears in production). Press `[` to fold the sidebar to icons.

Configuration lives in `.env.local`; see `.env.example`.

## Install it as an app

BrandOS is a Progressive Web App. In Chrome or Edge, use the install icon in the
address bar (or **Settings → Install the app**). On iPhone and iPad, open it in
Safari, tap Share, then **Add to Home Screen**. The installed app opens in its
own window and shows an offline screen instead of a browser error when the
connection drops. Pages and data are never cached on the device, because they
depend on who is signed in.

The service worker only runs in production builds (`npm run build && npm start`).

## Tests

```bash
npm run test:e2e
```

Playwright builds the app, starts it on a throwaway database, and checks:
every page at phone, tablet, laptop and desktop widths (no sideways scrolling),
WCAG AA accessibility including colour contrast on every page, the core
flows, and the PWA (manifest, service worker, offline page). The HTML report
lands in `playwright-report/`. It uses your installed Chrome; set `PW_CHANNEL=`
to use Playwright's own Chromium (`npx playwright install chromium` first).

## Stack

| Layer | Choice |
|---|---|
| App | Next.js App Router, React Server Components + Server Actions |
| UI | Tailwind CSS v4, design tokens from the prototype, Asap / Instrument Serif / JetBrains Mono |
| Data | Postgres via Drizzle ORM. PGlite locally, any Postgres in production |
| Files | Local disk, or private Vercel Blob |
| AI | Anthropic SDK (Claude) for copy drafting |
| App shell | Web app manifest + service worker (installable, offline screen) |
| Tests | Playwright + axe-core |

## How it fits together

- `src/db/schema.ts` is the data model; `drizzle/` holds migrations, applied automatically on start.
  After changing the schema run `npx drizzle-kit generate`.
- `src/server/data.ts` loads the workspace and filters it to what the signed-in person may see.
  Pages render from that snapshot (`src/lib/ws.ts`), so navigation is instant.
- `src/app/actions.ts` holds every change. Each action re-checks the access level
  (`src/lib/access.ts`) and client scope on the server, then refreshes the page.
- `src/components/` holds the shell, pages, the asset drawer, and the modals.

## Operations

- `GET /api/health` returns 200 when the database answers — point uptime checks at it.
- `GET|POST /api/cron/digest` with `Authorization: Bearer $CRON_SECRET` sends the daily digest (safe to call more than once a day).
- `GET /api/calendar/<token>.ics` serves a person's private calendar feed.
- Admins can download the whole workspace as JSON from **Settings → Export JSON**.

## Setting up for real use

1. In production (`next build` + `next start`) password sign-in is on and demo data is off by
   default. Override with `BRANDOS_AUTH` and `BRANDOS_SEED` (see `.env.example`).
2. Open the site. The first visit shows a setup screen: your agency, your account.
3. Add the team from **Team → Invite someone**, then send each person their invite link
   (emailed automatically once `RESEND_API_KEY` is set).

## Deploying

Any Node host works. On Vercel: add a Postgres database (e.g. Neon) and a Blob store
from the Marketplace, set `APP_URL` and (for email) `RESEND_API_KEY`, then deploy and open the site to run setup.
Without `DATABASE_URL` or a Blob store the app says so clearly instead of losing data.

With Docker:

```bash
docker build -t brandos .
docker run -p 3000:3000 -v brandos-data:/app/.data brandos
```

Search engines are told to stay away (`robots.txt` and `X-Robots-Tag`).
