/**
 * The full roll: House and Senate sizes, plus UC/voice where sort-by-cast is absent.
 */
import preview from '../../.storybook/preview';
import type { AstroComponentFactory } from '@storybook-astro/renderer/types';
import VoteRoll from './VoteRoll.astro';
import type { VoteRollRow } from '../utils/voteRollSortOrders';

const house: VoteRollRow[] = [
  { bioguideId: 'R000579', stateDistrict: 'NY-18', name: 'Rep. Patrick Ryan', lastName: 'Ryan', party: 'Democrat', vote: 'Yea' },
  { bioguideId: 'A000055', stateDistrict: 'AL-4', name: 'Rep. Robert Aderholt', lastName: 'Aderholt', party: 'Republican', vote: 'Nay' },
  { bioguideId: 'S001150', stateDistrict: 'CA-16', name: 'Rep. Sam Liccardo', lastName: 'Liccardo', party: 'Democrat', vote: 'Yea' },
  { bioguideId: 'M001244', stateDistrict: 'FL-15', name: 'Rep. Laurel Lee', lastName: 'Lee', party: 'Republican', vote: 'Present' },
];

const senate: VoteRollRow[] = [
  { bioguideId: 'S000033', stateDistrict: 'VT-s1', name: 'Sen. Bernie Sanders', lastName: 'Sanders', party: 'Independent', vote: 'Yea' },
  { bioguideId: 'C000127', stateDistrict: 'NY-s1', name: 'Sen. Kirsten Gillibrand', lastName: 'Gillibrand', party: 'Democrat', vote: 'Yea' },
  { bioguideId: 'C001056', stateDistrict: 'TX-s2', name: 'Sen. John Cornyn', lastName: 'Cornyn', party: 'Republican', vote: 'Nay' },
  { bioguideId: 'W000817', stateDistrict: 'MS-s2', name: 'Sen. Roger Wicker', lastName: 'Wicker', party: 'Republican', vote: 'Nay' },
];

const consentHouse: VoteRollRow[] = house.map((r) => ({ ...r, vote: 'Yea' }));
const consentSenate: VoteRollRow[] = senate.map((r) => ({ ...r, vote: 'Yea' }));

const meta = preview.meta({
  title: 'Bills/VoteRoll',
  component: VoteRoll as unknown as AstroComponentFactory,
  parameters: { layout: 'padded' },
});

/** House-sized roll, default state grouping. */
export const HouseRoll = meta.story({
  args: {
    rows: house,
    stateHeader: 'District',
    sortGroupName: 'vr-house',
    voteId: '119-HR-2616-184',
  },
});

/** Senate-sized roll. */
export const SenateRoll = meta.story({
  args: {
    rows: senate,
    stateHeader: 'Seat',
    sortGroupName: 'vr-senate',
    voteId: '119-S-5-12',
  },
});

/** Arrived from a New York member — that delegation is lifted. */
export const HomeStateLifted = meta.story({
  args: {
    rows: house,
    stateHeader: 'District',
    sortGroupName: 'vr-home',
    voteId: '119-HR-2616-184',
    homeState: 'NY',
    selectedBioguideId: 'R000579',
  },
});

/** Voice vote: uniform Yea, kind in the header, no sort-by-cast. */
export const HouseVoice = meta.story({
  args: {
    rows: consentHouse,
    stateHeader: 'District',
    sortGroupName: 'vr-voice',
    voteId: '119-HRES-1-1',
    consent: true,
    kindLabel: 'Voice Vote',
  },
});

/** Senate unanimous consent. */
export const SenateUnanimousConsent = meta.story({
  args: {
    rows: consentSenate,
    stateHeader: 'Seat',
    sortGroupName: 'vr-uc',
    voteId: '119-S-5-1',
    consent: true,
    kindLabel: 'Unanimous Consent',
  },
});
