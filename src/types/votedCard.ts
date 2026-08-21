/**
 * Props for the social OG card ({@link VotedCard}).
 * Display strings are precomputed (via {@link buildLegislatorVoteDisplay} /
 * {@link toVotedCardProps}) so the Astro component does not re-derive them.
 */
export type VotedCardProps = {
  /** Display name with title prefix (e.g. "Sen. Mike Braun (IN)"). */
  nameTitle: string;
  /** Party name from legislator data (e.g. "Democrat", "Independent"). */
  party: string;
  /** Full state or territory name (e.g. "Vermont"). */
  stateName: string;
  /** Chamber: `sen` or `rep`. */
  chamber: 'sen' | 'rep';
  /** State or territory abbreviation (e.g. "NY", "MP"). */
  state: string;
  /** House district when `chamber` is `rep`. */
  district?: number;
  /** Member headshot URL. */
  imageUrl: string;
  /** Raw cast from the roll: Yea, Nay, Aye, No, Present, UC, vv, "Not Voting". */
  voteCast: string;
  /** Vote question (e.g. "On Passage"). */
  voteTitle: string;
  /** Legislation identifier (e.g. "S. 960", "H. Res. 354"). */
  legislationIdentifier: string;
  /** Legislation type label (e.g. "act", "joint resolution"). */
  legislationType: string;
  /** Full displayed bill title. */
  billTitle: string;
  /** Name line without jurisdiction suffix. */
  displayName: string;
  /** Party / state / chamber subtitle. */
  memberSubtitle: string;
  /** Verb above the cast line (`voted`, `joined`, `joined a`). */
  voteVerb: string;
  /** Emoji beside the cast, or empty. */
  emoji: string;
  /** Human-readable action option (cast or procedural label). */
  actionLabel: string;
};

/** Raw card fields before display strings are attached. */
export type VotedCardSource = Omit<
  VotedCardProps,
  'displayName' | 'memberSubtitle' | 'voteVerb' | 'emoji' | 'actionLabel'
>;
