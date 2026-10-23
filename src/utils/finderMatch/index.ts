/**
 * Pure matching functions over the finder index rows. No DOM, no fs.
 * Bills match in five ranked groups, members in three; see ./README.md for
 * why each rule is shaped the way it is.
 */
import { BILL_TYPES } from '@votedforus/votes/types';

export { BILL_TYPES };

export type MemberRow = {
  b: string; n: string; s: string; d?: number;
  p: string; c: 'house' | 'senate'; v: number; i?: 0 | 1;
};

export type BillRow = {
  i: string; t: string; n: number; y: string;
  h: string;       // display title — Popular, else newest Short, else official
  cites: string[]; // bill ids CITED by this bill: ["hconres 14"]. Named `cites`,
                   // not `c`, because MemberRow.c is the chamber.
  a: string[];     // authored aliases (nickname, abbreviation); [] is normal
  s: string; d: string; v: number;
};

export const MATCH_KINDS = ['exact-id', 'id-contains', 'id-in-title', 'alias', 'title-text'] as const;
export const MEMBER_MATCH_KINDS = ['name', 'state', 'district'] as const;
export type MatchKind = (typeof MATCH_KINDS)[number];
export type MemberMatchKind = (typeof MEMBER_MATCH_KINDS)[number];

/** Ids as they read inside prose titles: "H. Con. Res. 14" -> "h con res 14". */
const TYPE_SPACED: Record<string, string> = {
  hr: 'h r', s: 's',
  hres: 'h res', sres: 's res',
  hconres: 'h con res', sconres: 's con res',
  hjres: 'h j res', sjres: 's j res',
};

/** Lowercase, strip punctuation (em and en dashes included), collapse spaces. */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,'’"“”()\[\]{}:;!?\/\\\-\u2014\u2013]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isQueryable(q: string): boolean {
  return /[a-z0-9]/i.test(q);
}

/** Members narrow from the first character. Enforced in matchMembers, not callers. */
export const MEMBER_MIN_QUERY_LENGTH = 1;

const STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','AS','DC','GU','MP','PR','VI',
]);

export function isStateCode(q: string): boolean {
  return STATE_CODES.has(q.trim().toUpperCase());
}

/**
 * Every bill type the query could mean, exact match first — a prefix is
 * ambiguous ("h" means any of hr, hjres, hconres, hres) and is never resolved
 * to one type. The caller renders a chip per type, counted from the index.
 * Returns [] when the query is not a bare type.
 */
export function billTypeMatches(query: string): string[] {
  const q = normalise(query).replace(/\s+/g, '');
  if (!q || /\d/.test(q)) return [];
  const exact = BILL_TYPES.filter(t => t === q);
  const prefixed = BILL_TYPES.filter(t => t !== q && t.startsWith(q));
  return [...exact, ...prefixed];
}

/** True when the query is only a bill type and cannot be a text match. */
export function isBillTypeQuery(query: string): boolean {
  return billTypeMatches(query).length > 0;
}

/**
 * Parse a query that names a bill — "hconres 14", "hr26", "119-hr-26" — into
 * its type and number. Null when the query is not a bill reference.
 */
export function parseBillRef(query: string): { type: string; number: number } | null {
  const q = normalise(query).replace(/\s+/g, '');
  const m = /^(?:1\d\d)?([a-z]+)(\d+)$/.exec(q);
  if (!m) return null;
  const type = BILL_TYPES.find(t => t === m[1]);
  return type ? { type, number: Number(m[2]) } : null;
}

/**
 * BUILD TIME ONLY — the bill ids cited by an official title, so the index
 * stores the citations and never the title:
 *   "…pursuant to title II of H. Con. Res. 14." -> ["hconres 14"]
 * Anchored at both ends and longest spaced form first. Query-time code
 * compares parseBillRef(query) against the stored array instead.
 */
export function extractCitations(officialTitle: string): string[] {
  const t = normalise(officialTitle);
  const alts = Object.values(TYPE_SPACED).sort((a, b) => b.length - a.length).join('|');
  const re = new RegExp(`(?:^|[^a-z0-9])(${alts})\\s+(\\d+)(?![0-9])`, 'g');
  const out = new Set<string>();
  for (const m of t.matchAll(re)) {
    const type = Object.keys(TYPE_SPACED).find(k => TYPE_SPACED[k] === m[1]);
    if (type) out.add(`${type} ${Number(m[2])}`);
  }
  return [...out];
}

/**
 * An alias matches exactly or by prefix, in both the spaced and the compact
 * form, so a two-word nickname answers a query typed without the space.
 */
function matchesAlias(aliases: string[] | undefined, q: string, qCompact: string): boolean {
  for (const raw of aliases ?? []) {
    const a = normalise(raw);
    if (!a) continue;
    if (a === q || a.startsWith(q)) return true;
    const aCompact = a.replace(/\s+/g, '');
    if (aCompact === qCompact || aCompact.startsWith(qCompact)) return true;
  }
  return false;
}

/** Bills bucketed by match kind. A bill lands in the first group it qualifies for. */
export function matchBills(rows: BillRow[], query: string) {
  const buckets: Record<MatchKind, BillRow[]> = {
    'exact-id': [], 'id-contains': [], 'id-in-title': [], 'alias': [], 'title-text': [],
  };
  if (!isQueryable(query)) return buckets;

  const q = normalise(query);
  const qCompact = q.replace(/\s+/g, '');
  const hasDigit = /\d/.test(qCompact);
  const isNumeric = /^\d+$/.test(qCompact);
  const ref = parseBillRef(query);

  // A bare type is a filter — the caller renders a chip per matched type.
  if (isBillTypeQuery(query)) return buckets;

  for (const row of rows) {
    const idCompact = normalise(row.i).replace(/\s+/g, '');
    const displayCompact = normalise(row.t).replace(/\s+/g, '');
    const title = normalise(row.h);

    if (idCompact === qCompact || displayCompact === qCompact || String(row.n) === qCompact) {
      buckets['exact-id'].push(row); continue;
    }
    // An id match needs a digit, or every House bill matches "hr".
    if (hasDigit && (idCompact.includes(qCompact) || displayCompact.includes(qCompact))) {
      buckets['id-contains'].push(row); continue;
    }
    // THIS bill's official title cites the bill the query names. Reads the
    // build-time citations; the display title `h` has the citation stripped.
    if (ref && (row.cites ?? []).includes(`${ref.type} ${ref.number}`)) {
      buckets['id-in-title'].push(row); continue;
    }
    // Alias outranks title text: a nickname names one bill.
    if (matchesAlias(row.a, q, qCompact)) {
      buckets['alias'].push(row); continue;
    }
    // A numeric query stops at ids — years in titles swamp bill numbers.
    if (isNumeric) continue;
    // Everything else matches the title as a substring, from the first
    // character, so a part-typed word narrows instead of blanking the list.
    if (title.includes(q)) buckets['title-text'].push(row);
  }
  return buckets;
}

/** Members bucketed by name, state and district. One character narrows. */
export function matchMembers(rows: MemberRow[], query: string) {
  const buckets: Record<MemberMatchKind, MemberRow[]> = { name: [], state: [], district: [] };
  if (!isQueryable(query)) return buckets;

  const q = normalise(query);
  if (q.length < MEMBER_MIN_QUERY_LENGTH) return buckets;
  const asState = isStateCode(query) ? query.trim().toUpperCase() : null;
  const asNumber = /^\d+$/.test(q) ? Number(q) : null;

  for (const row of rows) {
    if (asState && row.s === asState) { buckets.state.push(row); continue; }
    if (asNumber !== null && row.d === asNumber) { buckets.district.push(row); continue; }
    // Names keep substring matching: a partial surname is the common case.
    if (normalise(row.n).includes(q)) buckets.name.push(row);
  }
  return buckets;
}

/** State group first when the query is a state code — name matches still render. */
export function memberGroupOrder(query: string): MemberMatchKind[] {
  return isStateCode(query) ? ['state', 'name', 'district'] : ['name', 'state', 'district'];
}

export function countBuckets<K extends string>(buckets: Record<K, unknown[]>) {
  const out = {} as Record<K, number>;
  let total = 0;
  for (const k of Object.keys(buckets) as K[]) {
    out[k] = buckets[k].length;
    total += buckets[k].length;
  }
  return { per: out, total };
}

/**
 * The call the finder uses: match buckets plus the type filter in one pass.
 * `typeFilter` drops types with no bills; `emptyTypes` carries the candidates
 * when every one of them is empty, so the UI can say why it has nothing.
 */
export function searchBills(rows: BillRow[], query: string) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.y, (counts.get(r.y) ?? 0) + 1);

  const candidates = billTypeMatches(query);
  const typeFilter = candidates.filter(t => (counts.get(t) ?? 0) > 0);
  const emptyTypes = candidates.length && !typeFilter.length ? candidates : [];

  return {
    typeFilter,
    typeCounts: Object.fromEntries(typeFilter.map(t => [t, counts.get(t) as number])),
    emptyTypes,
    buckets: matchBills(rows, query),
  };
}
