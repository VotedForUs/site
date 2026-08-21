import preview from '../../../.storybook/preview';
import type { AstroComponentFactory } from '@storybook-astro/renderer/types';
import VotedCard from './VotedCard.astro';
import { DEFAULT_REAL_VOTE } from './votedRealVoteDefaults';
import { votedResolvedFixtures } from './votedResolvedFixtures';
import { votedSamples } from './votedSamples';

const meta = preview.meta({
  title: 'Social Cards/VotedCard',
  component: VotedCard as unknown as AstroComponentFactory,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'card-preview',
      values: [{ name: 'card-preview', value: '#2a2a2a' }],
    },
  },
});

export const Short = meta.story({
  args: votedSamples.short,
});

export const Medium = meta.story({
  args: votedSamples.medium,
});

export const LongBill = meta.story({
  args: votedSamples['long-bill'],
});

export const LongLeg = meta.story({
  args: votedSamples['long-leg'],
});

export const LongBoth = meta.story({
  args: votedSamples['long-both'],
});

export const ProceduralUc = meta.story({
  args: votedSamples['procedural-uc'],
});

export const ProceduralVoice = meta.story({
  args: votedSamples['procedural-voice'],
});

export const HouseAye = meta.story({
  args: votedSamples['house-aye'],
});

export const HouseNo = meta.story({
  args: votedSamples['house-no'],
});

/** Real site data from resolver output (regenerate via generate-voted-resolved-fixtures.ts). */
export const RealData = meta.story({
  args: votedResolvedFixtures.sandersSjres3Nay,
  parameters: {
    docs: {
      description: {
        story: `Fixture from \`resolveLegislatorVoteViewFromFiles\` for ${DEFAULT_REAL_VOTE.voteId} / ${DEFAULT_REAL_VOTE.bioguideId}. Use /social-card-design for live resolver queries.`,
      },
    },
  },
});
