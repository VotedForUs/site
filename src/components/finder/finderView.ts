/**
 * Everything the finder decides that is not the DOM: chip rows, filtering,
 * group labels, hrefs, highlight spans and the copy for each state.
 *
 * Kept out of the custom elements so it can be tested without a browser, and
 * so both elements read the same rules. Matching itself lives in
 * `src/utils/finderMatch/`; this is what the caller does with the buckets.
 */
import {
  BILL_TYPES,
  MATCH_KINDS,
  MEMBER_MATCH_KINDS,
  normalise,
  type BillRow,
  type MatchKind,
  type MemberMatchKind,
  type MemberRow,
} from '../../utils/finderMatch/index.js';
import { stateNameFromCode } from '../../utils/stateNames.js';

export type Mode = 'members' | 'bills';
export type Filters = { state: string[]; type: string[]; status: string[] };

/** The label a group carries when nothing has been typed yet. */
export function allGroupLabel(mode: Mode): string {
  return mode === 'members' ? 'all members' : 'all bills';
}

/**
 * The group label for a bare type query — every type the query could mean,
 * named, because the rows below are all of them together rather than one type
 * the reader did not ask for.
 */
export function typeGroupLabel(types: string[]): string {
  return types.map(type => type.toUpperCase()).join(' · ');
}

/** A fresh, unfiltered set — never a shared constant, the arrays get replaced. */
export function emptyFilters(): Filters {
  return { state: [], type: [], status: [] };
}

/** Why a row is in the result, in the order the groups render. */
export const GROUP_LABELS: Record<MatchKind, string> = {
  'exact-id': 'exact match',
  'id-contains': 'number contains',
  'id-in-title': 'cited in the title',
  'alias': 'known as',
  'title-text': 'matched in the title',
};

export const MEMBER_GROUP_LABELS: Record<MemberMatchKind, string> = {
  name: 'name',
  state: 'state delegation',
  district: 'district',
};

/** getBillState values, as a reader would say them. */
export const STATUS_LABELS: Record<string, string> = {
  becameLaw: 'became law',
  inProgress: 'in progress',
  rejected: 'failed',
};

const PARTY_NAMES: Record<string, string> = {
  D: 'Democrat', R: 'Republican', I: 'Independent', L: 'Libertarian',
};

export const MODE_COPY: Record<Mode, { button: string; placeholder: string; hint: string }> = {
  members: {
    button: 'Search members',
    placeholder: 'a name or a state',
    hint: 'a member query returns the member, not the bills they sponsored',
  },
  bills: {
    button: 'Search bills',
    placeholder: 'a number, a title, a nickname',
    hint: 'ids, titles, and the names bills are known by',
  },
};

/** One chip: a value, what it says, and how many rows it leads to. */
export type Chip = { value: string; label: string; count: number };

/**
 * Chip rows describe the rows that are showing, so they shrink as the query
 * narrows: a state with no one left in the result set is not a filter, it is a
 * dead end. Each row is counted before its own filter is applied and after the
 * other rows', so a chip you can switch off never disappears under you.
 */

/** Every state with a member in the result set, alphabetical, count appended. */
export function stateChips(rows: MemberRow[]): Chip[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.s, (counts.get(row.s) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, count]) => ({ value, label: `${value} ${count}`, count }));
}

/** One chip per bill type present, in the order the votes package lists them. */
export function typeChips(rows: BillRow[]): Chip[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.y, (counts.get(row.y) ?? 0) + 1);
  return BILL_TYPES
    .filter(type => counts.has(type))
    .map(type => ({ value: type, label: `${type.toUpperCase()} ${counts.get(type)}`, count: counts.get(type)! }));
}

/** One chip per bill status present, in the order a bill travels. */
export function statusChips(rows: BillRow[]): Chip[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.s, (counts.get(row.s) ?? 0) + 1);
  const order = ['inProgress', 'becameLaw', 'rejected'];
  return [...counts.entries()]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([value, count]) => ({ value, label: `${STATUS_LABELS[value] ?? value} ${count}`, count }));
}

/**
 * Chips narrow the query, they never replace it: an empty row means every
 * value passes, and two active rows intersect.
 */
export function filterMembers(rows: MemberRow[], filters: Filters): MemberRow[] {
  if (!filters.state.length) return rows;
  return rows.filter(row => filters.state.includes(row.s));
}

export function filterBills(rows: BillRow[], filters: Filters): BillRow[] {
  return rows.filter(row =>
    (!filters.type.length || filters.type.includes(row.y)) &&
    (!filters.status.length || filters.status.includes(row.s)));
}

/** The prerendered page a row links to. Selecting a result is a navigation. */
export function memberHref(row: MemberRow, base = '/'): string {
  return joinBase(base, `/members/${row.b}`);
}

export function billHref(row: BillRow, base = '/'): string {
  const [congress] = row.i.split('-');
  return joinBase(base, `/bills/${congress}/${row.y}/${row.n}`);
}

function joinBase(base: string, path: string): string {
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${trimmed}${path}`;
}

/** "Democrat · New York · NY-18 · House" — the row's second line. */
export function memberMeta(row: MemberRow): string {
  const parts = [
    PARTY_NAMES[row.p] ?? row.p,
    stateNameFromCode(row.s),
    row.c === 'house' && row.d != null ? `${row.s}-${row.d}` : null,
    row.c === 'house' ? 'House' : 'Senate',
  ];
  return parts.filter(Boolean).join(' · ');
}

/**
 * Why this bill matched, said in the row. Only the alias group needs it: the
 * matched text is nowhere in the title, so without the reason the reader has
 * no way to tell why the row is there. The alias never replaces the title.
 */
export function billWhy(kind: MatchKind, row: BillRow, query: string): string {
  if (kind !== 'alias') return GROUP_LABELS[kind];
  const q = normalise(query);
  const matched = row.a.find(a => {
    const n = normalise(a);
    return n.startsWith(q) || n.replace(/\s+/g, '').startsWith(q.replace(/\s+/g, ''));
  });
  return matched ? `known as “${matched}”` : GROUP_LABELS.alias;
}

/** The three pieces of a title around the matched text, for a single <mark>. */
export function highlight(text: string, query: string): { pre: string; hit: string; post: string } {
  const q = normalise(query).trim();
  if (!q) return { pre: text, hit: '', post: '' };
  const i = normalise(text).indexOf(q);
  if (i < 0) return { pre: text, hit: '', post: '' };
  // normalise collapses runs, so map back by walking the raw string.
  return { pre: text.slice(0, i), hit: text.slice(i, i + q.length), post: text.slice(i + q.length) };
}

/** An empty state always offers an action — here, the other mode. */
export function emptyState(mode: Mode, query: string, otherCount: number) {
  const both = otherCount === 0;
  const title = both
    ? `Nothing matches “${query}”.`
    : mode === 'members'
      ? `No member matches “${query}”.`
      : `No bill matches “${query}”.`;
  const body = both
    ? 'The typed characters are matched exactly as written, in order, and the spelling is never corrected. Shortening the query is the fastest way to widen it.'
    : mode === 'members'
      ? 'Member search covers names, states, and districts. It does not search the text of bills — a bill about a person will not appear here.'
      : 'Bill search covers ids, titles, and the short names bills are known by. It does not search sponsors — a bill introduced by a member with this name will not appear here.';
  const other = mode === 'members'
    ? `${otherCount} ${otherCount === 1 ? 'bill' : 'bills'}`
    : `${otherCount} ${otherCount === 1 ? 'member' : 'members'}`;
  return {
    title,
    body,
    otherLabel: both ? 'Clear the search' : `See ${other} matching “${query}”`,
  };
}

/** "48 bills · every match in the document". Every match renders; there is no page. */
export function footerLine(total: number, mode: Mode): string {
  const noun = mode === 'members'
    ? `${total} ${total === 1 ? 'member' : 'members'}`
    : `${total} ${total === 1 ? 'bill' : 'bills'}`;
  const tail = mode === 'members'
    ? 'ordered by name, nothing remembered between visits'
    : 'every match in the document';
  return `${noun} · ${tail}`;
}

/** A type query returned no bills at all — say which types were empty. */
export function emptyTypeReason(emptyTypes: string[]): string {
  const names = emptyTypes.map(t => t.toUpperCase()).join(', ');
  return `No ${names} bill has a recorded vote.`;
}

export { MATCH_KINDS, MEMBER_MATCH_KINDS };
