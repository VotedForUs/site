/**
 * Which member×vote casts get a share stub, and therefore a link preview.
 *
 * A stub is one small HTML file per cast (`scripts/build-share-stubs.ts`).
 * There are about 350,000 casts, so writing all of them is a launch-time cost,
 * not a development one:
 *
 *   SHARE_STUBS unset   stubs for {@link SHARE_SAMPLE} only — every build,
 *                       local and CI, stays small. The card's share link is
 *                       the in-place card URL, which always resolves.
 *   SHARE_STUBS=all     a stub for every cast, and the card's share link is
 *                       the stub. Set this for the production deploy once the
 *                       card images exist.
 *
 * No `astro:content` here: the stub script runs outside Astro.
 */

/** True when the build writes a stub for every cast. */
export const SHARE_STUBS_ALL: boolean = process.env.SHARE_STUBS === 'all';

/**
 * The casts that get a stub (and, once the generator is rebuilt, a card image)
 * during development. One of each thing the card can say: a Senate Nay, a
 * House Yea, a Not Voting, a unanimous consent and a voice vote.
 */
export const SHARE_SAMPLE: ReadonlyArray<{ voteId: string; bioguideId: string }> = [
  { voteId: '119-HR-1-3', bioguideId: 'A000382' },
  { voteId: '119-HR-4405-1', bioguideId: 'A000055' },
  { voteId: '119-HR-1-4', bioguideId: 'K000394' },
  { voteId: '119-HCONRES-30-1', bioguideId: 'A000055' },
  { voteId: '119-HCONRES-22-1', bioguideId: 'A000382' },
  { voteId: '119-HCONRES-73-1', bioguideId: 'A000055' },
];
