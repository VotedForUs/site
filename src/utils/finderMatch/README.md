# `finderMatch`

Pure matching functions behind the site finder. No DOM, no `fs`, no network —
they take index rows and a query string and return grouped rows, so they run
the same in a test, in a build script and in the browser.

| file | what it is |
|---|---|
| `index.ts` | the matcher: normalisation, the bill and member groups, the bill-type filter, `extractCitations` |
| `fixtures.ts` | a small corpus of real bills and members, one row per rule |
| `index.test.ts` | one describe block per rule below |

Run them with `npm test`; `npm run test:types` typechecks.

## The index rows

Two static files, written at build time by `scripts/build-finder-index.ts` and
fetched by the finder on first interaction. Keys are single letters because
every row ships to every reader.

```ts
// members.json
{ b: bioguideId, n: name, s: 'NY', d: 18, p: 'D', c: 'house', v: 412, i: 1 }

// bills.json
{ i: '119-HR-2616', t: 'H.R. 2616', n: 2616, y: 'hr', h: 'Preserving Patient Access…',
  cites: ['hconres 14'], a: [], s: 'became-law', d: '2026-05-20', v: 3 }
```

`h` is the editorial title where one exists, else the generated best title, so
search and rows read the same string the pages show. `cites` is spelled out
rather than shortened to `c` because `MemberRow.c` is already the chamber.

`a` holds the authored aliases — the optional `nickname` and `abbreviation`
fields edited in the CMS. Most bills have neither, and `[]` is the normal row,
not a missing value. Aliases are **not** derived from Popular Title initials
(those produce `obbba` where readers type `obbb`, and the trailing-`Act` rule
that closes that gap is where collisions come from) and never come from
`src/content/editorial/acronyms.json`, which holds agency acronyms — using it
would assert that a bill is nicknamed after an agency.

## Bill types come from `@votedforus/votes`

`BILL_TYPES` is imported from `@votedforus/votes/types` and re-exported here.
The votes package owns what exists; the site only matches against it. Chip
order follows that array, with an exact match hoisted in front.

## Bill matching

A query lands a bill in **at most one** group — the first it qualifies for.
Groups render in `MATCH_KINDS` order, each labelled and counted.

**exact-id** · **id-contains** · **id-in-title** · **alias** · **title-text**

- **A bare bill type is a filter, not a match.** `billTypeMatches` returns
  every type the query could mean, exact first: `s` → s, sjres, sconres, sres;
  `hre` → hres. Never resolve a prefix to a single type — that asserts a type
  the reader did not ask for. `matchBills` returns no rows for such a query —
  treating a type as text returned the whole corpus in one bucket, since `hr`
  appears in every House bill id — and the caller renders one chip per candidate
  type. The finder lists the bills of all the candidate types together while
  those chips are up, which asserts no single type and keeps a keystroke from
  emptying the region.
- **`id-contains` needs a digit** for the same reason. With the guard,
  `hr 26`, `hr26` and `119-hr-26` resolve to the same set, and `4405` resolves
  to one bill.
- **Numeric queries stop at ids.** Bill numbers and years are the same
  strings; titles ending "Act, 2026" swamped real number matches.
- **`id-in-title` means THIS bill's official title cites the bill the query
  names.** It compares the parsed query against `cites`, never against the
  display title `h`: `getBestBillTitle` replaces the official title with the
  Popular Title, so H.R. 1 reads "One Big Beautiful Bill Act" while the
  citation to H. Con. Res. 14 survives only in the official title. Reading `h`
  is why this group used to return nothing.
- **Alias ranks above title text.** A reader typing `obbb` means one bill.
  Exact or prefix match, compared in both the spaced and the compact form so a
  two-word nickname answers a query typed without the space.
- **title-text matches the title as a substring, from the first character.**
  `v` → 400 bills, `ve` → 237, `vet` → 29, `veterans` → 26.

  This was three rules once: a single word had to match a whole title token,
  words under three characters never matched, and a stopword list (act, the,
  of…) matched nothing at all. Each existed to keep a group from carrying no
  information — `or` reaching Reform, Forests, Honor and Workers; `act`
  appearing in 93% of titles. All three assumed a finder that starts empty,
  where a low-information group is the only thing on screen. Against 739 rows
  that are already showing, they did something worse: every partial word blanked
  the list, so `vet` on the way to `veterans` rendered nothing. The cost of the
  substring rule is real and accepted — `form` now reaches Reforming as well as
  Reform.
- **No correction, ever.** No fuzzy match, no transposition, no spelling
  suggestion. A query that matches nothing produces the empty state, not a
  guess. The query is matched as one contiguous string: `ny` is n-then-y and
  never reaches "Nancy".
- **Normalisation strips em and en dashes.** Bill titles use them, and leaving
  them in creates tokens no query can reach.

`searchBills` is the call the finder should use: it returns the buckets, the
type chips with per-type counts, and `emptyTypes`. A chip whose count is zero
is dropped — it leads nowhere — but if *every* candidate type is empty the UI
still needs a reason to show ("no Senate bills have recorded votes"), and
`emptyTypes` is that reason. Via `matchBills` alone the type filter is
unreachable.

## Member matching

Three buckets — name, state, district. Names keep **substring** matching: a
partial surname is the common case.

`MEMBER_MIN_QUERY_LENGTH` is one: the first character already narrows. The
guard lives in `matchMembers`, not in the component, so every caller inherits
whatever it is set to.

It was two — a single letter matches 62% of names, roughly 375 rows at 606
members — on the reasoning that such a query informs nothing. That was
overridden: the finder renders the whole membership before anything is typed,
so a first letter narrowing 606 rows to 375 is a reduction the reader can see
happening, not a wall of rows out of nowhere.

`memberGroupOrder` puts the state group first when the query is a state code,
and the name group still renders below it rather than being hidden: `ny` is
both a state and a fragment of several names.

Callers apply the narrow-by chips themselves — neither match function takes a
`filters` argument. Chips intersect with the query; they never replace it, and
they are counted from the rows that matched, so they shrink as the query does.

Nothing typed is not nothing to show: with no query the finder renders the
whole corpus and every keystroke takes rows off it. That is a caller's
decision — `matchMembers('')` and `matchBills('')` still return empty buckets,
because an empty query matched nothing; it did not match everything.

## `extractCitations` is build-time only

It reads an official title and returns the ids it cites, so the index carries
the citations and never the title — official titles run past 160 characters
and no other rule reads them. Patterns are anchored at both ends and try the
longest spaced form first: without a trailing guard a citation to number 14
also answers a query for number 1; without a leading one the single-letter
Senate form matches any word ending in `s`; and without longest-first,
`s con res` loses to `s`.

Query-time code never calls it — it compares `parseBillRef(query)` against the
stored array.

## Changing a rule

Every rule above earned its shape against the real corpus — the percentages
and row counts quoted are measurements, not estimates. Change one against a
measurement, not against intuition, and move its test with it.
