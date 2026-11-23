/**
 * What a bill list page shows, worked out from the finder's bill index: which
 * bills belong to the page, how they group, and the links between the lists.
 *
 * The list pages read the same rows the finder searches, so a bill is listed
 * exactly when it can be found, under the same title, with the same status.
 */
import { BILL_TYPES, type BillRow } from './finderMatch/index.js';
import { formatLegislationIdentifier } from './billLegislationFormat.js';

/** A bill's status as a reader says it. The finder uses the same words. */
export const BILL_STATUS_LABELS: Record<string, string> = {
  becameLaw: 'became law',
  inProgress: 'in progress',
  rejected: 'failed',
};

/** The order the groups appear in: what was decided first, then what is open. */
export const BILL_STATUS_ORDER = ['becameLaw', 'inProgress', 'rejected'] as const;

export type BillGroup = { status: string; label: string; rows: BillRow[] };
export type TypeLink = { type: string | null; label: string; count: number; href: string; current: boolean };

/** The congress a row belongs to — the first part of `119-HR-1`. */
export function termOf(row: BillRow): string {
  return row.i.split('-')[0];
}

/** The rows of one congress, and of one bill type when one is named. */
export function billsOfTerm(rows: BillRow[], term: string | number, type?: string): BillRow[] {
  const wanted = type?.toLowerCase();
  return rows.filter(row => termOf(row) === String(term) && (!wanted || row.y === wanted));
}

/**
 * The rows by status, in {@link BILL_STATUS_ORDER}. A status nobody listed
 * here still gets a group, after the known ones, rather than being dropped.
 * The rows keep the order they came in — the index is newest action first.
 */
export function groupByStatus(rows: BillRow[]): BillGroup[] {
  const byStatus = new Map<string, BillRow[]>();
  for (const row of rows) {
    const list = byStatus.get(row.s);
    if (list) list.push(row);
    else byStatus.set(row.s, [row]);
  }
  const known: readonly string[] = BILL_STATUS_ORDER;
  const order = [...known.filter(status => byStatus.has(status)), ...[...byStatus.keys()].filter(status => !known.includes(status))];
  return order.map(status => ({ status, label: BILL_STATUS_LABELS[status] ?? status, rows: byStatus.get(status)! }));
}

/** "H.R." for `hr` — the prefix a reader knows the type by. */
export function typePrefix(type: string): string {
  return formatLegislationIdentifier(type, '').trim();
}

function joinBase(base: string, path: string): string {
  return `${base.endsWith('/') ? base.slice(0, -1) : base}${path}`;
}

/**
 * The links across the top of a list: every bill of the congress, then one
 * per type that has any, in the order the votes package lists the types.
 *
 * @param rows - Every bill of the congress, not just the type being shown
 * @param current - The type the page is showing; omitted on the whole-congress page
 */
export function typeLinks(rows: BillRow[], term: string | number, base = '/', current?: string): TypeLink[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.y, (counts.get(row.y) ?? 0) + 1);
  const active = current?.toLowerCase();
  return [
    { type: null, label: 'All', count: rows.length, href: joinBase(base, `/bills/${term}`), current: !active },
    ...BILL_TYPES.filter(type => counts.has(type)).map(type => ({
      type,
      label: typePrefix(type),
      count: counts.get(type)!,
      href: joinBase(base, `/bills/${term}/${type}`),
      current: type === active,
    })),
  ];
}
