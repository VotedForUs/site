import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLegislatorVoteView,
  resolveLegislatorVoteViewWithSources,
  toPageVotedProps,
  toVotedCardProps,
} from './legislatorVoteView.js';

const sampleVote = {
  bioguideId: 'S000033',
  voteId: '119-SJRES-3-2',
  vote: 'Nay',
  billId: '119-SJRES-3',
  billType: 'SJRES',
  billNumber: '3',
  billTitle: 'A joint resolution example',
  actionDate: '2025-01-15',
  rollNumber: 102,
  chamber: 'Senate',
  question: 'On the Joint Resolution S.J.Res. 3',
};

const sampleLegislator = {
  nameTitle: 'Sen. Bernie Sanders (VT)',
  party: 'Independent',
  state: 'VT',
  type: 'sen',
  imageUrl: '/images/legislators/S000033.jpg',
};

test('buildLegislatorVoteView assembles layered data', () => {
  const view = buildLegislatorVoteView(
    sampleVote.voteId,
    sampleVote.bioguideId,
    sampleVote,
    sampleLegislator,
  );

  assert.equal(view.ids.voteId, '119-SJRES-3-2');
  assert.equal(view.legislator.party, 'Independent');
  assert.equal(view.legislator.stateName, 'Vermont');
  assert.equal(view.bill.legislationIdentifier, 'S.J. Res. 3');
  assert.equal(view.page.socialCardPath, '/social-cards/v/119-SJRES-3-2/S000033.png');
  assert.equal(view.display.actionLabel, 'Nay');
});

test('toVotedCardProps maps card fields', () => {
  const view = buildLegislatorVoteView(
    sampleVote.voteId,
    sampleVote.bioguideId,
    sampleVote,
    sampleLegislator,
  );
  const props = toVotedCardProps(view);

  assert.equal(props.voteCast, 'Nay');
  assert.equal(props.legislationType, 'joint resolution');
  assert.equal(props.imageUrl, '/images/legislators/S000033.jpg');
  assert.equal(props.displayName, 'Sen. Bernie Sanders');
  assert.equal(props.actionLabel, 'Nay');
  assert.equal(props.voteVerb, 'voted');
});

test('toPageVotedProps maps page fields', () => {
  const view = buildLegislatorVoteView(
    sampleVote.voteId,
    sampleVote.bioguideId,
    sampleVote,
    sampleLegislator,
  );
  const props = toPageVotedProps(view);

  assert.equal(props.nameTitle, 'Sen. Bernie Sanders (VT)');
  assert.equal(props.billTitle, 'A joint resolution example');
});

test('resolveLegislatorVoteViewWithSources returns vote-not-found', async () => {
  const result = await resolveLegislatorVoteViewWithSources(
    { voteId: 'missing', bioguideId: 'S000033' },
    {
      getLegislatorVote: async () => undefined,
      getLegislator: async () => sampleLegislator,
    },
  );

  assert.deepEqual(result, { ok: false, reason: 'vote-not-found' });
});

test('resolveLegislatorVoteViewWithSources returns legislator-not-found', async () => {
  const result = await resolveLegislatorVoteViewWithSources(
    { voteId: sampleVote.voteId, bioguideId: sampleVote.bioguideId },
    {
      getLegislatorVote: async () => sampleVote,
      getLegislator: async () => undefined,
    },
  );

  assert.deepEqual(result, { ok: false, reason: 'legislator-not-found' });
});

test('resolveLegislatorVoteViewWithSources returns view on success', async () => {
  const result = await resolveLegislatorVoteViewWithSources(
    { voteId: sampleVote.voteId, bioguideId: sampleVote.bioguideId },
    {
      getLegislatorVote: async () => sampleVote,
      getLegislator: async () => sampleLegislator,
    },
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.view.vote.cast, 'Nay');
  }
});
