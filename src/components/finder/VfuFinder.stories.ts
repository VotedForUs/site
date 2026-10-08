/**
 * The finder mounted as the pages mount it, with a fixture index nested in
 * the element so no story reaches the network. Each story is a state named in
 * the component's spec, seeded by the query it takes to get there.
 */
import preview from '../../../.storybook/preview';
import type { AstroComponentFactory } from '@storybook-astro/renderer/types';
import VfuFinder from './VfuFinder.astro';
import { bills, hrOnlyBills, members } from '../../utils/finderMatch/fixtures';
import type { MemberRow } from '../../utils/finderMatch/index';

const index = { members, bills };

/** A delegation big enough to show that every row renders. */
const bigDelegation: MemberRow[] = Array.from({ length: 54 }, (_, i) => ({
  b: `C${String(i).padStart(6, '0')}`,
  n: `Casey Delegate ${i + 1}`,
  s: 'CA',
  d: i + 1,
  p: i % 2 ? 'R' : 'D',
  c: 'house',
  v: 100 + i,
}));

const meta = preview.meta({
  title: 'Finder/Finder',
  component: VfuFinder as unknown as AstroComponentFactory,
  parameters: { layout: 'padded' },
  args: { index },
});

/** Nothing typed: the whole membership, and the chips that describe it. */
export const AllMembers = meta.story({ args: {} });

/** Nothing typed, bills side: every bill, every type and status chip. */
export const AllBills = meta.story({ args: { mode: 'bills' } });

/** One character already narrows; every character after it narrows again. */
export const MembersOneLetter = meta.story({ args: { mode: 'members', query: 'r' } });

export const MembersNarrowing = meta.story({ args: { mode: 'members', query: 'ry' } });

/** A two-letter query that is both a state code and a name fragment. */
export const MembersStateFirst = meta.story({ args: { mode: 'members', query: 'ny' } });

/** A large delegation renders in full — there is no page and no cut-off. */
export const MembersLargeDelegation = meta.story({
  args: { mode: 'members', query: 'ca', index: { members: bigDelegation, bills } },
});

/** A bare bill type is a facet: a chip per candidate type, and the bills of
 *  all of them listed together until one is picked. */
export const BillsTypeChips = meta.story({ args: { mode: 'bills', query: 'h' } });

/** One character on the bills side narrows too, rather than emptying the list. */
export const BillsOneLetter = meta.story({ args: { mode: 'bills', query: 'v' } });

/** Every candidate type is empty, so the reason renders instead of nothing. */
export const BillsEmptyType = meta.story({
  args: { mode: 'bills', query: 's', index: { members, bills: hrOnlyBills } },
});

/** Exact id first, then the ids containing it. */
export const BillsExactId = meta.story({ args: { mode: 'bills', query: 'hr 26' } });

/** An alias match names the alias, because it is nowhere in the title. */
export const BillsAlias = meta.story({ args: { mode: 'bills', query: 'obbb' } });

/** Nothing matched: no guess, and the other mode is offered when it has one. */
export const EmptyState = meta.story({ args: { mode: 'members', query: 'veterens' } });

/**
 * The bills request failed. Members are inline and unaffected — only the bills
 * side can fail at all — so the field still works and the hubs are reachable.
 */
export const BillIndexFailed = meta.story({
  args: { mode: 'bills', query: 'veterans', index: undefined, indexBase: '/finder-missing/' },
});
