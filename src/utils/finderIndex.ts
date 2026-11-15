/**
 * The built finder index, read at build time.
 *
 * `scripts/build-finder-index.ts` writes the two files before `astro build`,
 * so a page can render the members, the corpus counts and the narrow-by chips
 * into the HTML instead of waiting for the browser to fetch and count them.
 *
 * The two files are read independently: a missing `bills.json` must not take
 * the member list down with it. Whatever is missing is null, and the copy that
 * would have used it is left out rather than guessed.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { memberStatus, type BillRow, type MemberRow, type MemberStatus } from './finderMatch/index.js';

/** Both collections, as a story or a test supplies them. */
export type FinderIndex = { members: MemberRow[]; bills: BillRow[] };
/** What the build left on disk — either half may be absent. */
export type BuiltFinderIndex = { members: MemberRow[] | null; bills: BillRow[] | null };

/** Parsed once per process. A failure is never cached: in dev the file may
 *  simply not have been generated yet, and the next render should see it. */
const cache = new Map<string, unknown[]>();

function readRows<T>(publicDir: string, name: string): T[] | null {
  const file = path.join(publicDir, 'finder', name);
  const cached = cache.get(file);
  if (cached) return cached as T[];
  try {
    const rows = JSON.parse(fs.readFileSync(file, 'utf8')) as T[];
    cache.set(file, rows);
    return rows;
  } catch {
    return null;
  }
}

export function readFinderIndex(publicDir = path.join(process.cwd(), 'public')): BuiltFinderIndex {
  return {
    members: readRows<MemberRow>(publicDir, 'members.json'),
    bills: readRows<BillRow>(publicDir, 'bills.json'),
  };
}

export function readFinderCounts(publicDir?: string): { members: number; bills: number } | null {
  const { members, bills } = readFinderIndex(publicDir);
  return members && bills ? { members: members.length, bills: bills.length } : null;
}

/**
 * Current or former, for one member — the index is the one place that decides
 * it, so a member's own page says what their row in the finder says.
 *
 * @returns null when the index is not built or does not hold the member
 */
export function readMemberStatus(bioguideId: string, publicDir?: string): MemberStatus | null {
  const members = readFinderIndex(publicDir).members;
  if (!members) return null;
  let byId = statuses.get(members);
  if (!byId) {
    byId = new Map(members.map(member => [member.b, memberStatus(member)]));
    statuses.set(members, byId);
  }
  return byId.get(bioguideId) ?? null;
}

/** One lookup table per parsed index — 606 pages each ask for one member. */
const statuses = new WeakMap<MemberRow[], Map<string, MemberStatus>>();
