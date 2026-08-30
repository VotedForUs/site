import {
  proceduralVoteCastKind,
  type ProceduralVoteCastKind,
} from './voteCastKind.js';

/**
 * Emoji to display next to the cast/action.
 *
 * @param cast - Raw vote cast string from the roll.
 * @param proc - Procedural kind, or null for a recorded vote.
 * @returns A single emoji or empty string if none applies.
 */
export function castEmoji(cast: string, proc: ProceduralVoteCastKind | null): string {
  if (proc) return '🤝';
  const normalized = cast.toLowerCase();
  if (normalized === 'yea' || normalized === 'aye') return '👍';
  if (normalized === 'nay' || normalized === 'no') return '👎';
  return '';
}

/**
 * Human-readable action label for the vote cast line.
 *
 * @param voteCast - Raw vote cast string from the roll.
 * @param proc - Procedural kind, or null for a recorded vote.
 * @returns Display text for the action option.
 */
export function actionOptionLabel(
  voteCast: string,
  proc: ProceduralVoteCastKind | null,
): string {
  if (proc === 'unanimous-consent') return 'Unanimous Consent';
  if (proc === 'voice-vote') return 'Voice Vote';
  return voteCast;
}

/**
 * Strips the trailing `(ST)` or `(ST-D)` suffix from a legislator `nameTitle`.
 *
 * @param nameTitle - Full display name with jurisdiction suffix.
 * @returns Name line for the card (e.g. "Sen. Bernie Sanders").
 */
export function displayNameFromNameTitle(nameTitle: string): string {
  return nameTitle.replace(/\s*\([^)]+\)\s*$/, '').trim();
}

/**
 * Builds the party / state / chamber subtitle under the legislator name.
 *
 * @param party - Party name (e.g. "Democrat", "Independent").
 * @param stateName - Full state or territory name (e.g. "Vermont").
 * @param chamber - `sen` or `rep`.
 * @param state - State or territory abbreviation (e.g. "NY", "MP").
 * @param district - House district number when `chamber` is `rep`.
 * @returns Subtitle string (e.g. "Independent, Vermont Senator").
 */
export function formatMemberSubtitle(
  party: string,
  stateName: string,
  chamber: 'sen' | 'rep',
  state: string,
  district?: number,
): string {
  if (chamber === 'sen') {
    return `${party}, ${stateName} Senator`;
  }
  return `${party}, ${stateName}, ${state}-${district ?? ''}`;
}

/**
 * Label above the vote cast line.
 *
 * @param proc - Procedural kind, or null for a recorded vote.
 * @returns `joined` / `joined a` for procedural votes, otherwise `voted`.
 */
export function voteVerbLabel(proc: ProceduralVoteCastKind | null): string {
  if (proc === 'unanimous-consent') return 'joined';
  if (proc === 'voice-vote') return 'joined a';
  return 'voted';
}

/** Precomputed display strings for a legislator vote view. */
export type LegislatorVoteDisplay = {
  proc: ProceduralVoteCastKind | null;
  emoji: string;
  actionLabel: string;
  displayName: string;
  memberSubtitle: string;
  voteVerb: string;
};

/** Inputs required to build {@link LegislatorVoteDisplay}. */
export type LegislatorVoteDisplayInput = {
  voteCast: string;
  nameTitle: string;
  party: string;
  stateName: string;
  chamber: 'sen' | 'rep';
  state: string;
  district?: number;
  /** Package `recordType`; drives UC/voice copy when the display cast is Yea. */
  recordType?: string;
};

/**
 * Builds card and page display strings for one legislator vote.
 *
 * @param input - Raw vote cast and legislator identity fields.
 * @returns Precomputed display strings.
 */
export function buildLegislatorVoteDisplay(input: LegislatorVoteDisplayInput): LegislatorVoteDisplay {
  const proc = proceduralVoteCastKind(input.voteCast, input.recordType);
  return {
    proc,
    emoji: castEmoji(input.voteCast, proc),
    actionLabel: actionOptionLabel(input.voteCast, proc),
    displayName: displayNameFromNameTitle(input.nameTitle),
    memberSubtitle: formatMemberSubtitle(
      input.party,
      input.stateName,
      input.chamber,
      input.state,
      input.district,
    ),
    voteVerb: voteVerbLabel(proc),
  };
}
