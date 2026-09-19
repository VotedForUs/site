/**
 * Card dialog in both contexts. Open over a roll is the canonical share page.
 */
import preview from '../../.storybook/preview';
import type { AstroComponentFactory } from '@storybook-astro/renderer/types';
import VfuVoteCard from './VfuVoteCard.astro';
import { votedSamples } from './social-cards/votedSamples';

const meta = preview.meta({
  title: 'Bills/VfuVoteCard',
  component: VfuVoteCard as unknown as AstroComponentFactory,
  parameters: { layout: 'padded' },
});

/** Open over the roll — prev/next step adjacent members. */
export const OpenOverRoll = meta.story({
  args: {
    open: true,
    voteId: '119-HR-2616-184',
    bioguideId: 'R000579',
    context: 'bill',
    closeHref: '/bills/119/hr/2616/184',
    prevHref: '/bills/119/hr/2616/184/A000055',
    nextHref: '/bills/119/hr/2616/184/S001150',
    shareUrl: 'https://votedfor.us/bills/119/hr/2616/184/R000579',
    card: votedSamples.short,
  },
});

/** Open over a member record — prev/next step that member's votes. */
export const OpenOverMember = meta.story({
  args: {
    open: true,
    voteId: '119-HR-2616-184',
    bioguideId: 'R000579',
    context: 'member',
    closeHref: '/members/R000579/119/hr-2616',
    prevHref: '/members/R000579/119/hr-2616/183',
    nextHref: '/members/R000579/119/hr-1/190',
    shareUrl: 'https://votedfor.us/bills/119/hr/2616/184/R000579',
    card: votedSamples.short,
  },
});
