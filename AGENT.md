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

1. **Canonical legislator×vote URL** — `/v/{voteId}/{bioguideId}`. Legacy path under `/bills/.../[voteId]/[bioguideid]` **redirects** here.
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
| `/bills/…/[voteId]` | `…/[voteId]/index.astro` | Single recorded vote + `VoteRoll` |
| `/bills/…/[voteId]/[bioguideid]` | `…/[bioguideid].astro` | Redirect alias → `/v/…` |
| `/v/[voteId]/[bioguideId]` | `v/[voteId]/[bioguideId].astro` | Canonical one-liner vote page + OG path |
| `/legislators` | `legislators.astro` | Hub |
| `/legislators/senate` | `legislators/senate.astro` | Senate roster |
| `/legislators/house` | `legislators/house.astro` | House roster |
| `/legislators/[bioguideid]` | `legislators/[bioguideid].astro` | Profile + history |
| `/changelog` | `changelog.astro` | Data-update index |
| `/changelog/[id]` | `changelog/[id].astro` | One update |

### WIP / non-product

| Route | Notes |
|-------|--------|
| `/social-card-design` | OG design playground (`noindex`). Not the Puppeteer capture URL. See `.cursor/social-cards.md`. |

**Do not expect:** `/congress/…`, root `/house`/`/senate`, or `/social-card-voted` (capture route **missing**; generator still targets it).

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

## Social cards (status)

Plans: `.cursor/social-cards.md` (finish), `.cursor/site-cleanup.md` (cleanup — done).

| Done | Not done |
|------|----------|
| `VotedCard`, view layer, Storybook, `/social-card-design`, Layout `socialCardPath`, small PNGs in `public/social-cards/v/` | `/social-card-voted` capture route, generator reconnect, PNG existence CI, digests |

```bash
npm run storybook          # card stories
npm run social-cards       # Puppeteer — currently 404s on /social-card-voted
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Astro dev server |
| `npm run build` | Incremental check → Astro build → merge/save `dist-cache` |
| `npm run build:full` | `FORCE_FULL_REBUILD=true` full build |
| `npm run build:test` | Limited bills (`BILLS_PER_TYPE_LIMIT=40`) |
| `npm test` | Node test runner + coverage (`src/**/*.test.ts`, `scripts/**/*.test.ts`) |
| `npm run test:types` | `astro check` |
| `npm run storybook` | Storybook on `:6006` |

Env knobs: `FORCE_FULL_REBUILD`, `BILLS_PER_TYPE_LIMIT`, `LEGISLATORS_LIMIT`, `BASE_URL`.

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
4. Social-card generator is **broken** until Phase 1 in `.cursor/social-cards.md`.
5. `.cursor/vote-roll-handoff.md` is **obsolete** (references deleted pages/assets).
6. Commits: Gitmoji format (see `.cursor/rules/gitmoji-commits.mdc`).
7. Confirm before large refactors; prefer multiple-choice questions when asking the human.

## Related packages

| Package | Role |
|---------|------|
| `@votedforus/votes` | Library + `vfu` CLI; Congress.gov fetch, recorded-vote synthesis, types |
| `@votedforus/common` | Release presets + transitive `@scottnath/devx` tooling |
| `@scottnath/devx` | Astro/Storybook/ATProto meta-tooling (import Storybook helpers from here) |
