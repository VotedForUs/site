/**
 * Both variants of the vote list. The bill variant is every vote on a bill;
 * the member variant adds what one member did about it.
 */
import preview from '../../.storybook/preview';
import type { AstroComponentFactory } from '@storybook-astro/renderer/types';
import VoteTable from './VoteTable.astro';
import { unanimousConsent, votes, voiceVote } from './memberRecordFixtures';

const meta = preview.meta({
  title: 'Members/VoteTable',
  component: VoteTable as unknown as AstroComponentFactory,
  parameters: { layout: 'padded' },
});

/** On a bill: chamber, question, result. No cast, because no member is named. */
export const BillVariant = meta.story({
  args: { votes, variant: 'bill' },
});

/** On a member's record: the same rows, plus what they did. */
export const MemberVariant = meta.story({
  args: { votes, variant: 'member', bioguideId: 'R000579' },
});

/** The row the page is currently showing. */
export const SelectedRow = meta.story({
  args: { votes, variant: 'member', bioguideId: 'R000579', selectedVoteId: '119-HR-7008-279' },
});

/** A single vote is still a list of one. */
export const SingleVote = meta.story({
  args: { votes: votes.slice(0, 1), variant: 'bill' },
});

/**
 * A voice vote has no roll call. The position reads Yea by consent, and the
 * kind is rendered with it — never one without the other, and never `vv`.
 */
export const VoiceVoteRow = meta.story({
  args: { votes: voiceVote, variant: 'member', bioguideId: 'R000579' },
});

/** Unanimous consent, under the same rule. */
export const UnanimousConsentRow = meta.story({
  args: { votes: unanimousConsent, variant: 'member', bioguideId: 'S001188' },
});
