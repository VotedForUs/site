import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readFinderCounts, readFinderIndex, readMemberStatus } from './finderIndex.js';
import { MEMBER_STATUS_LABELS, memberStatus, type MemberRow } from './finderMatch/index.js';

const seated: MemberRow = { b: 'A000055', n: 'Robert B. Aderholt', s: 'AL', d: 4, p: 'R', c: 'house', v: 412, i: 1 };
const left: MemberRow = { b: 'M001156', n: 'Patrick T. McHenry', s: 'NC', d: 10, p: 'R', c: 'house', v: 1, f: 1 };

/** A public dir holding whichever index files the test names. */
function publicDir(files: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finder-index-'));
  fs.mkdirSync(path.join(dir, 'finder'));
  for (const [name, rows] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, 'finder', name), JSON.stringify(rows));
  }
  return dir;
}

describe('memberStatus', () => {
  it('is current unless the row is flagged, and every status has a label', () => {
    assert.equal(memberStatus(seated), 'current');
    assert.equal(memberStatus(left), 'former');
    assert.equal(MEMBER_STATUS_LABELS[memberStatus(seated)], 'Current');
    assert.equal(MEMBER_STATUS_LABELS[memberStatus(left)], 'Former');
  });
});

describe('readFinderIndex', () => {
  it('reads each half on its own, and counts only when it has both', () => {
    const membersOnly = publicDir({ 'members.json': [seated, left] });
    assert.equal(readFinderIndex(membersOnly).members?.length, 2);
    assert.equal(readFinderIndex(membersOnly).bills, null);
    assert.equal(readFinderCounts(membersOnly), null);

    const both = publicDir({ 'members.json': [seated], 'bills.json': [] });
    assert.deepEqual(readFinderCounts(both), { members: 1, bills: 0 });
  });
});

describe('readMemberStatus', () => {
  it('says what the member’s own row says', () => {
    const dir = publicDir({ 'members.json': [seated, left] });
    assert.equal(readMemberStatus('A000055', dir), 'current');
    assert.equal(readMemberStatus('M001156', dir), 'former');
  });

  it('is null for a member the index does not hold, or with no index at all', () => {
    assert.equal(readMemberStatus('Z000000', publicDir({ 'members.json': [seated] })), null);
    assert.equal(readMemberStatus('A000055', publicDir({})), null);
  });
});
