/**
 * Classifies non-roll-call votes for card copy.
 *
 * Prefer {@link proceduralVoteKindFromRecordType}. Cast codes `UC` / `vv` remain
 * so a stale cache does not lose the vote-kind label.
 */

/** Legacy stored cast for Senate UC; kept so stale pages still classify. */
export const VOTE_CAST_UNANIMOUS_CONSENT = 'UC' as const;

/** Legacy stored cast for voice votes; kept so stale pages still classify. */
export const VOTE_CAST_VOICE_VOTE = 'vv' as const;

export type ProceduralVoteCastKind = 'unanimous-consent' | 'voice-vote';

/**
 * Vote kind from package `recordType`.
 *
 * @param recordType - `roll-call` | `unanimous-consent` | `voice`
 * @returns Kind for UI copy, or `null` for roll calls / unknown
 */
export function proceduralVoteKindFromRecordType(
  recordType?: string,
): ProceduralVoteCastKind | null {
  if (recordType === 'unanimous-consent') return 'unanimous-consent';
  if (recordType === 'voice') return 'voice-vote';
  return null;
}

/**
 * Whether this vote is UC or voice (doctrine copy, not a recorded cast).
 *
 * @param voteCast - Display or legacy cast (`Yea`, `UC`, `vv`)
 * @param recordType - Optional package `recordType`
 * @returns Kind for UI copy, or `null` for ordinary roll-call values
 */
export function proceduralVoteCastKind(
  voteCast: string,
  recordType?: string,
): ProceduralVoteCastKind | null {
  const fromType = proceduralVoteKindFromRecordType(recordType);
  if (fromType) return fromType;
  if (voteCast === VOTE_CAST_UNANIMOUS_CONSENT) {
    return 'unanimous-consent';
  }
  if (voteCast.toLowerCase() === VOTE_CAST_VOICE_VOTE) {
    return 'voice-vote';
  }
  return null;
}
