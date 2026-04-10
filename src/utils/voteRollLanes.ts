/**
 * Border accent for a row from party (Democrat / Republican / Independent / other).
 */
export type PartyBorderKind = 'dem' | 'gop' | 'ind' | 'neutral';

/**
 * Which horizontal lane a row uses when Party sort uses a two-column layout (Dem left, GOP right).
 */
export type PartyRollLane = 'dem' | 'gop' | 'other';

/**
 * Which horizontal lane a row uses when Vote sort uses a two-column layout (Yea left, Nay right).
 */
export type VoteRollLane = 'yea' | 'nay' | 'other';

/**
 * Maps legislator party string to a roll column (Democrat left, Republican right).
 *
 * @param party - Raw party from legislator data (e.g. "Democrat", "Republican", "Independent")
 * @returns Lane id for `data-roll-lane-party`
 */
export function partyRollLane(party: string): PartyRollLane {
  const p = party.trim().toLowerCase();
  if (p === 'd' || p === 'dem' || p.startsWith('democrat')) {
    return 'dem';
  }
  if (p === 'r' || p === 'rep' || p.startsWith('republican')) {
    return 'gop';
  }
  return 'other';
}

/**
 * Maps party string to a hitbox border palette (Dem blue, GOP red, Independent green, else neutral).
 *
 * @param party - Raw party from legislator data
 * @returns Kind for `data-party-border` on the row
 */
export function partyBorderKind(party: string): PartyBorderKind {
  const lane = partyRollLane(party);
  if (lane === 'dem') {
    return 'dem';
  }
  if (lane === 'gop') {
    return 'gop';
  }
  const p = party.trim().toLowerCase();
  if (p.includes('independent')) {
    return 'ind';
  }
  return 'neutral';
}

/**
 * Maps roll-call vote string to a lane (Yea left, Nay right).
 *
 * @param vote - Vote value from recorded vote data
 * @returns Lane id for `data-roll-lane-vote`
 */
export function voteRollLane(vote: string): VoteRollLane {
  const v = vote
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (v === 'yea' || v === 'aye' || v === 'yes') {
    return 'yea';
  }
  if (v === 'nay' || v === 'no') {
    return 'nay';
  }
  return 'other';
}
