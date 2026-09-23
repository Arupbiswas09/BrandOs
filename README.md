# BrandOS

Every client, brand, offer and asset an agency works on, in one building.
Built from the *BrandOS v3* Claude Design prototype.

- **The Street**: what is waiting on you, where you left off, every client.
- **Clients → brands → sub-brands**: each brand re-skins the app in its own colours.
- **Services and offers**: an offer is a service argued at one segment. The coverage grid shows which combinations nobody has written yet.
- **Assets**: exist once and link to as many offers as they support. Files, copy, checklists, prompts, versions, discussion and client sign-off in one drawer.
- **Brand Kit**: logos, colours, fonts, goals, segments, voice, boilerplate and the CTA library.
- **Review**: send for review, request changes, approve; everything lands in the right person's queue.
- **Team**: four access levels × client scope (per person, per group).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 and pick a teammate. The database is created and
seeded with a demo agency on first request (stored in `.data/`). Delete
`.data/` to start over, or use **Reset** at the bottom of the sidebar.

Configuration lives in `.env.local`; see `.env.example`.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js App Router, React Server Components + Server Actions |
| UI | Tailwind CSS v4, design tokens from the prototype, Asap / Instrument Serif / JetBrains Mono |
| Data | Postgres via Drizzle ORM. PGlite locally, any Postgres in production |
| Files | Local disk, or private Vercel Blob |
| AI | Anthropic SDK (Claude) for copy drafting |

## How it fits together

- `src/db/schema.ts` is the data model; `drizzle/` holds migrations, applied automatically on start.
  After changing the schema run `npx drizzle-kit generate`.
- `src/server/data.ts` loads the workspace and filters it to what the signed-in person may see.
  Pages render from that snapshot (`src/lib/ws.ts`), so navigation is instant.
- `src/app/actions.ts` holds every change. Each action re-checks the access level
  (`src/lib/access.ts`) and client scope on the server, then refreshes the page.
- `src/components/` holds the shell, pages, the asset drawer, and the modals.

## Deploying

Any Node host works. On Vercel: add a Postgres database (e.g. Neon) and a Blob store
from the Marketplace, set `BRANDOS_AUTH=password` plus the admin variables, and deploy.
