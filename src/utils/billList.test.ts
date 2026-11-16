import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { billsOfTerm, groupByStatus, termOf, typeLinks, typePrefix } from './billList.js';
import type { BillRow } from './finderMatch/index.js';

const row = (i: string, s = 'inProgress'): BillRow => {
  const [, type, number] = i.split('-');
  return { i, t: `${type} ${number}`, n: Number(number), y: type.toLowerCase(), h: `Title of ${i}`, cites: [], a: [], s, d: '2026-01-01', v: 1 };
};

const rows = [
  row('119-HR-1', 'becameLaw'), row('119-S-5'), row('119-HR-22', 'rejected'),
  row('119-HRES-3'), row('118-HR-9', 'becameLaw'),
];

describe('billsOfTerm', () => {
  it('keeps one congress, and one type when asked', () => {
    assert.equal(termOf(rows[0]), '119');
    assert.deepEqual(billsOfTerm(rows, 119).map(r => r.i), ['119-HR-1', '119-S-5', '119-HR-22', '119-HRES-3']);
    assert.deepEqual(billsOfTerm(rows, '119', 'HR').map(r => r.i), ['119-HR-1', '119-HR-22']);
    assert.deepEqual(billsOfTerm(rows, 117), []);
  });
});

describe('groupByStatus', () => {
  it('orders the groups decided-first and keeps row order inside each', () => {
    const groups = groupByStatus(billsOfTerm(rows, 119));
    assert.deepEqual(groups.map(g => [g.label, g.rows.map(r => r.i)]), [
      ['became law', ['119-HR-1']],
      ['in progress', ['119-S-5', '119-HRES-3']],
      ['failed', ['119-HR-22']],
    ]);
  });

  it('leaves out an empty status and keeps one it has never heard of', () => {
    const groups = groupByStatus([row('119-S-5'), row('119-S-6', 'vetoed')]);
    assert.deepEqual(groups.map(g => [g.status, g.label]), [['inProgress', 'in progress'], ['vetoed', 'vetoed']]);
    assert.deepEqual(groupByStatus([]), []);
  });
});

describe('typeLinks', () => {
  it('links every type that has a bill, after a link to all of them', () => {
    const links = typeLinks(billsOfTerm(rows, 119), 119, '/');
    assert.deepEqual(links.map(l => [l.label, l.count, l.href, l.current]), [
      ['All', 4, '/bills/119', true],
      ['H.R.', 2, '/bills/119/hr', false],
      ['S.', 1, '/bills/119/s', false],
      ['H. Res.', 1, '/bills/119/hres', false],
    ]);
  });

  it('marks the type being shown, and carries a base path', () => {
    const links = typeLinks(billsOfTerm(rows, 119), 119, '/site/', 'HR');
    assert.deepEqual(links.filter(l => l.current).map(l => l.href), ['/site/bills/119/hr']);
    assert.equal(links[0].href, '/site/bills/119');
  });

  it('names a type by the prefix a reader knows', () => {
    assert.equal(typePrefix('hjres'), 'H.J. Res.');
    assert.equal(typePrefix('s'), 'S.');
  });
});
