import assert from 'node:assert';
import { describe, it } from 'node:test';

import type { CollectionEntry } from 'astro:content';

import { parseChangelogBillRef, resolveBillLine } from './changelogResolve.js';

describe('parseChangelogBillRef', () => {
  it('returns id for string refs', () => {
    assert.deepStrictEqual(parseChangelogBillRef('119-hr-1'), { id: '119-hr-1' });
  });

  it('returns id and inline title for rich rows', () => {
    assert.deepStrictEqual(
      parseChangelogBillRef({
        id: '119-HR-7147',
        title: 'Department of Homeland Security Appropriations Act, 2026',
        congress: 119,
        billType: 'hr',
        number: '7147',
      }),
      {
        id: '119-HR-7147',
        inlineTitle: 'Department of Homeland Security Appropriations Act, 2026',
      },
    );
  });
});

describe('resolveBillLine', () => {
  const emptyLookup = new Map<string, CollectionEntry<'bills'>>();

  it('does not throw when bill ref is a rich object (regression)', () => {
    const row = resolveBillLine(
      {
        id: '119-HR-7147',
        title: 'Department of Homeland Security Appropriations Act, 2026',
        congress: 119,
        billType: 'hr',
        number: '7147',
        url: 'https://votedfor.us/bills/119/hr/7147',
      },
      emptyLookup,
      '/',
    );
    assert.strictEqual(row.label, 'Department of Homeland Security Appropriations Act, 2026');
    assert.strictEqual(row.href, '/bills/119/hr/7147');
    assert.match(row.meta, /119/);
  });
});
