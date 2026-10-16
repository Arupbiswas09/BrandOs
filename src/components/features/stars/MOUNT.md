# Starred items: where to mount

Everything here is self-contained: each component reads the workspace through
`useApp()` and calls `toggleStar` in `src/app/star-actions.ts`. No props carry
data. A star changes on the click, and every star button, the sidebar list and
the dashboard card agree at once (shared pending state in `use-star.ts`); if the
server refuses, the star goes back and a toast says why.

Server rules (`toggleStar(kind, itemId, on?)`): signed in; starring needs the
item to exist and be visible to me (same answer for deleted and out of scope);
at most 30 stars per person ("You can star up to 30 things..."); unstarring
always works, even for something I can no longer see; no activity log row;
`refresh()`. Pass `on` for an explicit state (the components do), so quick
double clicks cannot cross over.

## `<StarButton kind id name size? />`

`import { StarButton } from "@/components/features/stars/star-button";`

An `IconBtn` toggle (`aria-pressed`, label "Star <name>" / "Unstar <name>"),
filled in the accent colour when on. `size="md"` (32px) for headers, `"sm"`
(28px) in rows. Put it in the header actions, before the other buttons, so it
sits on the same line as the title's actions:

| Page | Where | Props |
|---|---|---|
| Offer (`pages/offer.tsx`) | `EntityHeader` `actions`, first item. Show it for everyone who can see the offer (not inside the `canEdit` guard). | `kind="offer" id={o.id} name={o.name}` |
| Asset drawer (`drawer/asset-drawer.tsx`) | Sticky top bar, right after the `<span className="flex-1" />` spacer, before "Link to offers". | `kind="asset" id={a.id} name={a.name}` |
| Brand (`pages/brand.tsx`) | The brand header's actions (home tab; keep it in the shared header if the redesign has one for all tabs). | `kind="brand" id={b.id} name={b.name}` |
| Service (`pages/service.tsx`) | `EntityHeader` `actions`, first item, outside the `canEdit` guard. | `kind="service" id={v.id} name={v.name}` |
| Client (`pages/client.tsx`) | `EntityHeader` `actions`, first item, outside the `ws.can("structure")` guard. | `kind="client" id={c.id} name={c.name}` |

Note: these `actions` props are currently wrapped in permission checks
(`canEdit && (...)`); the star must show for Viewers and Reviewers too.

## `<StarredNav mini? className? />`

`import { StarredNav } from "@/components/features/stars/starred-nav";`

Sidebar section "Starred": up to 10 rows (32px), tile (brand mark, or the code
OF / SVC / CL / asset type code tinted in the brand colour) and the name.
Offers, services, brands and clients are links (`aria-current="page"` on the
item's own page); assets are buttons that open the drawer with
`openAsset`. Archived or missing items are skipped. Renders nothing when there
is nothing starred, so it costs no space for people who never star. Over 10,
a "N more on the dashboard" link goes to `/#starred`.

Mount in `components/app/shell.tsx`, `SidebarBody`, inside `<nav>`, directly
after the first block of `NavItem`s (Dashboard ... Team and access) and before
the "Clients" eyebrow:

```tsx
<StarredNav mini={mini} className="mt-5" />
```

`mini` matches the folded sidebar (tiles only, name in `title` and for screen
readers). It works the same in the phone drawer (`drawer`): the provider
already closes the drawer when the path changes, and `openAsset` closes it for
assets.

## `<StarredCard className? />`

`import { StarredCard } from "@/components/features/stars/starred-card";`

The dashboard card "Starred": the same list with type and brand context
("Offer · Quokka For Good · Google Ad Grant", "Landing page · Quokka For
Good"), and an unstar button per row. Shows 8, then "Show all N". Empty, it is
the heading and one sentence: "Star the offers and assets you use most to keep
them here." Carries `id="starred"` for the sidebar's "more" link.

Mount in `pages/street.tsx` in the two-column grid, in the right-hand column
under "Continue where you left off" (wrap that column in
`<div className="flex flex-col gap-5">`). Same card padding as its neighbours.

Design note: on the dashboard the sidebar list and this card show the same
items (PRODUCT.md warns against showing a list twice on one page). The card
earns its place with the context line, the unstar control and the full list
beyond 10, which is why it sits below the cards that answer the dashboard's
main question rather than first.

## `useStarShortcut(kind, id, name, { enabled? })`

`import { useStarShortcut } from "@/components/features/stars/use-star-shortcut";`

Not wired anywhere yet (the lead decides). Call it from the item's own page
component, e.g. in `OfferPage`: `useStarShortcut("offer", o.id, o.name)`, and in
the drawer for the open asset: `useStarShortcut("asset", a.id, a.name)`. Hooks
must run unconditionally, so call it before any early `return` (pass
`{ enabled: !!o }` with safe fallbacks when the item may be missing).

"s" toggles the star and shows a toast ("Starred X" / "Unstarred X"). It does
nothing while typing, with a modifier key, while a dialog, search or the inbox
is open, within 900 ms after "g" (so "g s", go to the Street, keeps working),
and on a page while the asset drawer is open on top of it (the drawer's hook
takes it). If it is wired, add "S  Star or unstar this page" to the keyboard
shortcuts dialog.

## Dev preview

`/dev/stars-results` (`src/app/(app)/dev/stars-results/`) mounts all of the
above on the seed data. Delete the folder before release.
