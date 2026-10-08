import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { memberVoteCardFields } from './memberVoteCard.js';

describe('memberVoteCardFields', () => {
  it('keeps share on the canonical bills path and nav on the member path', () => {
    const fields = memberVoteCardFields({
      voteId: '119-HR-2616-184',
      bioguideId: 'R000579',
      voteCast: 'Nay',
      voteTitle: 'On Passage',
      billTitle: 'A short bill',
      nameTitle: 'Rep. Patrick Ryan (NY-18)',
      party: 'Democrat',
      stateName: 'New York',
      chamber: 'rep',
      state: 'NY',
      district: 18,
      prevVoteId: '119-HR-2616-183',
      nextVoteId: null,
      shareOrigin: 'https://votedfor.us',
    });
    assert.equal(fields.shareUrl, 'https://votedfor.us/bills/119/hr/2616/184/R000579');
    assert.equal(fields.prevHref, '/members/R000579/119/hr-2616/183');
    assert.equal(fields.nextHref, null);
    assert.equal(fields.closeHref, '/members/R000579/119/hr-2616');
    assert.equal(fields.actionLabel, 'Nay');
    assert.equal(fields.schemaActionOption, 'Nay');
    assert.equal(fields.voteVerb, 'voted');
    assert.doesNotMatch(fields.shareUrl, /\bUC\b|\bvv\b/i);
  });

  it('names a consent vote Yea and puts the kind in the visible label', () => {
    const fields = memberVoteCardFields({
      voteId: '119-S-306-1',
      bioguideId: 'S000033',
      voteCast: 'Yea',
      recordType: 'unanimous-consent',
      voteTitle: 'Pass with Unanimous Consent',
      billTitle: 'Fire Ready Nation Act of 2025',
      nameTitle: 'Sen. Bernard Sanders (VT)',
      party: 'Independent',
      stateName: 'Vermont',
      chamber: 'sen',
      state: 'VT',
      shareOrigin: 'https://votedfor.us/',
    });
    assert.equal(fields.actionLabel, 'Unanimous Consent');
    assert.equal(fields.schemaActionOption, 'Yea');
    assert.equal(fields.schemaDescription, 'Unanimous Consent');
    assert.equal(fields.voteVerb, 'joined');
    assert.doesNotMatch(JSON.stringify(fields), /\bUC\b|\bvv\b/);
  });
});
