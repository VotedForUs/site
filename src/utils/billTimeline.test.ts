import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { actorOf, groupByDay, timelineOf, type TimelineAction } from './billTimeline.js';

const loc = { name: 'Library of Congress' };
const house = { name: 'House floor actions' };
const senate = { name: 'Senate' };

describe('actorOf', () => {
  it('trusts the chamber feed over the action type', () => {
    assert.equal(actorOf({ sourceSystem: house, type: 'President' }), 'House');
    assert.equal(actorOf({ sourceSystem: senate, type: 'Floor' }), 'Senate');
  });

  it('reads a Library of Congress action by its type', () => {
    assert.equal(actorOf({ sourceSystem: loc, type: 'President' }), 'President');
    assert.equal(actorOf({ sourceSystem: loc, type: 'BecameLaw' }), 'President');
    assert.equal(actorOf({ sourceSystem: loc, type: 'IntroReferral' }), null);
    assert.equal(actorOf({}), null);
  });
});

describe('timelineOf', () => {
  it('folds the two reports of one action into one line', () => {
    const actions: TimelineAction[] = [
      { actionDate: '2025-07-04', text: 'Signed by President.', type: 'President', sourceSystem: loc },
      { actionDate: '2025-07-04', text: 'Signed by President.', type: 'BecameLaw', sourceSystem: loc },
    ];
    assert.deepEqual(timelineOf(actions), [
      { date: '2025-07-04', time: undefined, actor: 'President', text: 'Signed by President.', voteIds: [] },
    ]);
  });

  it('keeps the chamber, the time and the votes whichever report carried them', () => {
    const actions: TimelineAction[] = [
      { actionDate: '2025-07-03', text: 'Presented to President.', type: 'President', sourceSystem: loc },
      {
        actionDate: '2025-07-03', actionTime: '14:31:00', text: 'Presented to President', type: 'Floor',
        sourceSystem: house, recordedVotes: [{ id: '119-HR-1-5' }, {}],
      },
    ];
    assert.deepEqual(timelineOf(actions), [
      { date: '2025-07-03', time: '14:31:00', actor: 'House', text: 'Presented to President.', voteIds: ['119-HR-1-5'] },
    ]);
  });

  it('keeps the same words on different days apart, and the order it was given', () => {
    const actions: TimelineAction[] = [
      { actionDate: '2025-07-02', text: 'Considered by Senate.', sourceSystem: senate },
      { actionDate: '2025-07-01', text: 'Considered by Senate.', sourceSystem: senate },
    ];
    assert.deepEqual(timelineOf(actions).map(entry => entry.date), ['2025-07-02', '2025-07-01']);
  });

  it('never keeps a Library-only action out, and skips one with nothing to say', () => {
    const entries = timelineOf([
      { actionDate: '2025-07-04', text: 'Became Public Law No: 119-21.', type: 'BecameLaw', sourceSystem: loc },
      { actionDate: '2025-07-04', text: '   ', sourceSystem: house },
      { text: 'No date', sourceSystem: house },
    ]);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].text, 'Became Public Law No: 119-21.');
  });

  it('does not repeat a vote two reports both list', () => {
    const vote = [{ id: '119-HR-1-1' }];
    const [entry] = timelineOf([
      { actionDate: '2025-05-22', text: 'On passage Passed.', sourceSystem: house, recordedVotes: vote },
      { actionDate: '2025-05-22', text: 'On passage: Passed', sourceSystem: loc, recordedVotes: vote },
    ]);
    assert.deepEqual(entry.voteIds, ['119-HR-1-1']);
  });
});

describe('groupByDay', () => {
  it('puts consecutive entries of one date under one day', () => {
    const days = groupByDay(timelineOf([
      { actionDate: '2025-07-04', text: 'a', sourceSystem: house },
      { actionDate: '2025-07-04', text: 'b', sourceSystem: house },
      { actionDate: '2025-07-03', text: 'c', sourceSystem: house },
    ]));
    assert.deepEqual(days.map(day => [day.date, day.entries.length]), [['2025-07-04', 2], ['2025-07-03', 1]]);
    assert.deepEqual(groupByDay([]), []);
  });
});
