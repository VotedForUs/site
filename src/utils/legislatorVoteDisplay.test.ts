import assert from 'node:assert/strict';
import test from 'node:test';
import {
  actionOptionLabel,
  buildLegislatorVoteDisplay,
  castEmoji,
  castTag,
  displayNameFromNameTitle,
  formatMemberSubtitle,
} from './legislatorVoteDisplay.js';

test('buildLegislatorVoteDisplay handles Yea plus recordType unanimous-consent', () => {
  const display = buildLegislatorVoteDisplay({
    voteCast: 'Yea',
    recordType: 'unanimous-consent',
    nameTitle: 'Sen. Bernie Sanders (VT)',
    party: 'Independent',
    stateName: 'Vermont',
    chamber: 'sen',
    state: 'VT',
  });

  assert.equal(display.proc, 'unanimous-consent');
  assert.equal(display.emoji, '🤝');
  assert.equal(display.actionLabel, 'Unanimous Consent');
  assert.equal(display.voteVerb, 'joined');
});

test('buildLegislatorVoteDisplay handles procedural UC', () => {
  const display = buildLegislatorVoteDisplay({
    voteCast: 'UC',
    nameTitle: 'Sen. Bernie Sanders (VT)',
    party: 'Independent',
    stateName: 'Vermont',
    chamber: 'sen',
    state: 'VT',
  });

  assert.equal(display.proc, 'unanimous-consent');
  assert.equal(display.emoji, '🤝');
  assert.equal(display.actionLabel, 'Unanimous Consent');
  assert.equal(display.voteVerb, 'joined');
  assert.equal(display.displayName, 'Sen. Bernie Sanders');
});

test('castEmoji maps roll-call values', () => {
  assert.equal(castEmoji('Yea', null), '👍');
  assert.equal(castEmoji('No', null), '👎');
  assert.equal(castEmoji('Present', null), '');
});

test('actionOptionLabel keeps raw cast for roll calls', () => {
  assert.equal(actionOptionLabel('Nay', null), 'Nay');
});

test('displayNameFromNameTitle strips jurisdiction suffix', () => {
  assert.equal(
    displayNameFromNameTitle('Rep. Gregorio Kilili Camacho Sablan (MP-0)'),
    'Rep. Gregorio Kilili Camacho Sablan',
  );
});

test('formatMemberSubtitle formats senate and house lines', () => {
  assert.equal(
    formatMemberSubtitle('Independent', 'Vermont', 'sen', 'VT'),
    'Independent, Vermont Senator',
  );
  assert.equal(
    formatMemberSubtitle('Democrat', 'New York', 'rep', 'NY', 8),
    'Democrat, New York, NY-8',
  );
});

test('castTag reports a roll-call cast as it stands, with no kind to name', () => {
  assert.deepEqual(castTag('Yea'), { label: 'Yea', kind: null });
  assert.deepEqual(castTag('Nay'), { label: 'Nay', kind: null });
});

test('castTag reads a vote with no roll call as a Yea and names the kind with it', () => {
  assert.deepEqual(castTag('UC'), { label: 'Yea', kind: 'Unanimous Consent' });
  assert.deepEqual(castTag('vv'), { label: 'Yea', kind: 'Voice Vote' });
});

test('castTag never hands back the stored value for those two', () => {
  for (const stored of ['UC', 'vv']) {
    const tag = castTag(stored);
    assert.ok(!`${tag.label}${tag.kind}`.includes(stored), stored);
  }
});
