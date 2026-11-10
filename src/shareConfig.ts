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
 * Where the card images are served from, when that is not this site.
 *
 * Unset — development and every build so far — the images are the few PNGs in
 * `public/social-cards/`, and a cast without one previews with the site's
 * default image. Set to an absolute URL at launch
 * (`SOCIAL_CARDS_BASE=https://cards.votedfor.us`), every cast is taken to have
 * an image there: 360,000 PNGs do not belong in this repository or in the
 * Pages artifact.
 */
export const SOCIAL_CARDS_BASE: string | null = process.env.SOCIAL_CARDS_BASE?.replace(/\/$/, '') || null;

/** The site's default preview image, used where a cast has no card of its own. */
export const DEFAULT_CARD_PATH = '/social-card-default.png';

/**
 * A cast's card image, relative to wherever the images are served from.
 *
 * @param voteId - Recorded vote id (`119-HR-1-3`)
 * @param bioguideId - Member id
 * @returns `/social-cards/{voteId}/{bioguideId}.png`
 */
export function cardImagePath(voteId: string, bioguideId: string): string {
  return `/social-cards/${voteId}/${bioguideId}.png`;
}

/**
 * The casts that get a stub and a card image during development
 * (`npm run social-cards` draws exactly these). One of each thing the card can say: a Senate Nay, a
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
