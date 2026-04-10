/**
 * Classifies synthetic per-member vote casts produced when ingesting bills.
 *
 * @see Votes app `src/congress/congress-api.ts` — `buildSenateUnanimousConsentVoteData` (`UC`),
 * `buildVoiceVoteVoteData` (`vv`).
 */

/** Senate unanimous-consent pass (no roll call); all members share this cast. */
export const VOTE_CAST_UNANIMOUS_CONSENT = 'UC' as const;

/** House or Senate voice vote (no roll call); members share this cast (`vv` in stored JSON). */
export const VOTE_CAST_VOICE_VOTE = 'vv' as const;

export type ProceduralVoteCastKind = 'unanimous-consent' | 'voice-vote';

/**
 * Whether this cast is a procedural placeholder (not Yea/Nay/Present).
 *
 * @param voteCast - Raw value from `recordedVotes` member map
 * @returns Kind for UI copy, or `null` for ordinary roll-call values
 */
export function proceduralVoteCastKind(voteCast: string): ProceduralVoteCastKind | null {
  if (voteCast === VOTE_CAST_UNANIMOUS_CONSENT) {
    return 'unanimous-consent';
  }
  if (voteCast.toLowerCase() === VOTE_CAST_VOICE_VOTE) {
    return 'voice-vote';
  }
  return null;
}
