/**
 * Resolves a legislator vote view from Astro content collections.
 * Keep this module separate so Storybook/Vite never imports `astro:content`.
 */
import {
  resolveLegislatorVoteViewWithSources,
  type ResolveLegislatorVoteResult,
} from './legislatorVoteView.js';

/**
 * Resolves a legislator vote view from Astro content collections.
 *
 * @param params - Vote and legislator ids.
 * @returns Discriminated union with the view or a failure reason.
 */
export async function resolveLegislatorVoteView(
  params: { voteId: string; bioguideId: string },
): Promise<ResolveLegislatorVoteResult> {
  const { getEntry } = await import('astro:content');

  return resolveLegislatorVoteViewWithSources(params, {
    getLegislatorVote: async (id) => {
      const entry = await getEntry('legislatorVotes', id);
      return entry?.data;
    },
    getLegislator: async (bioguideId) => {
      const entry = await getEntry('legislators', bioguideId);
      return entry?.data;
    },
  });
}
