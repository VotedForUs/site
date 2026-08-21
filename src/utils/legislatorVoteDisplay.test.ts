import assert from 'node:assert/strict';
import test from 'node:test';
import {
  actionOptionLabel,
  buildLegislatorVoteDisplay,
  castEmoji,
  displayNameFromNameTitle,
  formatMemberSubtitle,
} from './legislatorVoteDisplay.js';

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
