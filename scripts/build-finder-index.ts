/**
 * @file build-finder-index.ts
 * @description Writes the finder's two static index files:
 * `public/finder/members.json` and `public/finder/bills.json`.
 *
 * Runs from `npm run build` *before* `astro build`, so `astro:content` does
 * not exist yet: this script reads `src/data/**` and `src/content/editorial/**`
 * off disk the same way the collection loaders in `src/content.config.ts` do,
 * and reuses the same display helpers so a row reads exactly like the page it
 * links to.
 *
 * It reshapes what `@votedforus/votes` already put on disk. It never decides
 * what exists — no filtering, no synthesis.
 *
 * Rows are keyed by single letters because every row ships to every reader who
 * touches the search field; `src/utils/finderMatch/README.md` documents the
 * shapes. Extraction that cannot be trusted throws: a plausible index that is
 * quietly wrong is worse than a failed build.
 *
 * ```bash
 * npm run finder:index      # write the two files and report their size
 * ```
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { getBillState } from '@votedforus/votes';
import { getBestBillTitle, getEditorialBillAliases } from '../src/utils/billTitle.js';
import { formatLegislationIdentifier } from '../src/utils/billLegislationFormat.js';
import { displayName, normalizeLegislatorForCollection } from '../src/utils/normalizeLegislatorForCollection.js';
import { extractCitations, type BillRow, type MemberRow } from '../src/utils/finderMatch/index.js';
import { getEditorialVoteAction } from '../src/utils/editorial.js';
import { heldHeadshots } from '../src/utils/headshot.js';

/** Combined gzipped budget for both files. Over it, the fetch stops being free. */
export const INDEX_BUDGET_GZIP_BYTES = 60 * 1024;

/**
 * What opening one member's record may cost: the shared vote index plus the
 * largest single member's casts. It is a fetch instead of a prerendered page,
 * so it has to stay smaller than the page would have been.
 */
export const DRILLDOWN_BUDGET_GZIP_BYTES = 48 * 1024;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(REPO_ROOT, 'src', 'data');
const OUT_DIR = path.join(REPO_ROOT, 'public', 'finder');

/** A headshot path. Anything else in the image field is a different field. */
const IMAGE_PATH = /\.(jpe?g|png|webp|avif)(\?.*)?$/i;

export type RawRecordedVote = {
  id?: string;
  chamber?: string;
  rollNumber?: number;
  question?: string;
  result?: string;
  date?: string;
  votes?: Record<string, string>;
};
export type RawBill = {
  id?: string;
  congress: number | string;
  type: string;
  number: number | string;
  title?: string;
  titles?: { titles?: Array<{ title?: string; titleType?: string; updateDate?: string }> };
  lastActionDate?: string;
  latestAction?: { actionDate?: string; text?: string };
  actions?: { actions?: Array<{ actionDate?: string; text?: string; recordedVotes?: RawRecordedVote[] }> };
};

/** Thrown when a source field cannot be read as what the index needs. */
export class FinderIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinderIndexError';
  }
}

/**
 * One recorded vote, everything about it that is not per-member. Fetched once
 * and shared by every member drill-down, so it is keyed as tightly as the
 * finder rows.
 */
export type VoteRow = {
  i: string;   // vote id — names its own bill: 119-HR-2616-184
  b: string;   // bill id
  c: 'house' | 'senate';
  r?: number;  // roll number; absent on a vote with no roll call
  q: string;   // the question, editorial copy where one is authored
  x?: string;  // the action text beneath it
  s?: string;  // result
  d: string;   // date
};

/**
 * One member's casts, as `[index into votes.json, cast]`.
 *
 * Positional because both files are written by the same run of this script:
 * they cannot disagree about the order, and naming each vote in full would
 * repeat 16 bytes of bill id 686 times over.
 */
export type MemberCasts = Array<[number, string]>;

/** Every recorded vote on a bill, in file order. */
export function recordedVotesOf(bill: RawBill): RawRecordedVote[] {
  return (bill.actions?.actions ?? []).flatMap(a => a.recordedVotes ?? []);
}

/**
 * The shared vote index, and every member's casts against it.
 *
 * Walked together because the casts are positions in the vote list: one pass,
 * one order, no way for the two files to drift.
 */
export function toVoteIndex(bills: RawBill[]): { votes: VoteRow[]; casts: Map<string, MemberCasts> } {
  const votes: VoteRow[] = [];
  const casts = new Map<string, MemberCasts>();

  for (const bill of bills) {
    const billId = bill.id ?? `${bill.congress}-${String(bill.type).toUpperCase()}-${bill.number}`;
    for (const action of bill.actions?.actions ?? []) {
      for (const rv of action.recordedVotes ?? []) {
        const id = rv.id;
        if (!id) throw new FinderIndexError(`${billId}: a recorded vote has no id`);
        const date = (action.actionDate ?? rv.date ?? '').slice(0, 10);
        if (!date) throw new FinderIndexError(`${id}: no date`);

        const index = votes.length;
        votes.push({
          i: id,
          b: billId,
          c: String(rv.chamber).toLowerCase() === 'senate' ? 'senate' : 'house',
          // A vote with no roll call carries roll 0, which names nothing.
          r: rv.rollNumber || undefined,
          q: getEditorialVoteAction(id) ?? rv.question ?? action.text ?? 'Recorded vote',
          x: action.text,
          s: rv.result,
          d: date,
        });

        for (const [bioguideId, cast] of Object.entries(rv.votes ?? {})) {
          const list = casts.get(bioguideId) ?? [];
          list.push([index, cast]);
          casts.set(bioguideId, list);
        }
      }
    }
  }
  return { votes, casts };
}

/**
 * Casts per member across every bill — the count the member row shows, and the
 * test for whether a member belongs in the index at all. Counted from the
 * per-member `votes` map, which is what the `legislatorVotes` collection is
 * built from, so the two never disagree.
 */
export function countCasts(bills: RawBill[]): Map<string, number> {
  const casts = new Map<string, number>();
  for (const bill of bills) {
    for (const rv of recordedVotesOf(bill)) {
      for (const bioguideId of Object.keys(rv.votes ?? {})) {
        casts.set(bioguideId, (casts.get(bioguideId) ?? 0) + 1);
      }
    }
  }
  return casts;
}

/**
 * One bill row. `h` is the title the pages show; `cites` comes from the raw
 * official title, which is the only place a citation to another bill survives.
 */
export function toBillRow(bill: RawBill): BillRow {
  const congress = String(bill.congress);
  const type = String(bill.type).toLowerCase();
  const number = Number(bill.number);
  const id = bill.id ?? `${congress}-${type.toUpperCase()}-${number}`;

  if (!Number.isFinite(number) || number <= 0) {
    throw new FinderIndexError(`${id}: bill number is not a number (${String(bill.number)})`);
  }
  const h = getBestBillTitle(bill as Parameters<typeof getBestBillTitle>[0]);
  if (!h.trim()) throw new FinderIndexError(`${id}: no display title`);

  const d = bill.lastActionDate ?? bill.latestAction?.actionDate;
  if (!d) throw new FinderIndexError(`${id}: no action date`);

  return {
    i: id,
    t: formatLegislationIdentifier(type, String(number)),
    n: number,
    y: type,
    h,
    cites: extractCitations(bill.title ?? ''),
    a: getEditorialBillAliases(congress, type, bill.number),
    s: getBillState(bill),
    d: d.slice(0, 10),
    v: recordedVotesOf(bill).length,
  };
}

/**
 * One member row, or null when the member has never cast a recorded vote —
 * 606 of the 793 legislator files. `v` is passed in rather than defaulted:
 * a zero here would be a member the finder should not be showing.
 *
 * Three fields are read through `normalizeLegislatorForCollection`, because
 * the raw files are inconsistent and each has a lookalike beside it: `name`
 * arrives as an object as often as a string, `latest_term` is genuinely the
 * nested key, and `latest_term.url` is the member's official *website* — using
 * it as the headshot gives every row a broken image.
 *
 * `i` is not read from the data at all. It says the row may render a portrait,
 * and the row renders `/images/legislators/{bioguide}.jpg`, so the only honest
 * source is whether that file exists: 240 of the legislator files carry a
 * congress.gov URL instead of a downloaded portrait, and trusting the field
 * gave 55 rows a 404 and 55 pages a hotlink to congress.gov.
 */
export function toMemberRow(raw: Record<string, unknown>, fromFile: string, casts: number, hasHeadshot: boolean): MemberRow | null {
  if (casts <= 0) return null;
  const leg = normalizeLegislatorForCollection(raw, fromFile);
  const b = leg.bioguide ?? fromFile;
  // `name` is an object as often as a string, and absent for a member seated
  // too recently to be in the legislator YAML — displayName covers all three.
  const name = displayName(raw);

  if (!name.trim()) {
    throw new FinderIndexError(`${b}: no display name in any of name, directOrderName, invertedOrderName`);
  }
  const state = typeof leg.state === 'string' ? leg.state.toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(state)) {
    throw new FinderIndexError(`${b}: state is "${String(leg.state)}", not a two-letter code`);
  }
  if (leg.type !== 'sen' && leg.type !== 'rep') {
    throw new FinderIndexError(`${b}: chamber is "${String(leg.type)}", neither sen nor rep`);
  }
  if (!leg.party) throw new FinderIndexError(`${b}: no party`);
  if (leg.imageUrl != null && !IMAGE_PATH.test(String(leg.imageUrl))) {
    throw new FinderIndexError(`${b}: image field holds "${String(leg.imageUrl)}", which is not an image`);
  }

  const row: MemberRow = {
    b,
    n: name.trim(),
    s: state,
    p: leg.party.trim().charAt(0).toUpperCase(),
    c: leg.type === 'sen' ? 'senate' : 'house',
    v: casts,
  };
  if (leg.type === 'rep' && typeof leg.district === 'number') row.d = leg.district;
  if (hasHeadshot) row.i = 1;
  return row;
}

/** Every bill file under src/data/bills/{congress}/{type}/{number}.json. */
export function readBills(dataDir = DATA_DIR): RawBill[] {
  const billsDir = path.join(dataDir, 'bills');
  if (!fs.existsSync(billsDir)) return [];
  const bills: RawBill[] = [];
  for (const congress of fs.readdirSync(billsDir).filter(d => /^\d+$/.test(d))) {
    const congressDir = path.join(billsDir, congress);
    for (const type of fs.readdirSync(congressDir)) {
      const typeDir = path.join(congressDir, type);
      if (!fs.statSync(typeDir).isDirectory()) continue;
      for (const file of fs.readdirSync(typeDir).filter(f => f.endsWith('.json'))) {
        bills.push(JSON.parse(fs.readFileSync(path.join(typeDir, file), 'utf8')) as RawBill);
      }
    }
  }
  return bills;
}

/** Both indexes, ordered the way the finder renders them. */
export function buildIndexes(dataDir = DATA_DIR): { bills: BillRow[]; members: MemberRow[] } {
  const rawBills = readBills(dataDir);
  const bills = rawBills.map(toBillRow).sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : a.i.localeCompare(b.i)));

  const casts = countCasts(rawBills);
  const held = heldHeadshots();
  const legislatorsDir = path.join(dataDir, 'legislators');
  const members: MemberRow[] = [];
  if (fs.existsSync(legislatorsDir)) {
    for (const file of fs.readdirSync(legislatorsDir).filter(f => f.endsWith('.json'))) {
      const fromFile = path.basename(file, '.json');
      const raw = JSON.parse(fs.readFileSync(path.join(legislatorsDir, file), 'utf8')) as Record<string, unknown>;
      const row = toMemberRow(raw, fromFile, casts.get(fromFile) ?? 0, held.has(fromFile));
      if (row) members.push(row);
    }
  }
  members.sort((a, b) => a.n.localeCompare(b.n));
  return { bills, members };
}

/** Sizes on the wire — gzip is what the reader actually downloads. */
export function measure(files: Record<string, string>) {
  const per = Object.entries(files).map(([name, json]) => ({
    name,
    bytes: Buffer.byteLength(json),
    gzip: gzipSync(json).length,
  }));
  return { per, gzip: per.reduce((n, f) => n + f.gzip, 0) };
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

async function main() {
  const { bills, members } = buildIndexes();
  const { votes, casts } = toVoteIndex(readBills());

  const files = {
    'members.json': JSON.stringify(members),
    'bills.json': JSON.stringify(bills),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, json] of Object.entries(files)) {
    fs.writeFileSync(path.join(OUT_DIR, name), json);
  }

  // The drill-down's own files: the shared vote index, and one file per member.
  const votesJson = JSON.stringify(votes);
  fs.writeFileSync(path.join(OUT_DIR, 'votes.json'), votesJson);

  const membersDir = path.join(OUT_DIR, 'members');
  fs.rmSync(membersDir, { recursive: true, force: true });
  fs.mkdirSync(membersDir, { recursive: true });
  let largestCasts = 0;
  for (const row of members) {
    const json = JSON.stringify(casts.get(row.b) ?? []);
    largestCasts = Math.max(largestCasts, gzipSync(json).length);
    fs.writeFileSync(path.join(membersDir, `${row.b}.json`), json);
  }

  const { per, gzip } = measure(files);
  const rows = { 'members.json': members.length, 'bills.json': bills.length };
  for (const f of per) {
    console.log(`finder index: ${f.name} — ${rows[f.name as keyof typeof rows]} rows, ${kb(f.bytes)} (${kb(f.gzip)} gzipped)`);
  }
  console.log(`finder index: ${kb(gzip)} gzipped combined, budget ${kb(INDEX_BUDGET_GZIP_BYTES)}`);

  // What a reader pays to open one member's record, rather than to search.
  const votesGzip = gzipSync(votesJson).length;
  console.log(
    `drill-down: votes.json — ${votes.length} rows, ${kb(Buffer.byteLength(votesJson))} (${kb(votesGzip)} gzipped)` +
    ` · ${members.length} member files, largest ${kb(largestCasts)} gzipped`,
  );
  console.log(`drill-down: ${kb(votesGzip + largestCasts)} gzipped for the first record opened, budget ${kb(DRILLDOWN_BUDGET_GZIP_BYTES)}`);

  if (gzip > INDEX_BUDGET_GZIP_BYTES) {
    throw new FinderIndexError(
      `index is ${kb(gzip)} gzipped, over the ${kb(INDEX_BUDGET_GZIP_BYTES)} budget — drop a field before adding one`,
    );
  }
  if (votesGzip + largestCasts > DRILLDOWN_BUDGET_GZIP_BYTES) {
    throw new FinderIndexError(
      `opening a record costs ${kb(votesGzip + largestCasts)} gzipped, over the ${kb(DRILLDOWN_BUDGET_GZIP_BYTES)} budget`,
    );
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
