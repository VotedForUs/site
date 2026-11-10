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
  voteCardPath,
  parseVoteCardMember,
  voteSharePath,
  parseVoteSharePath,
  voteShareUrl,
  memberVotePath,
  parseMemberVotePath,
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
    assert.equal(memberBillPath('R000579', 119, 'HR', 2616), '/members/R000579?bill=119-hr-2616');
  });

  it('round-trips the bill segment', () => {
    assert.equal(billSegment('HR', 2616), 'hr-2616');
    assert.deepEqual(parseBillSegment('hr-2616'), { billType: 'hr', billNumber: '2616' });
    assert.equal(parseBillSegment('hr2616'), null);
  });

  it('carries a deployment base', () => {
    assert.equal(votePath('119-HR-2616-184', '/site/'), '/site/bills/119/hr/2616/184');
    assert.equal(memberPath('R000579', '/site/'), '/site/members/R000579');
    assert.equal(memberBillPath('R000579', 119, 'HR', 2616, '/site/'), '/site/members/R000579?bill=119-hr-2616');
    assert.equal(voteCardPath('119-HR-2616-184', 'S001188', '/site/'), '/site/bills/119/hr/2616/184?member=S001188');
  });

  it('is null when the vote id cannot be read', () => {
    assert.equal(votePath('nonsense'), null);
    assert.equal(billPathForVote('nonsense'), null);
  });
});

describe('the card over a roll', () => {
  it('is the roll page with the member in the query, never a path of its own', () => {
    assert.equal(voteCardPath('119-HR-2616-184', 'S001188'), '/bills/119/hr/2616/184?member=S001188');
  });

  it('reads the member back from a path, a bare query, or a whole URL', () => {
    assert.equal(parseVoteCardMember('/bills/119/hr/2616/184?member=S001188'), 'S001188');
    assert.equal(parseVoteCardMember('?member=S001188'), 'S001188');
    assert.equal(parseVoteCardMember('https://votedfor.us/bills/119/hr/2616/184?x=1&member=S001188#top'), 'S001188');
  });

  it('is null when no member is named, or the value is not an id', () => {
    assert.equal(parseVoteCardMember('/bills/119/hr/2616/184'), null);
    assert.equal(parseVoteCardMember(''), null);
    assert.equal(parseVoteCardMember('?member='), null);
    assert.equal(parseVoteCardMember('?member=../../x'), null);
  });
});

describe('the share stub', () => {
  it('is the one member×vote combination with a path, because a file is written there', () => {
    assert.equal(voteSharePath('119-HR-2616-184', 'S001188'), '/bills/119/hr/2616/184/S001188');
  });

  it('reads that path back', () => {
    assert.deepEqual(parseVoteSharePath('/bills/119/hr/2616/184/S001188'), {
      term: '119', billType: 'hr', billNumber: '2616', voteId: '184', bioguideId: 'S001188',
    });
    assert.equal(parseVoteSharePath('/bills/119/hr/2616/184'), null);
  });

  it('is what the card shares only when every cast has a stub', () => {
    assert.equal(
      voteShareUrl('119-HR-2616-184', 'S001188', { origin: 'https://votedfor.us/', stubs: true }),
      'https://votedfor.us/bills/119/hr/2616/184/S001188',
    );
  });

  it('otherwise shares the in-place card URL, which always resolves', () => {
    assert.equal(
      voteShareUrl('119-HR-2616-184', 'S001188', { origin: 'https://votedfor.us', stubs: false }),
      'https://votedfor.us/bills/119/hr/2616/184?member=S001188',
    );
  });
});

describe('parseMemberBillPath', () => {
  it('reads the bill a member URL names', () => {
    assert.deepEqual(parseMemberBillPath('/members/R000579?bill=119-hr-2616'), {
      bioguideId: 'R000579', term: '119', segment: 'hr-2616',
    });
    assert.equal(parseMemberBillPath('/members/R000579/?bill=119-hr-2616')?.segment, 'hr-2616');
    assert.equal(parseMemberBillPath('/members/S001150?bill=119-sconres-14')?.segment, 'sconres-14');
  });

  it('round-trips what memberBillPath builds', () => {
    const path = memberBillPath('R000579', 119, 'HR', 2616);
    assert.deepEqual(parseMemberBillPath(path), { bioguideId: 'R000579', term: '119', segment: 'hr-2616' });
  });

  it('is null on the member page itself, and elsewhere on the site', () => {
    for (const path of [
      '/members/R000579', '/members', '/', '/bills/119/hr/2616', '/bills/119/hr/2616/184/S001188',
      '/members/R000579?bill=nonsense', '/bills/119/hr/2616?bill=119-hr-2616',
    ]) {
      assert.equal(parseMemberBillPath(path), null, path);
    }
  });

  it('does not match when a vote is named — that is the in-place card', () => {
    assert.equal(parseMemberBillPath('/members/R000579?bill=119-hr-2616&vote=184'), null);
  });

  it('does not read the old path form: those URLs are not served any more', () => {
    assert.equal(parseMemberBillPath('/members/R000579/119/hr-2616'), null);
  });
});

describe('memberVotePath', () => {
  it('builds the in-place card URL from the vote id', () => {
    assert.equal(memberVotePath('119-HR-2616-184', 'R000579'), '/members/R000579?bill=119-hr-2616&vote=184');
    assert.equal(memberVotePath('119-S-306-1', 'S000033'), '/members/S000033?bill=119-s-306&vote=1');
  });

  it('reads that URL back', () => {
    assert.deepEqual(parseMemberVotePath('/members/R000579?bill=119-hr-2616&vote=184'), {
      bioguideId: 'R000579', term: '119', segment: 'hr-2616', voteNumber: '184',
    });
    assert.equal(parseMemberVotePath('/members/R000579?bill=119-hr-2616'), null);
    assert.equal(parseMemberVotePath('/bills/119/hr/2616/184/R000579'), null);
  });

  it('round-trips and carries a deployment base', () => {
    const path = memberVotePath('119-HR-2616-184', 'R000579', '/site/');
    assert.equal(path, '/site/members/R000579?bill=119-hr-2616&vote=184');
    assert.deepEqual(parseMemberVotePath(path), {
      bioguideId: 'R000579', term: '119', segment: 'hr-2616', voteNumber: '184',
    });
  });
});
