/**
 * Grouping, home-state lift, and find-a-member matching for the vote roll.
 *
 * Sort ranks come from {@link addVoteRollSortOrders}; this file only decides
 * how those rows are presented.
 */
import type { VoteRollRow, VoteRollRowWithOrders } from './voteRollSortOrders.js';
import { stateRollGroupKey } from './voteRollDisplay.js';

/** One state delegation in the default roll view. */
export type VoteRollStateGroup = {
  key: string;
  rows: VoteRollRowWithOrders[];
};

/**
 * Groups rows in {@link VoteRollRowWithOrders.orderState} order.
 *
 * @param ordered - Rows with sort ranks
 * @returns State groups in roll order
 */
export function buildStateGroups(ordered: VoteRollRowWithOrders[]): VoteRollStateGroup[] {
  const sorted = [...ordered].sort((a, b) => a.orderState - b.orderState);
  const groups: VoteRollStateGroup[] = [];
  for (const row of sorted) {
    const key = stateRollGroupKey(row.stateDistrict);
    const prev = groups[groups.length - 1];
    if (!prev || prev.key !== key) {
      groups.push({ key, rows: [row] });
    } else {
      prev.rows.push(row);
    }
  }
  return groups;
}

/**
 * Puts the reader's home delegation first. Other groups keep their order.
 *
 * @param groups - Groups from {@link buildStateGroups}
 * @param homeState - Two-letter state code, or empty
 * @returns Groups with the home state lifted when it exists
 */
export function liftHomeState(groups: VoteRollStateGroup[], homeState?: string): VoteRollStateGroup[] {
  const home = homeState?.trim().toUpperCase();
  if (!home) return groups;
  const index = groups.findIndex((group) => group.key.toUpperCase() === home);
  if (index <= 0) return groups;
  const next = [...groups];
  const [group] = next.splice(index, 1);
  next.unshift(group);
  return next;
}

/**
 * Whether a roll row matches the find-a-member query.
 *
 * @param row - Legislator row
 * @param query - Raw field value
 * @returns True when the query is empty or a contiguous substring of name, state, or party
 */
export function rowMatchesQuery(row: VoteRollRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [row.name, row.lastName, row.stateDistrict, row.party, row.bioguideId]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}
