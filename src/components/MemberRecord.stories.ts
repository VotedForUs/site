/**
 * The member path, one story per state, all from fixtures — no collection is
 * read and no route is involved, which is the point of the component taking
 * resolved props.
 *
 * The selected states mount the real element with its data inline, so a story
 * exercises the same code a reader does rather than a mock of its output.
 */
import preview from '../../.storybook/preview';
import type { AstroComponentFactory } from '@storybook-astro/renderer/types';
import MemberRecord from './MemberRecord.astro';
import {
  bills,
  memberIndex,
  representative,
  senateBills,
  senateIndex,
  senator,
  withoutHeadshot,
} from './memberRecordFixtures';

const meta = preview.meta({
  title: 'Members/MemberRecord',
  component: MemberRecord as unknown as AstroComponentFactory,
  parameters: { layout: 'padded' },
});

/** A member and the bills they have voted on, newest first. */
export const RepresentativeBills = meta.story({
  args: { member: representative, bills },
});

/** A senator's record — the same shape, no district in the subtitle. */
export const SenatorBills = meta.story({
  args: { member: senator, bills: senateBills },
});

/** A member with no headshot on file. */
export const NoHeadshot = meta.story({
  args: { member: withoutHeadshot, bills },
});

/** A bill picked: the list folds to that one line, their votes follow it. */
export const BillSelected = meta.story({
  args: { member: representative, bills, selected: 'hr-7008', index: memberIndex },
});

/** A voice vote: the cast reads Yea, and the kind is named with it. */
export const VoiceVote = meta.story({
  args: { member: representative, bills, selected: 'hr-1722', index: memberIndex },
});

/** Unanimous consent, in the Senate, under the same rule. */
export const UnanimousConsent = meta.story({
  args: { member: senator, bills: senateBills, selected: 's-4465', index: senateIndex },
});

/** A member with no recorded votes at all. */
export const NoBills = meta.story({
  args: { member: representative, bills: [] },
});
