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
  billTypeMatches,
  countBuckets,
  extractCitations,
  isBillTypeQuery,
  isStateCode,
  matchBills,
  matchMembers,
  memberGroupOrder,
  normalise,
  normaliseWithMap,
  parseBillRef,
  parseSeat,
  stateCodesForQuery,
  type MemberRow,
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
  it('matches from the first character, so a part-typed word narrows', () => {
    const counts = ['v', 've', 'vet', 'veterans'].map(
      (q) => matchBills(bills, q)['title-text'].length,
    );
    assert.ok(counts[0] >= counts[1] && counts[1] >= counts[2] && counts[2] >= counts[3], counts.join(' → '));
    assert.ok(counts[3] > 0, 'the finished word still matches');
  });

  it('matches a substring inside a word', () => {
    // The cost of narrowing from the first character: "form" reaches both
    // "Reforming" and "Reform", where the whole-word rule reached neither.
    assert.deepEqual(ids(matchBills(bills, 'form')['title-text']), ['119-HR-9238', '119-HR-3617']);
    assert.deepEqual(ids(matchBills(bills, 'reform')['title-text']), ['119-HR-9238', '119-HR-3617']);
  });

  it('matches a phrase as a substring', () => {
    assert.deepEqual(ids(matchBills(bills, 'defense authorization')['title-text']), ['119-HRES-282']);
    assert.deepEqual(ids(matchBills(bills, 'business rural')['title-text']), ['119-HR-7788']);
  });

  it('matches a common word rather than blanking the list', () => {
    // "act" is in most titles. Narrowing 739 rows to 507 is still a narrowing;
    // rendering nothing at the third keystroke of "action" was not.
    assert.ok(matchBills(bills, 'act')['title-text'].length > 0);
    assert.ok(matchBills(bills, 'a')['title-text'].length >= matchBills(bills, 'ac')['title-text'].length);
  });

  it('a phrase spanning a common word still matches', () => {
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

describe('member minimum length — one character', () => {
  it('is one, and lives in matchMembers so every caller inherits it', () => {
    assert.equal(MEMBER_MIN_QUERY_LENGTH, 1);
  });

  it('narrows from the first letter', () => {
    const buckets = matchMembers(members, 'r');
    assert.ok(countBuckets(buckets).total > 0);
    assert.deepEqual(Object.keys(buckets), [...MEMBER_MATCH_KINDS]);
    assert.ok(names(buckets.name).every((n) => n.toLowerCase().includes('r')));
  });

  it('a single digit reaches the districts of that number', () => {
    const expected = members.filter((m) => m.d === 1).map((m) => m.n);
    assert.deepEqual(names(matchMembers(members, '1').district), expected);
  });

  it('keeps narrowing as the query grows', () => {
    assert.ok(names(matchMembers(members, 'ry').name).includes('Patrick Ryan'));
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

const roster: MemberRow[] = [
  { b: 'S000148', n: 'Charles E. Schumer', s: 'NY', p: 'D', c: 'senate', v: 500, k: 'chuck' },
  { b: 'O000172', n: 'Alexandria Ocasio-Cortez', s: 'NY', d: 14, p: 'D', c: 'house', v: 600 },
  { b: 'S001156', n: 'Linda T. Sánchez', s: 'CA', d: 38, p: 'D', c: 'house', v: 600 },
  { b: 'L000614', n: 'Erica Lee Carter', s: 'TX', d: 18, p: 'D', c: 'house', v: 20 },
  { b: 'C001056', n: 'John Cornyn', s: 'TX', p: 'R', c: 'senate', v: 500 },
  { b: 'F000450', n: 'Virginia Foxx', s: 'NC', d: 5, p: 'R', c: 'house', v: 600 },
  { b: 'K000384', n: 'Tim Kaine', s: 'VA', p: 'D', c: 'senate', v: 500 },
  { b: 'A000370', n: 'Alma S. Adams', s: 'NC', d: 12, p: 'D', c: 'house', v: 600 },
];
const bio = (rows: MemberRow[]) => rows.map(r => r.b);

describe('accents', () => {
  it('folds them, because nobody types them', () => {
    assert.equal(normalise('Linda T. Sánchez'), 'linda t sanchez');
    assert.equal(normalise('Ben Ray Luján'), 'ben ray lujan');
    assert.deepEqual(bio(matchMembers(roster, 'sanchez').name), ['S001156']);
  });

  it('still matches when the reader does type them', () => {
    assert.deepEqual(bio(matchMembers(roster, 'Sánchez').name), ['S001156']);
  });
});

describe('normaliseWithMap', () => {
  it('agrees with normalise', () => {
    for (const text of ['S. 1071', '  “Chuy” García — Jr. ', 'H. Con. Res. 14', '', '...', 'a  b']) {
      assert.equal(normaliseWithMap(text).norm, normalise(text), JSON.stringify(text));
    }
  });

  it('says where each normalised character came from', () => {
    const text = 'O. Graham';
    const { norm, map } = normaliseWithMap(text);
    assert.equal(norm, 'o graham');
    assert.equal(map.length, norm.length);
    assert.equal(text[map[norm.indexOf('graham')]], 'G');
  });
});

describe('states by name', () => {
  it('reads a whole name as its code', () => {
    assert.deepEqual(stateCodesForQuery('Texas'), ['TX']);
    assert.deepEqual(stateCodesForQuery('new york'), ['NY']);
    assert.deepEqual(stateCodesForQuery('ny'), ['NY']);
  });

  it('reads the start of a name as every state it could be', () => {
    assert.deepEqual(stateCodesForQuery('new').sort(), ['NH', 'NJ', 'NM', 'NY']);
    assert.deepEqual(stateCodesForQuery('north').sort(), ['MP', 'NC', 'ND']); // Northern Mariana Islands too
  });

  it('does not take a one- or two-letter fragment for a name', () => {
    assert.deepEqual(stateCodesForQuery('t'), []);
    assert.deepEqual(stateCodesForQuery('te'), []);
  });

  it('“virginia” is Virginia, not West Virginia', () => {
    assert.deepEqual(stateCodesForQuery('virginia'), ['VA']);
    assert.deepEqual(stateCodesForQuery('west virginia'), ['WV']);
  });

  it('puts the delegation in the state group and keeps a same-named member', () => {
    const texas = matchMembers(roster, 'texas');
    assert.deepEqual(bio(texas.state), ['L000614', 'C001056']);
    const virginia = matchMembers(roster, 'virginia');
    assert.deepEqual(bio(virginia.state), ['K000384']);
    assert.deepEqual(bio(virginia.name), ['F000450']);
  });

  it('leads with the state only when it is said in full', () => {
    assert.equal(memberGroupOrder('texas')[0], 'state');
    assert.equal(memberGroupOrder('TX')[0], 'state');
    assert.equal(memberGroupOrder('tex')[0], 'name');
  });
});

describe('a seat', () => {
  it('is read however it is written', () => {
    for (const q of ['tx-18', 'TX 18', 'tx18', 'Texas 18', 'texas-18']) {
      assert.deepEqual(parseSeat(q), { state: 'TX', district: 18 }, q);
    }
    assert.deepEqual(parseSeat('new york 14'), { state: 'NY', district: 14 });
  });

  it('is not a bare number, a bare state, or a bill', () => {
    for (const q of ['18', 'tx', 'hr 18', 'zz 18', 'tex 18']) assert.equal(parseSeat(q), null, q);
  });

  it('finds the House member for that district and nobody else', () => {
    const found = matchMembers(roster, 'tx-18');
    assert.deepEqual(bio(found.district), ['L000614']);
    assert.deepEqual(found.state, []);
    assert.deepEqual(found.name, []);
    assert.equal(memberGroupOrder('tx-18')[0], 'district');
  });

  it('never matches a senator, who has no district', () => {
    assert.deepEqual(matchMembers(roster, 'ny 14').district.map(r => r.c), ['house']);
  });
});

describe('what a member goes by', () => {
  it('finds a member by the name they use', () => {
    assert.deepEqual(bio(matchMembers(roster, 'chuck').name), ['S000148']);
    assert.deepEqual(bio(matchMembers(roster, 'chuck schumer').name), ['S000148']);
  });

  it('finds a name whose words are typed apart or out of order', () => {
    assert.deepEqual(bio(matchMembers(roster, 'ocasio alexandria').name), ['O000172']);
    assert.deepEqual(bio(matchMembers(roster, 'alma adams').name), ['A000370']);
  });

  it('needs every word', () => {
    assert.deepEqual(matchMembers(roster, 'chuck cornyn').name, []);
  });
});
