import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { addVoteRollSortOrders } from './voteRollSortOrders.js';

describe('addVoteRollSortOrders', () => {
  it('assigns orderName 0..n-1 by lastName, then full name', () => {
    const rows = addVoteRollSortOrders([
      { bioguideId: 'b', stateDistrict: 'TX', name: 'Zed', lastName: 'Zed', party: 'R', vote: 'Yea' },
      { bioguideId: 'a', stateDistrict: 'CA', name: 'Ann', lastName: 'Ann', party: 'D', vote: 'Nay' },
    ]);
    assert.equal(rows.find((r) => r.name === 'Ann')?.orderName, 0);
    assert.equal(rows.find((r) => r.name === 'Zed')?.orderName, 1);
  });

  it('orders name by lastName when first names differ', () => {
    const rows = addVoteRollSortOrders([
      { bioguideId: 'z', stateDistrict: 'TX', name: 'Zed Aaron', lastName: 'Aaron', party: 'R', vote: 'Yea' },
      { bioguideId: 'a', stateDistrict: 'CA', name: 'Amy Zebra', lastName: 'Zebra', party: 'D', vote: 'Nay' },
    ]);
    const aaron = rows.find((r) => r.name === 'Zed Aaron');
    const zebra = rows.find((r) => r.name === 'Amy Zebra');
    assert.ok(aaron && zebra);
    assert.ok(aaron.orderName < zebra.orderName);
  });

  it('ties state by name', () => {
    const rows = addVoteRollSortOrders([
      { bioguideId: '1', stateDistrict: 'CA', name: 'Bob', lastName: 'Bob', party: 'D', vote: 'Yea' },
      { bioguideId: '2', stateDistrict: 'CA', name: 'Amy', lastName: 'Amy', party: 'D', vote: 'Yea' },
    ]);
    const amy = rows.find((r) => r.name === 'Amy');
    const bob = rows.find((r) => r.name === 'Bob');
    assert.ok(amy && bob);
    assert.ok(amy.orderState < bob.orderState);
  });

  it('ties vote by name', () => {
    const rows = addVoteRollSortOrders([
      { bioguideId: '1', stateDistrict: 'TX', name: 'Zed', lastName: 'Zed', party: 'R', vote: 'Yea' },
      { bioguideId: '2', stateDistrict: 'CA', name: 'Ann', lastName: 'Ann', party: 'D', vote: 'Yea' },
    ]);
    const ann = rows.find((r) => r.name === 'Ann');
    const zed = rows.find((r) => r.name === 'Zed');
    assert.ok(ann && zed);
    assert.ok(ann.orderVote < zed.orderVote);
  });

  it('returns empty for empty input', () => {
    assert.deepEqual(addVoteRollSortOrders([]), []);
  });
});
