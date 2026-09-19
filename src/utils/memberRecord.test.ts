/**
 * Grouping a member's votes into the bills they voted on.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { groupMemberBills, memberVotesOnBill, type MemberVoteEntry } from './memberRecord.js';

const entry = (over: Partial<MemberVoteEntry> = {}): MemberVoteEntry => ({
  bioguideId: 'R000579',
  voteId: '119-HR-2616-184',
  vote: 'Yea',
  billId: '119-HR-2616',
  billType: 'HR',
  billNumber: '2616',
  congress: 119,
  billTitle: 'Employee Rights Act of 2025',
  actionDate: '2026-05-20',
  ...over,
});

describe('groupMemberBills', () => {
  it('counts every vote the member cast on a bill', () => {
    const bills = groupMemberBills([
      entry(),
      entry({ voteId: '119-HR-2616-2', actionDate: '2026-01-10', vote: 'Nay' }),
    ]);
    assert.equal(bills.length, 1);
    assert.equal(bills[0].votes, 2);
  });

  it('dates a bill by their most recent vote, and tags it with that cast', () => {
    const bills = groupMemberBills([
      entry({ voteId: '119-HR-2616-2', actionDate: '2026-01-10', vote: 'Nay' }),
      entry({ actionDate: '2026-05-20', vote: 'Yea' }),
    ]);
    assert.equal(bills[0].date, '2026-05-20');
    assert.equal(bills[0].cast, 'Yea');
  });

  it('orders the bills newest first', () => {
    const bills = groupMemberBills([
      entry({ billId: '119-HR-1', billNumber: '1', actionDate: '2025-07-04' }),
      entry({ billId: '119-S-5', billType: 'S', billNumber: '5', actionDate: '2026-08-20' }),
      entry({ billId: '119-HR-9', billNumber: '9', actionDate: '2026-02-01' }),
    ]);
    assert.deepEqual(bills.map((b) => b.billId), ['119-S-5', '119-HR-9', '119-HR-1']);
  });

  it('carries the stored cast through untouched — the tag is a display concern', () => {
    const bills = groupMemberBills([entry({ vote: 'UC' })]);
    assert.equal(bills[0].cast, 'UC');
  });

  it('is empty for a member with no votes', () => {
    assert.deepEqual(groupMemberBills([]), []);
  });
});

describe('memberVotesOnBill', () => {
  const houseRoll = { id: 'v1', billId: '119-HR-1', chamber: 'House', actionDate: '2026-01-02', votes: { R000579: 'Yea' } };
  const senateRoll = { id: 'v2', billId: '119-HR-1', chamber: 'Senate', actionDate: '2026-03-04', votes: { S001188: 'Nay' } };
  const otherBill = { id: 'v3', billId: '119-S-5', chamber: 'Senate', actionDate: '2026-04-04', votes: { S001188: 'Yea' } };

  it('keeps only the votes this member cast on', () => {
    assert.deepEqual(memberVotesOnBill([houseRoll, senateRoll], 'R000579', '119-HR-1').map((v) => v.id), ['v1']);
  });

  it('never shows a senator a House roll — their casts are the chamber filter', () => {
    assert.deepEqual(memberVotesOnBill([houseRoll, senateRoll], 'S001188', '119-HR-1').map((v) => v.id), ['v2']);
  });

  it('keeps both chambers for a member who served in both', () => {
    const switcher = 'B001299';
    const votes = [
      { ...houseRoll, votes: { [switcher]: 'Yea' } },
      { ...senateRoll, votes: { [switcher]: 'Nay' } },
    ];
    assert.equal(memberVotesOnBill(votes, switcher, '119-HR-1').length, 2);
  });

  it('stays on the bill it was asked about, newest first', () => {
    const votes = memberVotesOnBill([otherBill, senateRoll], 'S001188', '119-HR-1');
    assert.deepEqual(votes.map((v) => v.id), ['v2']);
    const all = memberVotesOnBill([senateRoll, { ...senateRoll, id: 'v4', actionDate: '2026-09-09' }], 'S001188', '119-HR-1');
    assert.deepEqual(all.map((v) => v.id), ['v4', 'v2']);
  });

  it('keeps a member who only appears on membersAtAction', () => {
    const consent = {
      id: 'v-uc',
      billId: '119-HR-1',
      chamber: 'Senate',
      actionDate: '2026-03-04',
      recordType: 'unanimous-consent',
      votes: {},
      membersAtAction: ['S001188'],
    };
    assert.deepEqual(memberVotesOnBill([houseRoll, consent], 'S001188', '119-HR-1').map((v) => v.id), ['v-uc']);
  });
});
