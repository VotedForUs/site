/**
 * Fixture corpus for the finderMatch tests: real bill ids and titles, chosen
 * so every rule has the neighbour it needs — H.R. 1 citing H. Con. Res. 14,
 * H.R. 260 and H.R. 2616 beside H.R. 26, a title carrying "2026", an
 * em-dashed title, and the FISA title whose years must not read as citations.
 *
 * `cites` holds what extractCitations() returns for that bill's official
 * title, and `s` is a getBillState value — both are what the build step puts
 * in the index, so a fixture never asserts a shape the build cannot produce.
 */
import type { BillRow, MemberRow } from './index.js';

export const bills: BillRow[] = [
  {
    i: '119-HR-1', t: 'H.R. 1', n: 1, y: 'hr',
    h: 'One Big Beautiful Bill Act',
    cites: ['hconres 14'], a: ['obbb'],
    s: 'becameLaw', d: '2025-07-04', v: 9,
  },
  {
    i: '119-HR-26', t: 'H.R. 26', n: 26, y: 'hr',
    h: 'Midnight Rules Relief Act',
    cites: [], a: [],
    s: 'inProgress', d: '2025-02-12', v: 2,
  },
  {
    i: '119-HR-260', t: 'H.R. 260', n: 260, y: 'hr',
    h: 'Fire Grants and Safety Act',
    cites: [], a: [],
    s: 'inProgress', d: '2025-03-03', v: 1,
  },
  {
    i: '119-HR-2616', t: 'H.R. 2616', n: 2616, y: 'hr',
    h: 'Preserving Patient Access to Home Infusion Act',
    cites: [], a: [],
    s: 'inProgress', d: '2025-04-08', v: 1,
  },
  {
    i: '119-HR-224', t: 'H.R. 224', n: 224, y: 'hr',
    h: 'Veterans Benefits Improvement Act',
    cites: [], a: [],
    s: 'inProgress', d: '2025-01-29', v: 3,
  },
  {
    i: '119-HR-4405', t: 'H.R. 4405', n: 4405, y: 'hr',
    h: 'Epstein Files Transparency Act',
    cites: [], a: [],
    s: 'becameLaw', d: '2025-11-19', v: 2,
  },
  {
    i: '119-HR-9238', t: 'H.R. 9238', n: 9238, y: 'hr',
    h: 'Reforming Intelligence and Securing America Act',
    cites: [], a: [],
    s: 'inProgress', d: '2025-04-15', v: 1,
  },
  {
    // The year in the title: a numeric query must never reach it.
    i: '119-HR-5371', t: 'H.R. 5371', n: 5371, y: 'hr',
    h: 'Continuing Appropriations Act, 2026',
    cites: [], a: [],
    s: 'inProgress', d: '2025-09-19', v: 4,
  },
  {
    // Whole-word rule: "form" must not reach "Reform".
    i: '119-HR-3617', t: 'H.R. 3617', n: 3617, y: 'hr',
    h: 'Insurance Market Reform Act',
    cites: [], a: [],
    s: 'inProgress', d: '2025-05-28', v: 1,
  },
  {
    // Em dash: normalise has to strip it or "business rural" reaches nothing.
    i: '119-HR-7788', t: 'H.R. 7788', n: 7788, y: 'hr',
    h: 'Small Business—Rural Access Act',
    cites: [], a: [],
    s: 'inProgress', d: '2025-06-11', v: 1,
  },
  {
    // Alias against a title that would also match: alias wins, one group only.
    i: '119-HR-8467', t: 'H.R. 8467', n: 8467, y: 'hr',
    h: 'Farm Bill Modernization Act',
    cites: [], a: ['farm bill', 'FBMA'],
    s: 'inProgress', d: '2025-07-22', v: 1,
  },
  {
    i: '119-HCONRES-14', t: 'H. Con. Res. 14', n: 14, y: 'hconres',
    h: 'Concurrent Resolution on the Budget for Fiscal Year 2025',
    cites: [], a: [],
    s: 'inProgress', d: '2025-04-10', v: 5,
  },
  {
    i: '119-HRES-282', t: 'H. Res. 282', n: 282, y: 'hres',
    h: 'Providing for consideration of the National Defense Authorization Act',
    cites: [], a: [],
    s: 'inProgress', d: '2025-04-01', v: 2,
  },
  {
    i: '119-HJRES-25', t: 'H.J. Res. 25', n: 25, y: 'hjres',
    h: 'Disapproving the rule on digital asset brokers',
    cites: [], a: [],
    s: 'becameLaw', d: '2025-04-21', v: 3,
  },
  {
    i: '119-S-4', t: 'S. 4', n: 4, y: 's',
    h: 'Laken Riley Act',
    cites: [], a: [],
    s: 'becameLaw', d: '2025-01-29', v: 6,
  },
  {
    i: '119-SRES-1', t: 'S. Res. 1', n: 1, y: 'sres',
    h: 'Electing officers of the Senate',
    cites: [], a: [],
    s: 'inProgress', d: '2025-01-03', v: 1,
  },
  {
    i: '119-SJRES-3', t: 'S.J. Res. 3', n: 3, y: 'sjres',
    h: 'Disapproving the rule on methane emissions',
    cites: [], a: [],
    s: 'becameLaw', d: '2025-03-14', v: 4,
  },
];

/** hr-only corpus — the shape that makes every candidate of "s" empty. */
export const hrOnlyBills: BillRow[] = bills.filter((b) => b.y === 'hr');

export const members: MemberRow[] = [
  { b: 'R000612', n: 'Patrick Ryan', s: 'NY', d: 18, p: 'D', c: 'house', v: 412, i: 1 },
  { b: 'V000081', n: 'Nydia Velazquez', s: 'NY', d: 7, p: 'D', c: 'house', v: 388, i: 1 },
  { b: 'S000148', n: 'Chuck Schumer', s: 'NY', p: 'D', c: 'senate', v: 501 },
  { b: 'B001300', n: 'Anthony Brown', s: 'MD', d: 4, p: 'D', c: 'house', v: 401, i: 1 },
  { b: 'B001422', n: 'Cori Bush', s: 'MO', d: 1, p: 'D', c: 'house', v: 377 },
  { b: 'B000574', n: 'Earl Blumenauer', s: 'OR', d: 3, p: 'D', c: 'house', v: 356, i: 1 },
  { b: 'M001176', n: 'Jeff Merkley', s: 'OR', p: 'D', c: 'senate', v: 498 },
  { b: 'C001098', n: 'Ted Cruz', s: 'TX', p: 'R', c: 'senate', v: 487, i: 1 },
  { b: 'C001120', n: 'Sheri Biggs', s: 'SC', d: 3, p: 'R', c: 'house', v: 118 },
  { b: 'J000032', n: 'Sheila Cherfilus-McCormick', s: 'FL', d: 20, p: 'D', c: 'house', v: 290 },
];
