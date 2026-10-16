# Results per offer: where to mount

Each component reads the workspace through `useApp()` (`ws.d.offerResults`,
already limited to offers I can see) and the pure rules in
`src/lib/results.ts`; writes go through `src/app/results-actions.ts`.

Counting rules (one place, `lib/results.ts`): conversion = conversions / leads,
call rate = calls / leads, cost per lead = spend / leads when spend > 0. A
rate only uses periods where both of its numbers were recorded. Percentages
have one decimal ("11.7%"), counts use `fmtNumber` ("1,234"), all with
`tabular-nums`. Spend has no currency symbol (it is in the client's currency).

Server rules:
- `saveResult({ id?, offerId, period, endedOn?, leads?, calls?, conversions?, spend?, lesson })`:
  signed in, `can(me, "edit")`, the offer visible, and contributors only on
  offers they own (`canChange`). Whole, non-negative counts; period 1 to 60
  characters; lesson up to 600; conversions and calls cannot exceed leads; at
  least one number or a lesson; an `id` must belong to that offer; up to 200
  periods per offer. Logs "recorded results for" / "updated results for" on the
  offer, with the period as the detail.
- `removeResult(id)`: admins only (`can(me, "del")`), offer visible. Logs
  "removed results from". Everyone else corrects the numbers instead.

## `<OfferResults offer />`

`import { OfferResults } from "@/components/features/results/offer-results";`

The whole content of an offer's "Results" tab: a heading "Results" (h2) with
the trend between the last two periods as its subtitle ("Conversion fell to
11.5% in Second month, down 0.4 points on Launch month."), a table of periods
newest first (period and end date, leads, calls booked, conversions,
conversion, cost per lead only when any period has spend, lesson learned), a
totals row when there are two or more periods, and the add/edit form inline
(add above the table, edit directly under its row; Esc cancels). Remove asks
for confirmation in place. Empty: one sentence and "Record the first results"
(only for people who can change the offer). Below 768px the table becomes a
stack of cards; nothing scrolls sideways at 390px.

Mount on the offer page (`pages/offer.tsx`) as a "Results" tab, next to the
other offer sections, with a count if the tabs show counts:

```tsx
{ key: "results", label: "Results", count: ws.d.offerResults.filter((r) => r.offerId === o.id).length || undefined, ... }
...
{tab === "results" && <OfferResults offer={o} />}
```

If the page has no tabs yet, place it as its own section after the funnel
board and before the assets. It has one primary button of its own ("Record
results"), hidden while the form is open.

## `<WhatWorked brandId? clientId? serviceId? as? className? />`

`import { WhatWorked } from "@/components/features/results/what-worked";`

A small card, "What worked", with up to three plain sentences, ranked by
conversion, each linking to the offer (or service) behind it, e.g. "Audits
convert best overall (11.7% from 103 leads)." Only offers with at least 20
leads (`MIN_LEADS`) count, and it renders nothing until two such offers can be
compared, so it never needs an empty state. Scope: `brandId` (that brand and
its sub-brands), `clientId`, `serviceId`, or no prop for everything I can see.
`as="h3"` when it sits under an h2.

| Page | Where | Props |
|---|---|---|
| Brand, Strategy tab (`pages/brand.tsx`, `Strategy`) | After the segments and goals, before the page ends (or in its side column if the redesign has one). | `brandId={b.id}` |
| Service page (`pages/service.tsx`) | The side column. Until there is one, under the stat tiles. | `serviceId={v.id}`, `as="h3"` if under an h2 |

## `<ResultBadge offerId className? />`

`import { ResultBadge } from "@/components/features/results/result-badge";`

A tiny "11.7% conv." chip (screen readers hear "11.7% of 103 leads converted").
Nothing when the offer has no period with both leads and conversions. Below 20
leads it is outlined and quieter, and says the sample is small.

Mount on offer rows and cards: `OfferCard` in `components/cards.tsx` (in its
meta line, after the status chip), the brand's Offers list, the service page's
offer rows, and search results if they show offers.

## Dev preview

`/dev/stars-results?offer=of15` (`src/app/(app)/dev/stars-results/`) mounts all
of the above on the seed data (`of15` and `of1` have results; `of24` and `of2`
have none). Delete the folder before release.
