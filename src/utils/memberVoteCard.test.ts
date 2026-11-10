import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { memberVoteCardFields, rollVoteCardFields } from './memberVoteCard.js';

describe('memberVoteCardFields', () => {
  it('shares the in-place card URL and keeps nav on the member page', () => {
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
    assert.equal(fields.shareUrl, 'https://votedfor.us/bills/119/hr/2616/184?member=R000579');
    assert.equal(fields.voteId, '119-HR-2616-184');
    assert.equal(fields.prevHref, '/members/R000579?bill=119-hr-2616&vote=183');
    assert.equal(fields.nextHref, null);
    assert.equal(fields.closeHref, '/members/R000579?bill=119-hr-2616');
    assert.equal(fields.identity, undefined);
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

describe('rollVoteCardFields', () => {
  const input = {
    voteId: '119-HR-1-3',
    bioguideId: 'A000382',
    voteCast: 'Nay',
    voteTitle: 'On the Motion to Proceed H.R. 1',
    billTitle: 'One Big Beautiful Bill Act',
    nameTitle: 'Sen. Angela D. Alsobrooks (MD)',
    party: 'Democrat',
    stateName: 'Maryland',
    chamber: 'sen' as const,
    state: 'MD',
    imageUrl: '/images/legislators/A000382.jpg',
    prevBioguideId: 'V000128',
    nextBioguideId: null,
    shareOrigin: 'https://votedfor.us',
  };

  it('steps through the roll and closes back to it', () => {
    const fields = rollVoteCardFields(input);
    assert.equal(fields.prevHref, '/bills/119/hr/1/3?member=V000128');
    assert.equal(fields.nextHref, null);
    assert.equal(fields.closeHref, '/bills/119/hr/1/3');
    assert.equal(fields.shareUrl, 'https://votedfor.us/bills/119/hr/1/3?member=A000382');
  });

  it('carries the member, because on a roll the card changes hands', () => {
    assert.deepEqual(rollVoteCardFields(input).identity, {
      bioguideId: 'A000382',
      displayName: 'Sen. Angela D. Alsobrooks',
      memberSubtitle: 'Democrat, Maryland Senator',
      party: 'Democrat',
      imageUrl: '/images/legislators/A000382.jpg',
    });
  });

  it('shares the stub once every cast has one', () => {
    assert.equal(
      rollVoteCardFields({ ...input, shareStubs: true }).shareUrl,
      'https://votedfor.us/bills/119/hr/1/3/A000382',
    );
  });

  it('names the kind on a consent vote', () => {
    const fields = rollVoteCardFields({ ...input, voteCast: 'Yea', recordType: 'voice', imageUrl: null });
    assert.equal(fields.actionLabel, 'Voice Vote');
    assert.equal(fields.schemaActionOption, 'Yea');
    assert.equal(fields.identity?.imageUrl, null);
  });
});
