import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DISPLAY_CAST_CONSENT_YEA,
  isConsentMembershipVote,
  memberCastsForDisplay,
  memberIdsForDisplay,
} from './memberCastsForDisplay.js';

test('roll-call uses the recorded votes map', () => {
  const vote = {
    recordType: 'roll-call' as const,
    votes: { A000001: 'Yea', B000001: 'Nay' },
  };
  assert.equal(isConsentMembershipVote(vote), false);
  assert.deepEqual(memberCastsForDisplay(vote), { A000001: 'Yea', B000001: 'Nay' });
  assert.deepEqual(memberIdsForDisplay(vote), ['A000001', 'B000001']);
});

test('unanimous-consent maps membersAtAction to Yea', () => {
  const vote = {
    recordType: 'unanimous-consent' as const,
    votes: {},
    membersAtAction: ['C000127', 'S000033'],
  };
  assert.equal(isConsentMembershipVote(vote), true);
  assert.deepEqual(memberCastsForDisplay(vote), {
    C000127: DISPLAY_CAST_CONSENT_YEA,
    S000033: DISPLAY_CAST_CONSENT_YEA,
  });
});

test('voice maps membersAtAction to Yea', () => {
  const vote = {
    recordType: 'voice' as const,
    votes: {},
    membersAtAction: ['A000055'],
  };
  assert.deepEqual(memberCastsForDisplay(vote), { A000055: DISPLAY_CAST_CONSENT_YEA });
});

test('empty votes plus membersAtAction is treated as consent membership', () => {
  const vote = {
    votes: {},
    membersAtAction: ['X000001'],
  };
  assert.equal(isConsentMembershipVote(vote), true);
  assert.deepEqual(memberIdsForDisplay(vote), ['X000001']);
});
