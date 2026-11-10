# AGENT.md — `@votedforus/site`

Guidance for AI coding agents working in this repository. Prefer **source and this file** over stale README sections (especially routes and data layout).

## Purpose

Static Astro site for **[VotedFor.Us](https://votedfor.us)**: present congressional bills, recorded votes, and legislator profiles.

**Content ownership:** All vote/bill/legislator **payloads** come from `@votedforus/votes` (via `vfu` into `src/data/`). This site **presents** that data (routes, UI, editorial overlays, OG cards). It does **not** decide which bills or votes exist — do not reimplement inclusion filters here.

| Field | Value |
|-------|--------|
| Package | `@votedforus/site` |
| Stack | Astro **7** (static), TypeScript, Node **24** (`.nvmrc`) |
| Site URL | `https://votedfor.us` (`astro.config.mjs` `site`) |
| Output | `output: 'static'` → `dist/` |
| Data dependency | `@votedforus/votes` (published registry package; provides `vfu` CLI) |
| Tooling meta-package | `@votedforus/common` → `@scottnath/devx` (Astro, Storybook, semantic-release plugins, tsx, etc.) |

## Runtime / install

- Node `>=24` — run `node -v`; if mismatch, `nvm use`.
- `.npmrc` must include both scopes:
  - `@votedforus:registry=https://npm.pkg.github.com`
  - `@scottnath:registry=https://npm.pkg.github.com`
- **Never** install `@votedforus/votes` via `file:` / `link:` — registry only (`npm.pkg.github.com`).
- Direct deps: `@votedforus/votes`. Dev: `@votedforus/common`, `@drop-in/graffiti`, `puppeteer`, `@types/node`.
- Astro / Storybook / TypeScript / Zod arrive **transitively** via `@votedforus/common` → `@scottnath/devx`.

## Domain rules (must respect)

### Owned by `@votedforus/votes` (do not re-decide in site)

Vote content selection and synthesis live in the votes package (`CongressApi`, CLI writers). See that repo’s `AGENT.md` for recorded-vote kinds, bill inclusion, UC/voice synthesis, and stable vote `id`s. Site agents should:

1. Treat `src/data/**` as the source of truth for **what** to show.
2. Use votes helpers for **how** to label outcomes when displaying — e.g. `isVotePassed`, `getBillState` from `@votedforus/votes`.
3. Change inclusion/synthesis rules in **votes**, then regenerate data — not by filtering inventively in Astro pages.

### Owned by site (presentation)

1. **Only identities are pages** — a bill, a vote (its roll), a member. A combination is the identity's page plus a query string, opened in place by a custom element, because static hosting serves no other deep link:
   - one member's cast on a vote → `/bills/{term}/{type}/{n}/{vote}?member={bioguide}` (`vfu-vote-roll` opens the card)
   - one member's votes on a bill → `/members/{bioguide}?bill={term}-{type}-{n}` (`vfu-member-record`), plus `&vote={n}` for the card
   Never add a prerendered route per member×vote or member×bill: that was 351,000 pages and a 67 GB build. Build every such URL with `src/utils/voteLinks.ts`.
   - **Share stubs** — `/bills/{term}/{type}/{n}/{vote}/{bioguide}` is a ~1 KB file written by `scripts/build-share-stubs.ts` (not Astro) holding the link-preview tags and a hand-off to the `?member=` URL. Which casts get one is `src/shareConfig.ts`: a small sample by default, every cast under `SHARE_STUBS=all` (launch only).
2. **Editorial overlays** — optional display tweaks in `src/content/editorial/` (titles, vote-action copy, acronyms); they refine presentation, they do not invent votes.
3. **UI grouping** — e.g. `BillsTable` groups using `getBillState` from votes; grouping is presentation over data already on disk.

## Routes (`src/pages/`)

### Production

| Route | File | Role |
|-------|------|------|
| `/` | `index.astro` | Home |
| `/about` | `about.astro` | Stub |
| `/404` | `404.astro` | Not found (`disableIndexing`) |
| `/bills/[term]` | `bills/[term]/index.astro` | Term bill list |
| `/bills/[term]/[billType]` | `…/[billType]/index.astro` | Bills of that type |
| `/bills/[term]/[billType]/[billNumber]` | `…/[billNumber]/index.astro` | Bill detail + votes + actions |
| `/bills/…/[voteId]` | `…/[voteId]/index.astro` | Single recorded vote + `VoteRoll`; `?member=` opens that member's card in place |
| `/bills/…/[voteId]/[bioguide]` | *(no route)* — `scripts/build-share-stubs.ts` | Share stub: preview tags + hand-off to `?member=` |
| `/members` | `members.astro` | Hub |
| `/members/senate` | `members/senate.astro` | Senate roster |
| `/members/house` | `members/house.astro` | House roster |
| `/members/[bioguideid]` | `members/[bioguideid].astro` | Member record; `?bill=` and `&vote=` open in place |
| `/changelog` | `changelog.astro` | Data-update index |
| `/changelog/[id]` | `changelog/[id].astro` | One update |

### WIP / non-product

| Route | Notes |
|-------|--------|
| `/social-card-design` | OG design playground (`noindex`). Not the Puppeteer capture URL. See `.cursor/social-cards.md`. |

**Do not expect:** `/congress/…`, root `/house`/`/senate`, `/v/…`, `/legislators/…`, or any social-card route in a build (`/social-card-capture` exists under `astro dev` only).

## Data & content collections

**On-disk layout** (not flat `bills-*.json` from old README):

```
src/data/
  bills/{congress}/{type}/{number}.json
  legislators/{BIOGUIDE}.json
  changelog/{id}.json
  changelog.json
```

**Collections** (`src/content.config.ts`): `bills`, `recordedVotes`, `legislatorVotes`, `legislators`, `senators`, `representatives`, `changelog`.

**Editorial overlays** (`src/content/editorial/`): `bill-titles/`, `vote-actions/`, `acronyms.json` — preferred titles/actions for display.

**Images:** canonical local headshots at `public/images/legislators/{BIOGUIDE}.jpg` (matches `legislators:generate --images`). Daily data PRs include this folder. Portraits re-download when the Congress.gov member `updateDate` changes (`vfu` + `.cache/congress/memberImageDates-*.json`).

Generate / refresh data (via `vfu` from votes):

```bash
npm run legislators:generate
npm run voted-bills-sync:generate
npm run build-from-cache
npm run generate-change-summary
```

## Key modules

### Layouts / global

- `src/layouts/Layout.astro` — SEO (`astro-seo`), breadcrumbs util, `socialCardPath` → `og:image`
- `src/layouts/global.css` — imports `@drop-in/graffiti`

### Components (high traffic)

| Component | Role |
|-----------|------|
| `BillsTable.astro` | Bills grouped by bill state |
| `VoteTable.astro` / `ActionsTable.astro` | Votes list / actions timeline |
| `VoteRoll.astro` / `VoteRollRow.astro` | Sortable roll-call UI |
| `Voted.astro` | Page one-liner (not the OG card) |
| `Legislator.astro` / `LegislatorList.astro` | Profile / roster |
| `SiteName.astro` | Brand wordmark |
| `social-cards/VotedCard.astro` | 1200×630 OG card UI |
| `social-cards/VotedFromResolver.astro` | Disk resolve → card props |

Note: `Breadcrumbs.astro` is **misnamed** (renders vote UI). Layout nav crumbs come from `src/utils/breadcrumbs.ts`.

### Utils (agents touch these often)

| Area | Paths |
|------|--------|
| Shared vote view (page + card) | `legislatorVoteView.ts`, `legislatorVoteDisplay.ts`, `voteCastKind.ts` |
| Resolvers | `resolveLegislatorVoteViewAstro.ts` (prod), `resolveLegislatorVoteViewFromFiles.ts` (Storybook/design) |
| Bill titles | `billTitle.ts`, `cleanDisapprovalTitle.ts`, `applyAcronyms.ts`, `shortenBillTitleBoilerplate.ts` |
| Legislation labels | `billLegislationFormat.ts` |
| Vote roll UI | `voteRollDisplay.ts`, `voteRollLanes.ts`, `voteRollSortOrders.ts` |
| Incremental build | `buildManifest.ts` + `scripts/incremental-check.ts` |
| Card types | `src/types/votedCard.ts` (`VotedCardProps`) |

**Invariant:** page copy and OG card props must share `legislatorVoteView` / `toVotedCardProps` — do not invent a second string builder for the generator.

## Social cards

A share card is a 1200×630 PNG of one member's cast on one vote, drawn from the
same `VotedCard` the dialog shows.

| Piece | Where |
|-------|-------|
| Capture route | `src/dev/social-card-capture.astro` — `/social-card-capture?voteId=…&bioguideId=…` or `?default`. Injected by `astro.config.mjs` under `astro dev` only; no build emits it. A cast that does not resolve is a 404, never a sample. |
| Generator | `scripts/generate-social-cards.ts` (`npm run social-cards`) — starts `astro dev`, screenshots each cast in `SHARE_SAMPLE`, plus the site default. About ten seconds. Output is committed; CI and deploy never run a browser. |
| Which casts | `SHARE_SAMPLE` in `src/shareConfig.ts` — the same list the share stubs use. Six casts while the card design is still moving. |
| Output | `public/social-cards/{voteId}/{bioguideId}.png` and `public/social-card-default.png` (the site-wide `og:image`). |
| Launch | `SOCIAL_CARDS_BASE=https://…` points every stub's `og:image` at an image host, and `SHARE_STUBS=all` writes a stub per cast. Drawing all ~360,000 images and standing up that host are not done. |

```bash
npm run social-cards                          # sample + default
npm run social-cards -- 119-HR-1-3/A000382    # one cast
npm run storybook                             # card stories
```

Puppeteer needs a Chrome: its own download, or `PUPPETEER_EXECUTABLE_PATH`.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Astro dev server |
| `npm run build` | Finder index → incremental check → Astro build → merge cache → share stubs → save `dist-cache` |
| `npm run build:full` | `FORCE_FULL_REBUILD=true` full build — about 2,900 pages, under four minutes |
| `npm run share:stubs` | Write share stubs into an existing `dist/` |
| `npm run build:test` | Limited bills (`BILLS_PER_TYPE_LIMIT=40`) |
| `npm test` | Node test runner + coverage (`src/**/*.test.ts`, `scripts/**/*.test.ts`) |
| `npm run test:types` | `astro check` |
| `npm run storybook` | Storybook on `:6006` |

Env knobs: `FORCE_FULL_REBUILD`, `BILLS_PER_TYPE_LIMIT`, `LEGISLATORS_LIMIT`, `BASE_URL`, `SHARE_STUBS` (`all` = a stub for every cast), `SOCIAL_CARDS_BASE` (where card images are served from, when not this site).

## Build / deploy

- Incremental: `scripts/INCREMENTAL-BUILD.md` — digests + `dist-cache/` reuse.
- After layout/component changes that affect many pages, use **full rebuild** or stale HTML can remain.
- CI: `.github/workflows/ci.yml`, `deploy-site.yml` (Pages), `daily-data-update.yml`, `release.yml`.
- Release: `release.config.mjs` extends `@votedforus/common`.

## Testing conventions

- Native **Node.js test runner** + `node:assert` + `tsx` — not Jest/Mocha.
- Typecheck via **`astro check`**.
- Colocate `*.test.ts` with source or under `scripts/`.
- Prefer mock utility classes when mocking fetch/fs (project rules).

## Agent pitfalls

1. Trust **this file + source** over README for routes and `src/data/` layout.
2. Do not `file:`-link votes; use GitHub Packages.
3. Image root is `/images/legislators/{BIOGUIDE}.jpg`, not `/img/member/`.
4. After changing `VotedCard`, re-run `npm run social-cards` and commit the PNGs — nothing regenerates them for you.
5. `.cursor/vote-roll-handoff.md` is **obsolete** (references deleted pages/assets).
6. Commits: Gitmoji format (see `.cursor/rules/gitmoji-commits.mdc`).
7. Confirm before large refactors; prefer multiple-choice questions when asking the human.

## Related packages

| Package | Role |
|---------|------|
| `@votedforus/votes` | Library + `vfu` CLI; Congress.gov fetch, recorded-vote synthesis, types |
| `@votedforus/common` | Release presets + transitive `@scottnath/devx` tooling |
| `@scottnath/devx` | Astro/Storybook/ATProto meta-tooling (import Storybook helpers from here) |
