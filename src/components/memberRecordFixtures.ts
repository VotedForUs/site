/**
 * Fixtures for the member-path stories: a representative, a senator, and the
 * votes behind them. Shaped like the collections but written by hand, so a
 * story renders without reaching for a collection.
 */
import type { MemberBill, MemberRecordMember } from './MemberRecord.astro';
import type { VoteTableVote } from './VoteTable.astro';

/** A row of `votes.json`: everything about a vote that is not per-member. */
type VoteRow = {
  i: string; b: string; c: 'house' | 'senate'; r?: number;
  q: string; x?: string; s?: string; d: string;
  k?: 'unanimous-consent' | 'voice';
};

export const representative: MemberRecordMember = {
  bioguide: 'R000579',
  nameTitle: 'Rep. Patrick Ryan (NY-18)',
  name: 'Patrick Ryan',
  party: 'Democrat',
  state: 'NY',
  district: 18,
  type: 'rep',
  imageUrl: '/images/legislators/R000579.jpg',
};

export const senator: MemberRecordMember = {
  bioguide: 'S001150',
  nameTitle: 'Sen. Adam B. Schiff (CA)',
  name: 'Adam B. Schiff',
  party: 'Democrat',
  state: 'CA',
  type: 'sen',
  imageUrl: '/images/legislators/S001150.jpg',
};

/** A member with no headshot on file — the row still has a lead. */
export const withoutHeadshot: MemberRecordMember = {
  bioguide: 'F000485',
  nameTitle: 'Rep. Clay Fuller (GA-14)',
  name: 'Clay Fuller',
  party: 'Republican',
  state: 'GA',
  district: 14,
  type: 'rep',
};

export const bills: MemberBill[] = [
  {
    billId: '119-HR-7008', term: 119, billType: 'HR', billNumber: '7008',
    title: 'Stop Insider Trading Act', date: '2026-07-22', cast: 'Nay', votes: 2,
  },
  {
    billId: '119-HR-1722', term: 119, billType: 'HR', billNumber: '1722',
    title: 'Billion Dollar Boondoggle Act', date: '2026-07-22', cast: 'vv', votes: 1,
  },
  {
    billId: '119-HR-1', term: 119, billType: 'HR', billNumber: '1',
    title: 'One Big Beautiful Bill Act', date: '2025-07-04', cast: 'Yea', votes: 9,
  },
];

export const senateBills: MemberBill[] = [
  {
    billId: '119-S-4465', term: 119, billType: 'S', billNumber: '4465',
    title: 'Lunar Landing Day Act', date: '2026-08-20', cast: 'UC', votes: 1,
  },
  {
    billId: '119-HR-1', term: 119, billType: 'HR', billNumber: '1',
    title: 'One Big Beautiful Bill Act', date: '2025-07-01', cast: 'Yea', votes: 3,
  },
];

/** Two roll calls on the same bill, newest first — the `VoteTable` fixtures. */
export const votes: VoteTableVote[] = [
  {
    id: '119-HR-7008-280',
    chamber: 'House',
    rollNumber: 280,
    question: 'On Passage',
    result: 'Passed',
    actionDate: '2026-07-22',
    actionText: 'On passage Passed by the Yeas and Nays: 232 - 198 (Roll no. 280).',
    votes: { R000579: 'Nay' },
  },
  {
    id: '119-HR-7008-279',
    chamber: 'House',
    rollNumber: 279,
    question: 'On Motion to Recommit',
    result: 'Failed',
    actionDate: '2026-07-22',
    actionText: 'On motion to recommit Failed by the Yeas and Nays: 211 - 218 (Roll no. 279).',
    votes: { R000579: 'Yea' },
  },
];

/** A vote with no roll call: the position is consent, and the kind says so. */
export const voiceVote: VoteTableVote[] = [
  {
    id: '119-HR-1722-1',
    chamber: 'House',
    question: 'On Passage',
    result: 'Passed',
    actionDate: '2026-07-22',
    actionText: 'On passage Agreed to by voice vote.',
    votes: { R000579: 'vv' },
  },
];

export const unanimousConsent: VoteTableVote[] = [
  {
    id: '119-S-4465-1',
    chamber: 'Senate',
    question: 'On Passage',
    result: 'Passed',
    actionDate: '2026-08-20',
    actionText: 'Passed Senate without amendment by Unanimous Consent.',
    votes: { S001150: 'UC' },
  },
];

/**
 * The same votes in the shape the build emits — `votes.json` rows, and casts
 * as positions in that list. This is what `vfu-member-record` reads, so a
 * story hands it exactly what a fetch would.
 */
const voteIndex: VoteRow[] = [
  {
    i: '119-HR-7008-280', b: '119-HR-7008', c: 'house', r: 280,
    q: 'On Passage', x: 'On passage Passed by the Yeas and Nays: 232 - 198 (Roll no. 280).',
    s: 'Passed', d: '2026-07-22',
  },
  {
    i: '119-HR-7008-279', b: '119-HR-7008', c: 'house', r: 279,
    q: 'On Motion to Recommit', x: 'On motion to recommit Failed by the Yeas and Nays: 211 - 218 (Roll no. 279).',
    s: 'Failed', d: '2026-07-22',
  },
  {
    i: '119-HR-1722-1', b: '119-HR-1722', c: 'house',
    q: 'On Passage', x: 'On passage Agreed to by voice vote.',
    s: 'Passed', d: '2026-07-22', k: 'voice',
  },
  {
    i: '119-HR-1-190', b: '119-HR-1', c: 'house', r: 190,
    q: 'On Passage', x: 'On passage Passed by the Yeas and Nays: 218 - 214.',
    s: 'Passed', d: '2025-07-04',
  },
  {
    i: '119-S-4465-1', b: '119-S-4465', c: 'senate',
    q: 'On Passage', x: 'Passed Senate without amendment by Unanimous Consent.',
    s: 'Passed', d: '2026-08-20', k: 'unanimous-consent',
  },
];

export const memberIndex = {
  votes: voteIndex,
  casts: [[0, 'Nay'], [1, 'Yea'], [2, 'vv'], [3, 'Yea']] as Array<[number, string]>,
};

export const senateIndex = {
  votes: voteIndex,
  casts: [[4, 'UC'], [3, 'Yea']] as Array<[number, string]>,
};
