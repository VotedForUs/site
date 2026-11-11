/**
 * Vote-roll grouping and find-a-member matching.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { addVoteRollSortOrders, type VoteRollRow } from './voteRollSortOrders.js';
import { buildStateGroups, liftHomeState, rowMatchesQuery } from './voteRollView.js';

const row = (over: Partial<VoteRollRow> = {}): VoteRollRow => ({
  bioguideId: 'A000001',
  stateDistrict: 'NY-18',
  name: 'Rep. Patrick Ryan',
  lastName: 'Ryan',
  party: 'Democrat',
  vote: 'Yea',
  ...over,
});

describe('buildStateGroups', () => {
  it('groups in state order and keeps the delegation together', () => {
    const groups = buildStateGroups(addVoteRollSortOrders([
      row({ bioguideId: 'C', stateDistrict: 'CA-12', lastName: 'Pelosi', name: 'Rep. Nancy Pelosi' }),
      row({ bioguideId: 'A', stateDistrict: 'AL-4', lastName: 'Aderholt', name: 'Rep. Robert Aderholt' }),
      row({ bioguideId: 'B', stateDistrict: 'CA-16', lastName: 'Liccardo', name: 'Rep. Sam Liccardo' }),
    ]));
    assert.deepEqual(groups.map((g) => g.key), ['AL', 'CA']);
    assert.equal(groups[1].rows.length, 2);
  });
});

describe('liftHomeState', () => {
  it('moves the named delegation to the front', () => {
    const groups = buildStateGroups(addVoteRollSortOrders([
      row({ bioguideId: 'A', stateDistrict: 'AL-4', lastName: 'Aderholt', name: 'A' }),
      row({ bioguideId: 'C', stateDistrict: 'CA-12', lastName: 'Pelosi', name: 'C' }),
    ]));
    assert.deepEqual(liftHomeState(groups, 'CA').map((g) => g.key), ['CA', 'AL']);
    assert.deepEqual(liftHomeState(groups, 'al').map((g) => g.key), ['AL', 'CA']);
    assert.deepEqual(liftHomeState(groups).map((g) => g.key), ['AL', 'CA']);
  });
});

describe('rowMatchesQuery', () => {
  it('matches a contiguous substring of name or state', () => {
    const ryan = row();
    assert.equal(rowMatchesQuery(ryan, ''), true);
    assert.equal(rowMatchesQuery(ryan, 'ryan'), true);
    assert.equal(rowMatchesQuery(ryan, 'NY'), true);
    assert.equal(rowMatchesQuery(ryan, 'zzz'), false);
  });
});
