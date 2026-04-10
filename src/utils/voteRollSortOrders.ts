/**
 * One legislator row for the vote roll UI.
 * Fields come directly from the `legislators` collection ({@link legislatorSmallSchema}).
 */
export interface VoteRollRow {
  bioguideId: string;
  stateDistrict: string;
  name: string;
  lastName: string;
  party: string;
  vote: string;
}

/**
 * Row with flex `order` ranks per sort mode (0 … n−1, smaller = earlier).
 */
export interface VoteRollRowWithOrders extends VoteRollRow {
  orderVote: number;
  orderParty: number;
  orderState: number;
  orderName: number;
}

/**
 * Lexicographic compare with `localeCompare`.
 *
 * @param a - First string
 * @param b - Second string
 * @returns Comparison result
 */
function cmp(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Builds rank arrays: for each original row index, position in sort order (0-based).
 *
 * @param n - Row count
 * @param compare - Compare two row indices (like sort callback)
 * @returns Rank per original index
 */
function ranksByIndex(n: number, compare: (i: number, j: number) => number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort(compare);
  const out = new Array<number>(n);
  idx.forEach((rowIndex, position) => {
    out[rowIndex] = position;
  });
  return out;
}

/**
 * Adds `--order-*` flex ranks for vote / party / state / name sorts.
 * Name tiebreakers: `lastName` (from collection data), then full `name`, then `bioguideId`.
 *
 * @param rows - Legislator rows (any order)
 * @returns Same rows with `orderVote`, `orderParty`, `orderState`, `orderName`
 */
export function addVoteRollSortOrders(rows: VoteRollRow[]): VoteRollRowWithOrders[] {
  const n = rows.length;
  if (n === 0) {
    return [];
  }

  const byName = (i: number, j: number) => {
    const c = cmp(rows[i].lastName, rows[j].lastName);
    if (c !== 0) {
      return c;
    }
    const c2 = cmp(rows[i].name, rows[j].name);
    if (c2 !== 0) {
      return c2;
    }
    return cmp(rows[i].bioguideId, rows[j].bioguideId);
  };
  const byState = (i: number, j: number) => {
    const c = cmp(rows[i].stateDistrict, rows[j].stateDistrict);
    return c !== 0 ? c : byName(i, j);
  };
  const byParty = (i: number, j: number) => {
    const c = cmp(rows[i].party, rows[j].party);
    return c !== 0 ? c : byName(i, j);
  };
  const byVote = (i: number, j: number) => {
    const c = cmp(rows[i].vote, rows[j].vote);
    return c !== 0 ? c : byName(i, j);
  };

  const oVote = ranksByIndex(n, byVote);
  const oParty = ranksByIndex(n, byParty);
  const oState = ranksByIndex(n, byState);
  const oName = ranksByIndex(n, byName);

  return rows.map((r, i) => ({
    ...r,
    orderVote: oVote[i],
    orderParty: oParty[i],
    orderState: oState[i],
    orderName: oName[i],
  }));
}
