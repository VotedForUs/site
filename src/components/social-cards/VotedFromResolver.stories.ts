import preview from '../../../.storybook/preview';
import type { AstroComponentFactory } from '@storybook-astro/renderer/types';
import VotedFromResolver from './VotedFromResolver.astro';
import { votedResolverStoryFixtures } from './votedResolverStoryFixtures';

const meta = preview.meta({
  title: 'Social Cards/Voted (resolved)',
  component: VotedFromResolver as unknown as AstroComponentFactory,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'card-preview',
      values: [{ name: 'card-preview', value: '#2a2a2a' }],
    },
  },
  argTypes: {
    voteId: { control: 'text', description: 'Recorded vote id from bill JSON (e.g. 119-HR-1041-2).' },
    bioguideId: { control: 'text', description: 'Legislator bioguide id (e.g. S000033).' },
    fallback: {
      control: 'select',
      options: Object.keys(votedResolverStoryFixtures),
      description: 'Static sample used when resolver lookup fails.',
    },
  },
});

export const Short = meta.story({
  args: votedResolverStoryFixtures.short,
});

export const Medium = meta.story({
  args: votedResolverStoryFixtures.medium,
});

export const LongBill = meta.story({
  args: votedResolverStoryFixtures['long-bill'],
});

export const LongLeg = meta.story({
  args: votedResolverStoryFixtures['long-leg'],
});

export const LongBoth = meta.story({
  args: votedResolverStoryFixtures['long-both'],
});

export const ProceduralUc = meta.story({
  args: votedResolverStoryFixtures['procedural-uc'],
});

export const ProceduralVoice = meta.story({
  args: votedResolverStoryFixtures['procedural-voice'],
});

export const HouseAye = meta.story({
  args: votedResolverStoryFixtures['house-aye'],
});

export const HouseNo = meta.story({
  args: votedResolverStoryFixtures['house-no'],
});
