/**
 * Tests for the finder index build step. The shapes here are the real ones
 * from `src/data/**` — including the fields that look like the one you want
 * and are not (`latest_term.url` is a website, `name` is an object).
 *
 * Congress 999 keeps the fixtures away from any editorial entry on disk.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  DRILLDOWN_BUDGET_GZIP_BYTES,
  FinderIndexError,
  INDEX_BUDGET_GZIP_BYTES,
  countCasts,
  toVoteIndex,
  measure,
  recordedVotesOf,
  toBillRow,
  toMemberRow,
  type RawBill,
} from './build-finder-index.js';

const bill = (over: Partial<RawBill> = {}): RawBill => ({
  congress: 999,
  type: 'HR',
  number: 26,
  title: 'An act to provide for reconciliation pursuant to title II of H. Con. Res. 14.',
  lastActionDate: '2025-02-12',
  latestAction: { actionDate: '2025-02-12', text: 'Passed House' },
  titles: { titles: [{ title: 'Midnight Rules Relief Act', titleType: 'Popular Titles' }] },
  actions: { actions: [{ recordedVotes: [{ votes: { A000055: 'Aye', B000490: 'No' } }] }] },
  ...over,
});

/** The Congress.gov + legislator-YAML shape, with every lookalike field present. */
const member = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  bioguideId: 'A000055',
  name: { official_full: 'Robert B. Aderholt', last: 'Aderholt' },
  depiction: { imageUrl: '/images/legislators/A000055.jpg' },
  latest_term: { type: 'rep', state: 'AL', district: 4, party: 'Republican', url: 'https://aderholt.house.gov' },
  ...over,
});

describe('toBillRow', () => {
  it('reads ids, type and number off the raw bill', () => {
    const row = toBillRow(bill());
    assert.equal(row.i, '999-HR-26');
    assert.equal(row.t, 'H.R. 26');
    assert.equal(row.n, 26);
    assert.equal(row.y, 'hr');
  });

  it('shows the title the pages show', () => {
    assert.equal(toBillRow(bill()).h, 'Midnight Rules Relief Act');
  });

  it('extracts citations from the official title, not the display title', () => {
    const row = toBillRow(bill());
    assert.deepEqual(row.cites, ['hconres 14']);
    assert.ok(!row.h.includes('H. Con. Res.'), 'the display title has no citation left in it');
  });

  it('counts every recorded vote on the bill, across actions', () => {
    const row = toBillRow(bill({
      actions: {
        actions: [
          { recordedVotes: [{ votes: { A000055: 'Aye' } }, { votes: { A000055: 'No' } }] },
          { recordedVotes: [{ votes: { B000490: 'Aye' } }] },
          {},
        ],
      },
    } as Partial<RawBill>));
    assert.equal(row.v, 3);
  });

  it('carries the state and a date-only action date', () => {
    const row = toBillRow(bill({ latestAction: { actionDate: '2025-07-04', text: 'Became Public Law No: 119-21.' } }));
    assert.equal(row.s, 'becameLaw');
    assert.equal(row.d, '2025-02-12');
  });

  it('has an empty alias array when no one has authored one', () => {
    assert.deepEqual(toBillRow(bill()).a, []);
  });

  it('throws rather than emitting a row it cannot date', () => {
    assert.throws(
      () => toBillRow(bill({ lastActionDate: undefined, latestAction: undefined })),
      FinderIndexError,
    );
  });

  it('throws on a bill number that is not a number', () => {
    assert.throws(() => toBillRow(bill({ number: 'HR' })), FinderIndexError);
  });
});

describe('countCasts', () => {
  it('counts a member every time they appear in a votes map', () => {
    const casts = countCasts([
      bill(),
      bill({ number: 27, actions: { actions: [{ recordedVotes: [{ votes: { A000055: 'Aye' } }] }] } } as Partial<RawBill>),
    ]);
    assert.equal(casts.get('A000055'), 2);
    assert.equal(casts.get('B000490'), 1);
    assert.equal(casts.get('Z000001'), undefined);
  });

  it('counts nothing from a vote with no per-member roll', () => {
    const casts = countCasts([bill({ actions: { actions: [{ recordedVotes: [{ votes: {} }] }] } } as Partial<RawBill>)]);
    assert.equal(casts.size, 0);
  });

  it('reads recorded votes out of every action', () => {
    assert.equal(recordedVotesOf(bill()).length, 1);
    assert.equal(recordedVotesOf(bill({ actions: undefined })).length, 0);
  });
});

describe('toMemberRow', () => {
  it('builds a representative row', () => {
    assert.deepEqual(toMemberRow(member(), 'A000055', 412, true), {
      b: 'A000055', n: 'Robert B. Aderholt', s: 'AL', p: 'R', c: 'house', v: 412, d: 4, i: 1,
    });
  });

  it('builds a senator row with no district', () => {
    const row = toMemberRow(
      member({ latest_term: { type: 'sen', state: 'CA', party: 'Democrat' } }),
      'S001150',
      492,
      true,
    );
    assert.equal(row?.c, 'senate');
    assert.equal(row?.d, undefined);
    assert.equal(row?.p, 'D');
  });

  it('leaves out a member who has never cast a recorded vote', () => {
    assert.equal(toMemberRow(member(), 'A000055', 0, true), null);
  });

  it('reads the display name when `name` is an object', () => {
    assert.equal(toMemberRow(member(), 'A000055', 1, true)?.n, 'Robert B. Aderholt');
  });

  it('falls back to directOrderName for a member not yet in the legislator YAML', () => {
    const row = toMemberRow(
      {
        bioguideId: 'F000485',
        directOrderName: 'Clay Fuller',
        invertedOrderName: 'Fuller, Clay',
        partyHistory: [{ partyName: 'Republican' }],
        terms: [{ chamber: 'House of Representatives', district: 14, stateCode: 'GA', memberType: 'Representative' }],
      },
      'F000485',
      3,
      false,
    );
    assert.equal(row?.n, 'Clay Fuller');
    assert.equal(row?.s, 'GA');
    assert.equal(row?.d, 14);
    assert.equal(row?.i, undefined, 'no held portrait means no headshot claim');
  });

  it('throws when the image field holds the official website instead of a headshot', () => {
    assert.throws(
      () => toMemberRow(member({ depiction: undefined, imageUrl: 'https://aderholt.house.gov' }), 'A000055', 1, true),
      FinderIndexError,
    );
  });

  it('throws when no field carries a name', () => {
    assert.throws(() => toMemberRow(member({ name: undefined }), 'A000055', 1, true), FinderIndexError);
  });

  it('throws on a state that is not a two-letter code', () => {
    assert.throws(
      () => toMemberRow(member({ latest_term: { type: 'rep', state: 'Alabama', party: 'Republican' } }), 'A000055', 1, true),
      FinderIndexError,
    );
  });
});

describe('index size', () => {
  it('measures both files gzipped, which is what the reader downloads', () => {
    const { per, gzip } = measure({ 'a.json': JSON.stringify([{ a: 1 }]), 'b.json': JSON.stringify([{ b: 2 }]) });
    assert.equal(per.length, 2);
    assert.ok(per.every(f => f.bytes > 0 && f.gzip > 0));
    assert.equal(gzip, per[0].gzip + per[1].gzip);
  });

  it('has a budget the build enforces', () => {
    assert.equal(INDEX_BUDGET_GZIP_BYTES, 60 * 1024);
  });
});

describe('toVoteIndex', () => {
  const twoVotes = bill({
    actions: {
      actions: [
        {
          actionDate: '2026-02-12',
          text: 'On motion to recommit Failed by the Yeas and Nays: 211 - 218.',
          recordedVotes: [{
            id: '999-HR-26-1', chamber: 'House', rollNumber: 279, question: 'On Motion to Recommit',
            result: 'Failed', votes: { A000055: 'Yea', B000490: 'Nay' },
          }],
        },
        {
          actionDate: '2026-02-13',
          text: 'Passed Senate without amendment by Unanimous Consent.',
          recordedVotes: [{
            id: '999-HR-26-2', chamber: 'Senate', rollNumber: 0, question: 'On Passage',
            result: 'Passed', votes: { S001150: 'UC' },
          }],
        },
      ],
    },
  } as Partial<RawBill>);

  it('carries what a vote is, without any per-member data', () => {
    const { votes } = toVoteIndex([twoVotes]);
    assert.equal(votes.length, 2);
    assert.deepEqual(votes[0], {
      i: '999-HR-26-1', b: '999-HR-26', c: 'house', r: 279,
      q: 'On Motion to Recommit',
      x: 'On motion to recommit Failed by the Yeas and Nays: 211 - 218.',
      s: 'Failed', d: '2026-02-12',
    });
    assert.ok(!JSON.stringify(votes).includes('A000055'), 'no member appears in the shared file');
  });

  it('drops the roll number when there was no roll call', () => {
    const { votes } = toVoteIndex([twoVotes]);
    assert.equal(votes[1].r, undefined);
  });

  it('records each cast as a position in that same vote list', () => {
    const { votes, casts } = toVoteIndex([twoVotes]);
    assert.deepEqual(casts.get('A000055'), [[0, 'Yea']]);
    assert.deepEqual(casts.get('S001150'), [[1, 'UC']]);
    // The position is the whole reference: it has to resolve against `votes`.
    const [index, cast] = casts.get('S001150')![0];
    assert.equal(votes[index].i, '999-HR-26-2');
    assert.equal(cast, 'UC');
  });

  it('leaves the stored cast alone — reading it as Yea is a display decision', () => {
    const { casts } = toVoteIndex([twoVotes]);
    assert.equal(casts.get('S001150')![0][1], 'UC');
  });

  it('throws rather than emitting a vote it cannot identify or date', () => {
    const noId = bill({ actions: { actions: [{ actionDate: '2026-01-01', recordedVotes: [{ votes: {} }] }] } } as Partial<RawBill>);
    assert.throws(() => toVoteIndex([noId]), FinderIndexError);
    const noDate = bill({ actions: { actions: [{ recordedVotes: [{ id: '999-HR-26-1', votes: {} }] }] } } as Partial<RawBill>);
    assert.throws(() => toVoteIndex([noDate]), FinderIndexError);
  });

  it('has a budget for what opening one record costs', () => {
    assert.equal(DRILLDOWN_BUDGET_GZIP_BYTES, 48 * 1024);
  });
});
