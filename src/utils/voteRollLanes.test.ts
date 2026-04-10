import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { partyBorderKind, partyRollLane, voteRollLane } from './voteRollLanes.js';

describe('partyRollLane', () => {
  it('maps Democrat and D to dem', () => {
    assert.equal(partyRollLane('Democrat'), 'dem');
    assert.equal(partyRollLane('D'), 'dem');
  });

  it('maps Republican and R to gop', () => {
    assert.equal(partyRollLane('Republican'), 'gop');
    assert.equal(partyRollLane('R'), 'gop');
  });

  it('maps other parties to other', () => {
    assert.equal(partyRollLane('Independent'), 'other');
    assert.equal(partyRollLane(''), 'other');
  });
});

describe('partyBorderKind', () => {
  it('maps major parties and independent', () => {
    assert.equal(partyBorderKind('Democrat'), 'dem');
    assert.equal(partyBorderKind('Republican'), 'gop');
    assert.equal(partyBorderKind('Independent'), 'ind');
  });

  it('maps other parties to neutral', () => {
    assert.equal(partyBorderKind('Libertarian'), 'neutral');
    assert.equal(partyBorderKind(''), 'neutral');
  });
});

describe('voteRollLane', () => {
  it('maps yea variants to yea', () => {
    assert.equal(voteRollLane('Yea'), 'yea');
    assert.equal(voteRollLane('Aye'), 'yea');
  });

  it('maps nay variants to nay', () => {
    assert.equal(voteRollLane('Nay'), 'nay');
    assert.equal(voteRollLane('No'), 'nay');
  });

  it('maps present and unknown to other', () => {
    assert.equal(voteRollLane('Present'), 'other');
    assert.equal(voteRollLane('Not Voting'), 'other');
  });
});
