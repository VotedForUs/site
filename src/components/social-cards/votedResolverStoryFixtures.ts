import type { VotedSampleKey } from './votedSamples';

/** Storybook args: resolve a card from on-disk bill + legislator JSON. */
export interface VotedResolverStoryArgs {
  voteId: string;
  bioguideId: string;
  /** Sample key used when resolver lookup fails. */
  fallback: VotedSampleKey;
}

/**
 * Real `(voteId, bioguideId)` pairs from `src/data/bills` and `src/data/legislators`.
 *
 * Keys match {@link votedSamples} **story labels** only — vote IDs / legislators
 * are not required to match the static sample payloads for the same key.
 */
export const votedResolverStoryFixtures = {
  /** 119-HR-1041 On Passage; short title; Rep. Robert Aderholt (AL-4). */
  short: {
    voteId: '119-HR-1041-2',
    bioguideId: 'A000055',
    fallback: 'short',
  },

  /** 119-HCONRES-14; Sen. Bernie Sanders Nay on Motion to Proceed. */
  medium: {
    voteId: '119-HCONRES-14-2',
    bioguideId: 'S000033',
    fallback: 'medium',
  },

  /** 119-HRES-916 (~1,390-char title); Rep. Robert Aderholt (AL-4). */
  'long-bill': {
    voteId: '119-HRES-916-2',
    bioguideId: 'A000055',
    fallback: 'long-bill',
  },

  /** 119-HRES-1; Rep. Gregorio Kilili Camacho Sablan (MP-0); longest `nameTitle`. */
  'long-leg': {
    voteId: '119-HRES-1-1',
    bioguideId: 'S001177',
    fallback: 'long-leg',
  },

  /** 119-HRES-354 (~1,955-char title); Rep. Charles J. "Chuck" Fleischmann (TN-3). */
  'long-both': {
    voteId: '119-HRES-354-2',
    bioguideId: 'F000459',
    fallback: 'long-both',
  },

  /** 119-S-284; Sen. Bernie Sanders UC. */
  'procedural-uc': {
    voteId: '119-S-284-1',
    bioguideId: 'S000033',
    fallback: 'procedural-uc',
  },

  /** 119-HCONRES-73 voice vote; Rep. Robert Aderholt (AL-4). */
  'procedural-voice': {
    voteId: '119-HCONRES-73-1',
    bioguideId: 'A000055',
    fallback: 'procedural-voice',
  },

  /** 119-HR-4405 suspend/pass; Rep. Mike Johnson (LA-4) Aye. */
  'house-aye': {
    voteId: '119-HR-4405-1',
    bioguideId: 'J000299',
    fallback: 'house-aye',
  },

  /** 119-HR-3486 On Passage; Rep. Hakeem Jeffries (NY-8) Nay. */
  'house-no': {
    voteId: '119-HR-3486-1',
    bioguideId: 'J000294',
    fallback: 'house-no',
  },
} as const satisfies Record<string, VotedResolverStoryArgs>;

export type VotedResolverStoryKey = keyof typeof votedResolverStoryFixtures;
