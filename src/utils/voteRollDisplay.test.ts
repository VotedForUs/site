import assert from 'node:assert';
import { describe, it } from 'node:test';
import { partyAbbrev, stateRollGroupKey } from './voteRollDisplay.js';

describe('stateRollGroupKey', () => {
  it('uses segment before first hyphen', () => {
    assert.strictEqual(stateRollGroupKey('CA-s1'), 'CA');
    assert.strictEqual(stateRollGroupKey('PA-12'), 'PA');
  });

  it('returns trimmed whole string when no hyphen', () => {
    assert.strictEqual(stateRollGroupKey('TX'), 'TX');
  });
});

describe('partyAbbrev', () => {
  it('maps Democrat and Republican', () => {
    assert.strictEqual(partyAbbrev('Democrat'), 'D');
    assert.strictEqual(partyAbbrev('Republican'), 'R');
  });

  it('defaults everything else to I', () => {
    assert.strictEqual(partyAbbrev('Independent'), 'I');
    assert.strictEqual(partyAbbrev('Libertarian'), 'I');
    assert.strictEqual(partyAbbrev('Working Families'), 'I');
  });

  it('returns empty for empty string', () => {
    assert.strictEqual(partyAbbrev(''), '');
  });
});
