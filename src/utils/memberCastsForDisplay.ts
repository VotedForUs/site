/**
 * Site-side member list for a recorded vote.
 *
 * Package data keeps `votes` empty for UC/voice. The site still shows one
 * Yea per id in {@link VoteMemberSource.membersAtAction}: consent to the
 * chamber outcome, not a recorded cast.
 */

/** Display cast used for every id in `membersAtAction`. */
export const DISPLAY_CAST_CONSENT_YEA = 'Yea';

/** Vote fields needed to build the display map. */
export type VoteMemberSource = {
  votes?: Record<string, string>;
  membersAtAction?: string[];
  recordType?: string;
};

/**
 * True when the vote has no per-member roll and membership should be shown as Yea.
 *
 * @param vote - Recorded vote or loader entry
 * @returns Whether to use `membersAtAction` instead of `votes`
 */
export function isConsentMembershipVote(vote: VoteMemberSource): boolean {
  const recordType = vote.recordType;
  if (recordType === 'unanimous-consent' || recordType === 'voice') {
    return true;
  }
  const recordedCasts = Object.keys(vote.votes ?? {}).length;
  return recordedCasts === 0 && (vote.membersAtAction?.length ?? 0) > 0;
}

/**
 * Per-member casts for vote rolls, cards, and the legislator-vote index.
 *
 * @param vote - Recorded vote or loader entry
 * @returns Bioguide id → display cast (`Yea` for UC/voice membership)
 */
export function memberCastsForDisplay(vote: VoteMemberSource): Record<string, string> {
  if (isConsentMembershipVote(vote)) {
    const casts: Record<string, string> = {};
    for (const bioguideId of vote.membersAtAction ?? []) {
      if (bioguideId) {
        casts[bioguideId] = DISPLAY_CAST_CONSENT_YEA;
      }
    }
    return casts;
  }
  return { ...(vote.votes ?? {}) };
}

/**
 * Bioguide ids to emit as member×vote routes for a recorded vote.
 *
 * @param vote - Recorded vote or loader entry
 * @returns Ids in display-map order
 */
export function memberIdsForDisplay(vote: VoteMemberSource): string[] {
  return Object.keys(memberCastsForDisplay(vote));
}
