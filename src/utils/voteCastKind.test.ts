import assert from 'node:assert/strict';
import test from 'node:test';
import { proceduralVoteCastKind } from './voteCastKind.js';

test('proceduralVoteCastKind: UC is unanimous consent', () => {
  assert.equal(proceduralVoteCastKind('UC'), 'unanimous-consent');
});

test('proceduralVoteCastKind: vv and VV are voice vote', () => {
  assert.equal(proceduralVoteCastKind('vv'), 'voice-vote');
  assert.equal(proceduralVoteCastKind('VV'), 'voice-vote');
});

test('proceduralVoteCastKind: roll-call values are null', () => {
  assert.equal(proceduralVoteCastKind('Yea'), null);
  assert.equal(proceduralVoteCastKind('Nay'), null);
  assert.equal(proceduralVoteCastKind(''), null);
});
