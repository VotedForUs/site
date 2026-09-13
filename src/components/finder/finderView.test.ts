/**
 * The finder's view rules, tested without a DOM: what the chips say, what the
 * chips remove, where a row links, and the copy for each state.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  billHref,
  billWhy,
  emptyFilters,
  emptyState,
  emptyTypeReason,
  filterBills,
  filterMembers,
  footerLine,
  highlight,
  memberHref,
  memberMeta,
  typeChips,
  allGroupLabel,
  stateChips,
  statusChips,
} from './finderView.js';
import { bills, members } from '../../utils/finderMatch/fixtures.js';

describe('chip rows', () => {
  it('counts every state with a member, alphabetically', () => {
    const chips = stateChips(members);
    assert.deepEqual(chips.map(c => c.value), [...chips.map(c => c.value)].sort());
    const ny = chips.find(c => c.value === 'NY');
    assert.equal(ny?.count, members.filter(m => m.s === 'NY').length);
    assert.equal(ny?.label, `NY ${ny?.count}`);
  });

  it('says a bill status the way a reader would', () => {
    const chips = statusChips(bills);
    assert.ok(chips.every(c => c.count > 0), 'a chip that leads nowhere is not rendered');
    const law = chips.find(c => c.value === 'became-law' || c.value === 'becameLaw');
    if (law) assert.ok(/^became law \d+$/.test(law.label), law.label);
  });
});

describe('filters narrow, never replace', () => {
  it('passes everything when no chip is active', () => {
    assert.equal(filterMembers(members, emptyFilters()).length, members.length);
    assert.equal(filterBills(bills, emptyFilters()).length, bills.length);
  });

  it('keeps only the chosen states', () => {
    const rows = filterMembers(members, { ...emptyFilters(), state: ['NY'] });
    assert.ok(rows.length > 0);
    assert.ok(rows.every(r => r.s === 'NY'));
  });

  it('intersects the type and status rows', () => {
    const status = bills[0].s;
    const rows = filterBills(bills, { ...emptyFilters(), type: ['hr'], status: [status] });
    assert.ok(rows.every(r => r.y === 'hr' && r.s === status));
  });

  it('hands back a fresh filter set each time', () => {
    const a = emptyFilters();
    a.state.push('NY');
    assert.deepEqual(emptyFilters().state, []);
  });
});

describe('chips over the result set', () => {
  it('counts one type chip per type present, never a type with no rows', () => {
    const hr = bills.filter((b) => b.y === 'hr');
    const chips = typeChips(hr);
    assert.deepEqual(chips.map((c) => c.value), ['hr']);
    assert.equal(chips[0].count, hr.length);
    assert.equal(chips[0].label, `HR ${hr.length}`);
  });

  it('shrinks with the rows it is given', () => {
    const one = bills.slice(0, 1);
    assert.equal(stateChips(members.filter((m) => m.s === 'NY')).length, 1);
    assert.equal(statusChips(one).length, 1);
    assert.equal(typeChips(one).length, 1);
  });

  it('is empty when nothing is left', () => {
    assert.deepEqual(stateChips([]), []);
    assert.deepEqual(typeChips([]), []);
    assert.deepEqual(statusChips([]), []);
  });
});

describe('the group before anything is typed', () => {
  it('is labelled for the whole corpus', () => {
    assert.equal(allGroupLabel('members'), 'all members');
    assert.equal(allGroupLabel('bills'), 'all bills');
  });
});

describe('a row links to a prerendered page', () => {
  it('links a member to their page', () => {
    assert.equal(memberHref(members[0]), `/members/${members[0].b}`);
  });

  it('links a bill to its page, congress and type from the id', () => {
    const hr1 = bills.find(b => b.i === '119-HR-1')!;
    assert.equal(billHref(hr1), '/bills/119/hr/1');
  });

  it('carries a deployment base', () => {
    assert.equal(billHref(bills.find(b => b.i === '119-HR-1')!, '/site/'), '/site/bills/119/hr/1');
    assert.equal(memberHref(members[0], '/site/'), `/site/members/${members[0].b}`);
  });
});

describe('row copy', () => {
  it('reads a representative as party, state, seat and chamber', () => {
    const rep = members.find(m => m.c === 'house' && m.d != null)!;
    assert.match(memberMeta(rep), /· House$/);
    assert.ok(memberMeta(rep).includes(`${rep.s}-${rep.d}`));
  });

  it('gives a senator no seat number', () => {
    const sen = members.find(m => m.c === 'senate')!;
    assert.match(memberMeta(sen), /· Senate$/);
    assert.ok(!memberMeta(sen).includes('-'));
  });

  it('names the alias that matched, because it is nowhere in the title', () => {
    const hr1 = bills.find(b => b.i === '119-HR-1')!;
    assert.equal(billWhy('alias', hr1, 'obbb'), 'known as “obbb”');
  });

  it('labels the other groups by what they are', () => {
    const hr1 = bills.find(b => b.i === '119-HR-1')!;
    assert.equal(billWhy('title-text', hr1, 'one big'), 'matched in the title');
    assert.equal(billWhy('exact-id', hr1, 'hr 1'), 'exact match');
  });
});

describe('highlight', () => {
  it('splits a title around the match for a single mark', () => {
    assert.deepEqual(highlight('Midnight Rules Relief Act', 'rules'), {
      pre: 'Midnight ', hit: 'Rules', post: ' Relief Act',
    });
  });

  it('returns the whole string when nothing matched', () => {
    assert.deepEqual(highlight('Midnight Rules', 'zzz'), { pre: 'Midnight Rules', hit: '', post: '' });
    assert.deepEqual(highlight('Midnight Rules', ''), { pre: 'Midnight Rules', hit: '', post: '' });
  });
});

describe('empty state', () => {
  it('names the query and never suggests a spelling', () => {
    const state = emptyState('members', 'veterens', 0);
    assert.equal(state.title, 'Nothing matches “veterens”.');
    assert.ok(state.body.includes('never corrected'));
    assert.equal(state.otherLabel, null);
  });

  it('offers the other mode when it has matches', () => {
    assert.equal(emptyState('members', 'hr 26', 3).otherLabel, 'See 3 bills matching “hr 26”');
    assert.equal(emptyState('bills', 'ryan', 1).otherLabel, 'See 1 member matching “ryan”');
  });

  it('says which types are empty rather than rendering nothing', () => {
    assert.equal(emptyTypeReason(['s', 'sres']), 'No S, SRES bill has a recorded vote.');
  });
});

describe('footer', () => {
  it('counts what is showing — every match renders, there is no page', () => {
    assert.equal(footerLine(606, 'members'),
      '606 members · ordered by name, nothing remembered between visits');
    assert.equal(footerLine(3, 'bills'), '3 bills · every match in the document');
    assert.equal(footerLine(1, 'bills'), '1 bill · every match in the document');
  });
});
