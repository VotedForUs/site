/**
 * Which member×vote casts get a share stub, and therefore a link preview.
 *
 * A stub is one small HTML file per cast (`scripts/build-share-stubs.ts`).
 * There are about 350,000 casts, so writing all of them is a launch-time cost,
 * not a development one:
 *
 *   SHARE_STUBS unset   stubs for every cast on {@link SHARE_SAMPLE_BILLS} —
 *                       builds stay small. A card on one of those bills
 *                       shares its stub; any other shares the in-place card
 *                       URL, which always resolves.
 *   SHARE_STUBS=all     a stub for every cast, and every card shares its
 *                       stub. Set this for the production deploy once the
 *                       card images exist.
 *
 * No `astro:content` here: the stub script runs outside Astro.
 */

/** True when the build writes a stub for every cast. */
export const SHARE_STUBS_ALL: boolean = process.env.SHARE_STUBS === 'all';

/**
 * Where the card images are served from, when that is not this site.
 *
 * Unset — development and every build so far — the images are whatever
 * `npm run social-cards` has drawn into `public/social-cards/` (git-ignored;
 * the PR preview workflow draws the sample), and a cast without one previews
 * with the site's default image. Set to an absolute URL at launch
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
 * The bills whose votes get share stubs and card images outside a launch
 * build: every member's cast on every recorded vote on each of them.
 *
 * Whole bills rather than hand-picked casts, so a development build draws
 * images at a real rate and in real variety — about 2,000 of them here, one
 * in 180 of the full set. Between them these cover a House roll call, a
 * Senate roll call, a Senate unanimous consent and a House voice vote.
 * Add a bill id to widen the sample; the build cost follows.
 */
export const SHARE_SAMPLE_BILLS: readonly string[] = [
  '119-HR-4405', // Epstein Files Transparency Act — House roll call, Senate unanimous consent
  '119-S-5', // Laken Riley Act — five roll calls across both chambers
  '119-HCONRES-73', // a House voice vote
  '119-SJRES-3', // two Senate roll calls
];

/**
 * What stubs this build writes, in the form an element attribute can carry
 * and `stubsCover()` in `src/utils/voteLinks.ts` reads: `*` for every cast,
 * otherwise the sample's bill ids.
 */
export const SHARE_STUB_SCOPE: string = SHARE_STUBS_ALL ? '*' : SHARE_SAMPLE_BILLS.join(' ');
