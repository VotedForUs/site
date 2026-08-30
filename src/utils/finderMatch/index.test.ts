/**
 * One describe block per matching rule. The fixture is real bill ids, titles
 * and members, small enough to read; ./README.md explains the rules.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  BILL_TYPES,
  MATCH_KINDS,
  MEMBER_MATCH_KINDS,
  MEMBER_MIN_QUERY_LENGTH,
  TITLE_STOPWORDS,
  billTypeMatches,
  countBuckets,
  extractCitations,
  isBillTypeQuery,
  isStateCode,
  matchBills,
  matchMembers,
  memberGroupOrder,
  normalise,
  parseBillRef,
  searchBills,
  type BillRow,
  type MatchKind,
} from './index.js';
import { bills, hrOnlyBills, members } from './fixtures.js';

/** Ids in one bucket, in the order the matcher put them. */
const ids = (rows: BillRow[]) => rows.map((r) => r.i);
const names = (rows: { n: string }[]) => rows.map((r) => r.n);

/** Every bucket a query put this bill in — the "at most one group" check. */
const groupsFor = (query: string, id: string): MatchKind[] => {
  const buckets = matchBills(bills, query);
  return MATCH_KINDS.filter((k) => ids(buckets[k]).includes(id));
};

describe('normalise', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    assert.equal(normalise('  H.R.   1,  "Act"  '), 'h r 1 act');
  });

  it('strips em and en dashes', () => {
    // Bill titles use them; leaving them in creates a token no query reaches.
    assert.equal(normalise('Small Business—Rural Access Act'), 'small business rural access act');
    assert.equal(normalise('Fiscal Year 2025–2026'), 'fiscal year 2025 2026');
  });
});

describe('bill type is a filter, not a match', () => {
  it('returns every type a prefix could mean, exact first, and never resolves to one', () => {
    assert.deepEqual(billTypeMatches('h'), ['hr', 'hjres', 'hconres', 'hres']);
    assert.deepEqual(billTypeMatches('s'), ['s', 'sjres', 'sconres', 'sres']);
    assert.deepEqual(billTypeMatches('hr'), ['hr', 'hres']);
    assert.deepEqual(billTypeMatches('sj'), ['sjres']);
    assert.ok(billTypeMatches('h').length > 1, 'a prefix must never assert a single type');
  });

  it('narrows to one only when the query names it', () => {
    assert.deepEqual(billTypeMatches('hre'), ['hres']);
    assert.deepEqual(billTypeMatches('hres'), ['hres']);
  });

  it('is not a type query once a digit appears, or when nothing is typed', () => {
    assert.deepEqual(billTypeMatches('hr 26'), []);
    assert.deepEqual(billTypeMatches(''), []);
    assert.equal(isBillTypeQuery('h'), true);
    assert.equal(isBillTypeQuery('veterans'), false);
  });

  it('renders no result rows for a bare type', () => {
    const buckets = matchBills(bills, 'h');
    assert.deepEqual(countBuckets(buckets).total, 0);
  });

  it('every type in the fixture is a known bill type', () => {
    for (const y of new Set(bills.map((b) => b.y))) {
      assert.ok((BILL_TYPES as readonly string[]).includes(y), y);
    }
  });
});

describe('searchBills — chips, counts and the empty-type signal', () => {
  it('counts each type from the index and drops a chip that leads nowhere', () => {
    // No sconres bill has a recorded vote in the fixture, so it gets no chip.
    const { typeFilter, typeCounts, emptyTypes } = searchBills(bills, 's');
    assert.deepEqual(typeFilter, ['s', 'sjres', 'sres']);
    assert.deepEqual(typeCounts, { s: 1, sres: 1, sjres: 1 });
    assert.deepEqual(emptyTypes, []);
  });

  it('reports emptyTypes when every candidate is empty, so the UI can say why', () => {
    const { typeFilter, emptyTypes, buckets } = searchBills(hrOnlyBills, 's');
    assert.deepEqual(typeFilter, []);
    assert.deepEqual(emptyTypes, ['s', 'sjres', 'sconres', 'sres']);
    assert.equal(countBuckets(buckets).total, 0, 'no chips, no rows — but a reason');
  });

  it('passes non-type queries straight through to the buckets', () => {
    const { typeFilter, emptyTypes, buckets } = searchBills(bills, 'veterans');
    assert.deepEqual(typeFilter, []);
    assert.deepEqual(emptyTypes, []);
    assert.deepEqual(ids(buckets['title-text']), ['119-HR-224']);
  });
});

describe('exact id and id contains', () => {
  it('resolves a bill number to one bill', () => {
    // A bare bill number resolves to one bill.
    const buckets = matchBills(bills, '4405');
    assert.deepEqual(ids(buckets['exact-id']), ['119-HR-4405']);
    assert.equal(countBuckets(buckets).total, 1);
  });

  it('reads spacing, type prefix and full id as the same query', () => {
    // "hr 26", "hr26" and "119-hr-26" are the same query.
    for (const q of ['hr 26', 'hr26', '119-hr-26']) {
      const buckets = matchBills(bills, q);
      assert.deepEqual(ids(buckets['exact-id']), ['119-HR-26'], q);
      assert.deepEqual(ids(buckets['id-contains']), ['119-HR-260', '119-HR-2616'], q);
      assert.equal(countBuckets(buckets).total, 3, q);
    }
  });

  it('requires a digit, or the letters of a type match every id of that type', () => {
    // Without the guard "hr" returned every House bill. It is a type query now,
    // and a letters-only query that is not a type reaches no id at all.
    assert.equal(countBuckets(matchBills(bills, 'hr')).total, 0);
    assert.deepEqual(ids(matchBills(bills, 'zzzz')['id-contains']), []);
  });
});

describe('numeric queries stop at ids', () => {
  it('never falls through to a title carrying the same digits', () => {
    // "Continuing Appropriations Act, 2026" must not answer "26".
    const buckets = matchBills(bills, '26');
    assert.deepEqual(ids(buckets['exact-id']), ['119-HR-26']);
    assert.deepEqual(ids(buckets['id-contains']), ['119-HR-260', '119-HR-2616']);
    assert.deepEqual(ids(buckets['title-text']), []);
  });

  it('a year typed alone matches no title', () => {
    assert.equal(countBuckets(matchBills(bills, '2026')).total, 0);
  });
});

describe('id appears in title', () => {
  it('means THIS bill cites the bill the query names', () => {
    // H.R. 1 displays as "One Big Beautiful Bill Act"; the citation to
    // H. Con. Res. 14 exists only in the official title, so the group reads
    // `cites`, never `h`.
    for (const q of ['hconres 14', 'hconres14', '119-hconres-14']) {
      assert.deepEqual(ids(matchBills(bills, q)['id-in-title']), ['119-HR-1'], q);
    }
  });

  it('is anchored at both ends — a citation to 14 does not answer 1 or 140', () => {
    assert.deepEqual(ids(matchBills(bills, 'hconres 1')['id-in-title']), []);
    assert.deepEqual(ids(matchBills(bills, 'hconres 140')['id-in-title']), []);
  });

  it('still finds the cited bill itself under its own id', () => {
    const buckets = matchBills(bills, 'hconres 14');
    assert.deepEqual(ids(buckets['exact-id']), ['119-HCONRES-14']);
  });
});

describe('extractCitations — build time only', () => {
  it('pulls a cited id out of an official title', () => {
    assert.deepEqual(
      extractCitations('Making further continuing appropriations pursuant to title II of H. Con. Res. 14, and for other purposes.'),
      ['hconres 14'],
    );
  });

  it('prefers the longest spaced form, so "s con res" does not lose to "s"', () => {
    assert.deepEqual(extractCitations('Providing for consideration of S. Con. Res. 12'), ['sconres 12']);
  });

  it('ignores years, numerals and section numbers — the FISA title', () => {
    assert.deepEqual(
      extractCitations('To reform the Foreign Intelligence Surveillance Act of 1978, including title VII as amended in 2008.'),
      [],
    );
  });

  it('needs a leading boundary, so a word ending in s is not the Senate form', () => {
    assert.deepEqual(extractCitations('Veterans 2nd Amendment Protection Act'), []);
  });

  it('needs a trailing boundary, so a citation to 14 is not a citation to 1', () => {
    assert.ok(!extractCitations('pursuant to H. Con. Res. 14').includes('hconres 1'));
  });

  it('reports each cited bill once', () => {
    assert.deepEqual(extractCitations('To amend H.R. 1 and to repeal section 3 of H.R. 1'), ['hr 1']);
  });

  it('returns an array for a title that cites nothing', () => {
    assert.deepEqual(extractCitations('Epstein Files Transparency Act'), []);
  });
});

describe('alias — the authored nickname field', () => {
  it('finds H.R. 1 by "obbb"', () => {
    // The named case: a reader typing obbb means one bill.
    const buckets = matchBills(bills, 'obbb');
    assert.deepEqual(ids(buckets['alias']), ['119-HR-1']);
    assert.equal(countBuckets(buckets).total, 1);
  });

  it('matches a nickname by prefix while it is still being typed', () => {
    assert.deepEqual(ids(matchBills(bills, 'ob')['alias']), ['119-HR-1']);
    assert.deepEqual(ids(matchBills(bills, 'fbm')['alias']), ['119-HR-8467']);
  });

  it('ranks above title text — the alias group takes the bill, the title group does not', () => {
    const buckets = matchBills(bills, 'farm bill');
    assert.deepEqual(ids(buckets['alias']), ['119-HR-8467']);
    assert.deepEqual(ids(buckets['title-text']), [], 'a bill lands in at most one group');
  });

  it('leaves a bill with no aliases to the other groups', () => {
    assert.deepEqual(ids(matchBills(bills, 'one big beautiful')['title-text']), ['119-HR-1']);
    assert.deepEqual(ids(matchBills(bills, 'one big beautiful')['alias']), []);
  });

  it('treats an empty alias array as the normal row, not a gap', () => {
    const noAliases = bills.filter((b) => b.a.length === 0);
    assert.ok(noAliases.length > 0);
    assert.deepEqual(ids(matchBills(noAliases, 'veterans')['title-text']), ['119-HR-224']);
  });
});

describe('title text', () => {
  it('matches a single word as a whole word, not a substring', () => {
    // "form" must not reach "Reform".
    assert.deepEqual(ids(matchBills(bills, 'form')['title-text']), []);
    assert.deepEqual(ids(matchBills(bills, 'reform')['title-text']), ['119-HR-3617']);
  });

  it('matches a phrase as a substring', () => {
    assert.deepEqual(ids(matchBills(bills, 'defense authorization')['title-text']), ['119-HRES-282']);
    assert.deepEqual(ids(matchBills(bills, 'business rural')['title-text']), ['119-HR-7788']);
  });

  it('ignores a single word under three characters', () => {
    assert.equal(countBuckets(matchBills(bills, 'or')).total, 0);
    assert.equal(countBuckets(matchBills(bills, 'to')).total, 0);
  });

  it('ignores a stopword typed alone', () => {
    // "act" appeared in 93% of titles. A group that always matches informs nothing.
    assert.equal(countBuckets(matchBills(bills, 'act')).total, 0);
    for (const word of TITLE_STOPWORDS) {
      assert.equal(countBuckets(matchBills(bills, word)).total, 0, word);
    }
  });

  it('a stopword inside a phrase still matches', () => {
    assert.deepEqual(ids(matchBills(bills, 'files transparency act')['title-text']), ['119-HR-4405']);
  });

  it('produces the empty state rather than a guess', () => {
    // No fuzzy match, no transposition, no spelling suggestion.
    assert.equal(countBuckets(matchBills(bills, 'zzzz')).total, 0);
    assert.equal(countBuckets(matchBills(bills, 'veterens')).total, 0);
  });

  it('matches the query as one contiguous string', () => {
    assert.equal(countBuckets(matchBills(bills, 'vtrns')).total, 0);
  });
});

describe('a bill lands in at most one group', () => {
  for (const [q, id] of [
    ['hr 26', '119-HR-26'],
    ['hconres 14', '119-HR-1'],
    ['obbb', '119-HR-1'],
    ['farm bill', '119-HR-8467'],
    ['veterans', '119-HR-224'],
  ] as const) {
    it(`"${q}" puts ${id} in exactly one bucket`, () => {
      assert.equal(groupsFor(q, id).length, 1);
    });
  }

  it('renders the groups in the declared order', () => {
    assert.deepEqual([...MATCH_KINDS], ['exact-id', 'id-contains', 'id-in-title', 'alias', 'title-text']);
  });
});

describe('empty and unqueryable input', () => {
  it('returns empty buckets rather than the corpus', () => {
    for (const q of ['', '   ', '.', '--']) {
      assert.equal(countBuckets(matchBills(bills, q)).total, 0, JSON.stringify(q));
      assert.equal(countBuckets(matchMembers(members, q)).total, 0, JSON.stringify(q));
    }
  });
});

describe('member minimum length — two characters', () => {
  it('is two, and lives in matchMembers so every caller inherits it', () => {
    assert.equal(MEMBER_MIN_QUERY_LENGTH, 2);
  });

  it('renders no member rows for a single letter', () => {
    // One letter matched 62% of member names when measured — not a query.
    const buckets = matchMembers(members, 'r');
    assert.equal(countBuckets(buckets).total, 0);
    assert.deepEqual(Object.keys(buckets), [...MEMBER_MATCH_KINDS]);
  });

  it('renders no member rows for a single digit either', () => {
    assert.equal(countBuckets(matchMembers(members, '1')).total, 0);
  });

  it('narrows from the second character', () => {
    assert.deepEqual(names(matchMembers(members, 'ry').name), ['Patrick Ryan']);
    assert.deepEqual(names(matchMembers(members, 'ryan').name), ['Patrick Ryan']);
  });
});

describe('member fields — name, state, district', () => {
  it('keeps substring matching on names, because a partial surname is the common case', () => {
    assert.deepEqual(names(matchMembers(members, 'blumen').name), ['Earl Blumenauer']);
    assert.deepEqual(names(matchMembers(members, 'mccormick').name), ['Sheila Cherfilus-McCormick']);
  });

  it('matches a district by number', () => {
    assert.deepEqual(names(matchMembers(members, '18').district), ['Patrick Ryan']);
    assert.deepEqual(names(matchMembers(members, '20').district), ['Sheila Cherfilus-McCormick']);
  });

  it('knows a state code from a number', () => {
    assert.equal(isStateCode('ny'), true);
    assert.equal(isStateCode('NY'), true);
    assert.equal(isStateCode('zz'), false);
  });
});

describe('"ny" — a state code that is also a name fragment', () => {
  it('ranks the state group first', () => {
    assert.deepEqual(memberGroupOrder('ny'), ['state', 'name', 'district']);
    assert.deepEqual(memberGroupOrder('ryan'), ['name', 'state', 'district']);
  });

  it('still renders the name matches below it rather than hiding them', () => {
    const buckets = matchMembers(members, 'ny');
    assert.deepEqual(names(buckets.state), ['Patrick Ryan', 'Nydia Velazquez', 'Chuck Schumer']);
    assert.deepEqual(names(buckets.name), ['Anthony Brown']);
  });

  it('holds for "or" too — Oregon first, Cori and McCormick below', () => {
    const buckets = matchMembers(members, 'or');
    assert.deepEqual(names(buckets.state), ['Earl Blumenauer', 'Jeff Merkley']);
    assert.deepEqual(names(buckets.name), ['Cori Bush', 'Sheila Cherfilus-McCormick']);
  });
});

describe('parseBillRef', () => {
  it('reads a bill reference in any spelling', () => {
    assert.deepEqual(parseBillRef('hr26'), { type: 'hr', number: 26 });
    assert.deepEqual(parseBillRef('hr 26'), { type: 'hr', number: 26 });
    assert.deepEqual(parseBillRef('119-hr-26'), { type: 'hr', number: 26 });
    assert.deepEqual(parseBillRef('hconres 14'), { type: 'hconres', number: 14 });
  });

  it('is null for anything that is not one', () => {
    assert.equal(parseBillRef('ryan'), null);
    assert.equal(parseBillRef('26'), null);
    assert.equal(parseBillRef('zz 12'), null);
  });
});

describe('countBuckets', () => {
  it('counts each group and the total', () => {
    const { per, total } = countBuckets(matchBills(bills, 'hr 26'));
    assert.deepEqual(per, { 'exact-id': 1, 'id-contains': 2, 'id-in-title': 0, alias: 0, 'title-text': 0 });
    assert.equal(total, 3);
  });
});
