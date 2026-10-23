/**
 * Shape a recorded vote's membership into {@link VoteRollRow}s.
 */
import type { LegislatorSmall } from '@votedforus/votes/types';
import type { VoteRollRow } from './voteRollSortOrders.js';

/**
 * One roll row from a legislator record and their display cast.
 *
 * @param bioguideId - Member id
 * @param voteCast - Display cast (`Yea` on consent votes)
 * @param leg - Legislator collection row, if found
 * @param chamber - `house` or `senate`
 * @returns Row for {@link VoteRoll}
 */
export function toVoteRollRow(
  bioguideId: string,
  voteCast: string,
  leg: LegislatorSmall | undefined,
  chamber: string,
): VoteRollRow {
  const state = leg?.state ?? '';
  const district = leg?.district != null ? `-${leg.district}` : '';
  const seatSuffix = leg?.stateRank === 'senior' ? '-s1' : leg?.stateRank === 'junior' ? '-s2' : '';
  const stateDistrict =
    chamber === 'senate'
      ? (state.length > 0 ? `${state}${seatSuffix}` : bioguideId)
      : `${state}${district}`;
  return {
    bioguideId,
    stateDistrict,
    name: leg?.name ?? leg?.nameTitle ?? bioguideId,
    lastName: leg?.lastName ?? '',
    party: leg?.party ?? '',
    vote: voteCast,
  };
}
