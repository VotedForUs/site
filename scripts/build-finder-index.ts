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

/** Combined gzipped budget for both files. Over it, the fetch stops being free. */
export const INDEX_BUDGET_GZIP_BYTES = 60 * 1024;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(REPO_ROOT, 'src', 'data');
const OUT_DIR = path.join(REPO_ROOT, 'public', 'finder');

/** A headshot path. Anything else in the image field is a different field. */
const IMAGE_PATH = /\.(jpe?g|png|webp|avif)(\?.*)?$/i;

export type RawRecordedVote = { votes?: Record<string, string> };
export type RawBill = {
  id?: string;
  congress: number | string;
  type: string;
  number: number | string;
  title?: string;
  titles?: { titles?: Array<{ title?: string; titleType?: string; updateDate?: string }> };
  lastActionDate?: string;
  latestAction?: { actionDate?: string; text?: string };
  actions?: { actions?: Array<{ recordedVotes?: RawRecordedVote[] }> };
};

/** Thrown when a source field cannot be read as what the index needs. */
export class FinderIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinderIndexError';
  }
}

/** Every recorded vote on a bill, in file order. */
export function recordedVotesOf(bill: RawBill): RawRecordedVote[] {
  return (bill.actions?.actions ?? []).flatMap(a => a.recordedVotes ?? []);
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
 */
export function toMemberRow(raw: Record<string, unknown>, fromFile: string, casts: number): MemberRow | null {
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
  if (leg.imageUrl) row.i = 1;
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
  const legislatorsDir = path.join(dataDir, 'legislators');
  const members: MemberRow[] = [];
  if (fs.existsSync(legislatorsDir)) {
    for (const file of fs.readdirSync(legislatorsDir).filter(f => f.endsWith('.json'))) {
      const fromFile = path.basename(file, '.json');
      const raw = JSON.parse(fs.readFileSync(path.join(legislatorsDir, file), 'utf8')) as Record<string, unknown>;
      const row = toMemberRow(raw, fromFile, casts.get(fromFile) ?? 0);
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
  const files = {
    'members.json': JSON.stringify(members),
    'bills.json': JSON.stringify(bills),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, json] of Object.entries(files)) {
    fs.writeFileSync(path.join(OUT_DIR, name), json);
  }

  const { per, gzip } = measure(files);
  const rows = { 'members.json': members.length, 'bills.json': bills.length };
  for (const f of per) {
    console.log(`finder index: ${f.name} — ${rows[f.name as keyof typeof rows]} rows, ${kb(f.bytes)} (${kb(f.gzip)} gzipped)`);
  }
  console.log(`finder index: ${kb(gzip)} gzipped combined, budget ${kb(INDEX_BUDGET_GZIP_BYTES)}`);

  if (gzip > INDEX_BUDGET_GZIP_BYTES) {
    throw new FinderIndexError(
      `index is ${kb(gzip)} gzipped, over the ${kb(INDEX_BUDGET_GZIP_BYTES)} budget — drop a field before adding one`,
    );
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
