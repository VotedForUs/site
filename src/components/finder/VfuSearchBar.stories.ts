/**
 * The search bar in every state it has, both modes. The bar renders its own
 * markup, so each story is the component with attributes — not a mock of what
 * the element would have built.
 */
import preview from '../../../.storybook/preview';
import type { AstroComponentFactory } from '@storybook-astro/renderer/types';
import VfuSearchBar from './VfuSearchBar.astro';
import { stateChips, statusChips } from './finderView';
import { bills, members } from '../../utils/finderMatch/fixtures';

const counts = { memberCount: 606, billCount: 739 };
const chips = { stateChips: stateChips(members), statusChips: statusChips(bills) };

const meta = preview.meta({
  title: 'Finder/SearchBar',
  component: VfuSearchBar as unknown as AstroComponentFactory,
  parameters: { layout: 'padded' },
  args: { ...counts, ...chips },
});

/** Placeholder only, members selected. */
export const MembersEmpty = meta.story({ args: { mode: 'members' } });

/** One character narrows — the field never waits for a longer query. */
export const MembersTyped = meta.story({ args: { mode: 'members', query: 'r' } });

/** The label and the placeholder swap with the mode; nothing else moves. */
export const BillsEmpty = meta.story({ args: { mode: 'bills' } });

export const BillsTyped = meta.story({ args: { mode: 'bills', query: 'hr 26' } });

/** The type row is per query: the finder pushes it back after a search. */
export const BillsWithTypeChips = meta.story({
  args: {
    mode: 'bills',
    query: 'h',
    typeChips: [
      { value: 'hr', label: 'HR 367', count: 367 },
      { value: 'hjres', label: 'HJRES 22', count: 22 },
      { value: 'hconres', label: 'HCONRES 18', count: 18 },
      { value: 'hres', label: 'HRES 95', count: 95 },
    ],
  },
});

/** Four-digit counts on both buttons — the row does not shift. */
export const FourDigitCounts = meta.story({
  args: { mode: 'members', memberCount: 1039, billCount: 1178 },
});

/** The index is in flight: aria-busy, and no skeleton — it is 148 ms warm. */
export const IndexLoading = meta.story({ args: { mode: 'members', busy: true } });

/** No index yet, so no counts and no chip rows to offer. */
export const NoIndex = meta.story({
  args: { mode: 'members', memberCount: undefined, billCount: undefined, stateChips: [], statusChips: [] },
});
