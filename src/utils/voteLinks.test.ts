/**
 * The URL helpers. These are the only place a vote, bill or member path is
 * assembled, so the shapes are asserted here rather than in every caller.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  billPath,
  billPathForVote,
  billSegment,
  memberBillPath,
  memberPath,
  parseBillSegment,
  parseMemberBillPath,
  parseVoteId,
  votePath,
  voteMemberPath,
} from './voteLinks.js';

describe('parseVoteId', () => {
  it('reads the bill out of the vote id', () => {
    assert.deepEqual(parseVoteId('119-HR-2616-184'), {
      term: '119', billType: 'hr', billNumber: '2616', voteNumber: '184',
    });
    assert.deepEqual(parseVoteId('119-HCONRES-14-3')?.billType, 'hconres');
  });

  it('is null for anything that is not one', () => {
    assert.equal(parseVoteId('119-HR-2616'), null);
    assert.equal(parseVoteId('nonsense'), null);
  });
});

describe('paths', () => {
  it('builds the bill and vote pages from the id alone', () => {
    assert.equal(billPathForVote('119-HR-2616-184'), '/bills/119/hr/2616');
    assert.equal(votePath('119-HR-2616-184'), '/bills/119/hr/2616/184');
    assert.equal(billPath(119, 'HR', 2616), '/bills/119/hr/2616');
  });

  it('builds the member pages', () => {
    assert.equal(memberPath('R000579'), '/members/R000579');
    assert.equal(memberBillPath('R000579', 119, 'HR', 2616), '/members/R000579/119/hr-2616');
  });

  it('round-trips the bill segment', () => {
    assert.equal(billSegment('HR', 2616), 'hr-2616');
    assert.deepEqual(parseBillSegment('hr-2616'), { billType: 'hr', billNumber: '2616' });
    assert.equal(parseBillSegment('hr2616'), null);
  });

  it('keeps the legislator×vote path in one function', () => {
    assert.equal(voteMemberPath('119-HR-2616-184', 'S001188'), '/v/119-HR-2616-184/S001188');
  });

  it('carries a deployment base', () => {
    assert.equal(votePath('119-HR-2616-184', '/site/'), '/site/bills/119/hr/2616/184');
    assert.equal(memberPath('R000579', '/site/'), '/site/members/R000579');
    assert.equal(memberBillPath('R000579', 119, 'HR', 2616, '/site/'), '/site/members/R000579/119/hr-2616');
  });

  it('is null when the vote id cannot be read', () => {
    assert.equal(votePath('nonsense'), null);
    assert.equal(billPathForVote('nonsense'), null);
  });
});

describe('parseMemberBillPath', () => {
  it('reads the bill a member URL names', () => {
    assert.deepEqual(parseMemberBillPath('/members/R000579/119/hr-2616'), {
      bioguideId: 'R000579', term: '119', segment: 'hr-2616',
    });
    assert.equal(parseMemberBillPath('/members/R000579/119/hr-2616/')?.segment, 'hr-2616');
    assert.equal(parseMemberBillPath('/members/S001150/119/sconres-14')?.segment, 'sconres-14');
  });

  it('round-trips what memberBillPath builds', () => {
    const path = memberBillPath('R000579', 119, 'HR', 2616);
    assert.deepEqual(parseMemberBillPath(path), { bioguideId: 'R000579', term: '119', segment: 'hr-2616' });
  });

  it('is null on the member page itself, and elsewhere on the site', () => {
    for (const path of ['/members/R000579', '/members', '/', '/bills/119/hr/2616', '/v/119-HR-2616-184/S001188']) {
      assert.equal(parseMemberBillPath(path), null, path);
    }
  });

  it('does not match a vote under a bill — that is the card, not this', () => {
    assert.equal(parseMemberBillPath('/members/R000579/119/hr-2616/184'), null);
  });
});
