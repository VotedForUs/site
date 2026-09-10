import type { RecordedVoteWithVotes } from '@votedforus/votes/types';

/**
 * Format vote counts as "{for} - {against}" (e.g. "215 - 210" for House, "49 - 47" for Senate).
 * Senate: uses senateCount.yeas/nays; House: sums votePartyTotal yeaTotal/nayTotal.
 * UC and voice votes have no recorded split; returns empty so the table shows the chamber outcome only.
 *
 * @param vote - Recorded vote with optional tallies and `recordType`
 * @returns For/against string, or empty when unavailable or non-roll-call
 */
export function formatVoteForAgainst(vote: RecordedVoteWithVotes): string {
  const recordType = vote.recordType;
  if (recordType === 'unanimous-consent' || recordType === 'voice') {
    return '';
  }
  const sc = vote.senateCount;
  if (sc != null && (sc.yeas != null || sc.nays != null)) {
    const yeas = Number(sc.yeas) || 0;
    const nays = Number(sc.nays) || 0;
    return `${yeas} - ${nays}`;
  }
  const vpt = vote.votePartyTotal;
  if (vpt?.length) {
    let yeas = 0;
    let nays = 0;
    for (const p of vpt) {
      yeas += p.yeaTotal ?? 0;
      nays += p.nayTotal ?? 0;
    }
    return `${yeas} - ${nays}`;
  }
  return '';
}
