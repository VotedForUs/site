import { describe, it, before, after, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import {
  sha256,
  readJson,
  getChangedAndDeleted,
  mergeUnique,
  computeBillDigests,
  computeLegislatorDigests,
  cascadeFromChangedBills,
  main,
  type DigestMap,
  type SourceDigestManifest,
  type BuildManifest,
} from './incremental-check.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `vfu-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write a minimal bill JSON into {dir}/bills/{congress}/{type}/{number}.json */
function writeBill(
  dir: string,
  congress: string,
  billType: string,
  billNumber: string,
  extra: Record<string, unknown> = {},
): string {
  const billId = `${congress}-${billType.toUpperCase()}-${billNumber}`;
  const billDir = join(dir, 'bills', congress, billType);
  mkdirSync(billDir, { recursive: true });
  const filePath = join(billDir, `${billNumber}.json`);
  writeFileSync(filePath, JSON.stringify({ id: billId, congress, type: billType.toUpperCase(), number: billNumber, ...extra }));
  return filePath;
}

/** Write a minimal legislator JSON into {dir}/legislators/{bioguide}.json */
function writeLegislator(dir: string, bioguide: string, extra: Record<string, unknown> = {}): string {
  const legDir = join(dir, 'legislators');
  mkdirSync(legDir, { recursive: true });
  const filePath = join(legDir, `${bioguide}.json`);
  writeFileSync(filePath, JSON.stringify({ id: bioguide, bioguide, name: `Rep. ${bioguide}`, ...extra }));
  return filePath;
}

// ── sha256 ─────────────────────────────────────────────────────────────────

describe('sha256', () => {
  it('returns a 64-char hex string', () => {
    const hash = sha256('hello');
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64);
    assert.match(hash, /^[0-9a-f]+$/);
  });

  it('is deterministic', () => {
    assert.equal(sha256('same content'), sha256('same content'));
  });

  it('produces different hashes for different inputs', () => {
    assert.notEqual(sha256('a'), sha256('b'));
  });

  it('accepts Buffer input', () => {
    const hash = sha256(Buffer.from('hello'));
    assert.equal(hash.length, 64);
  });

  it('matches string and Buffer with same content', () => {
    assert.equal(sha256('hello'), sha256(Buffer.from('hello')));
  });
});

// ── readJson ───────────────────────────────────────────────────────────────

describe('readJson', () => {
  let tmpDir: string;
  before(() => { tmpDir = makeTempDir(); });
  after(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('parses a valid JSON file', () => {
    const filePath = join(tmpDir, 'valid.json');
    writeFileSync(filePath, JSON.stringify({ key: 'value' }));
    const result = readJson<{ key: string }>(filePath);
    assert.deepEqual(result, { key: 'value' });
  });

  it('returns null for a non-existent file', () => {
    assert.equal(readJson(join(tmpDir, 'missing.json')), null);
  });

  it('returns null for malformed JSON', () => {
    const filePath = join(tmpDir, 'bad.json');
    writeFileSync(filePath, '{ not: valid json }');
    assert.equal(readJson(filePath), null);
  });
});

// ── getChangedAndDeleted ───────────────────────────────────────────────────

describe('getChangedAndDeleted', () => {
  it('marks all entries as changed when there is no previous manifest', () => {
    const current: DigestMap = { A: 'hash1', B: 'hash2' };
    const { changed, deleted } = getChangedAndDeleted(current, undefined);
    assert.deepEqual(changed.sort(), ['A', 'B']);
    assert.deepEqual(deleted, []);
  });

  it('returns empty arrays when nothing changed', () => {
    const current: DigestMap = { A: 'hash1', B: 'hash2' };
    const { changed, deleted } = getChangedAndDeleted(current, { A: 'hash1', B: 'hash2' });
    assert.deepEqual(changed, []);
    assert.deepEqual(deleted, []);
  });

  it('detects a changed hash', () => {
    const current: DigestMap = { A: 'new-hash', B: 'hash2' };
    const previous: DigestMap = { A: 'old-hash', B: 'hash2' };
    const { changed, deleted } = getChangedAndDeleted(current, previous);
    assert.deepEqual(changed, ['A']);
    assert.deepEqual(deleted, []);
  });

  it('detects a new entry (present in current, absent in previous)', () => {
    const current: DigestMap = { A: 'hash1', NEW: 'hash3' };
    const previous: DigestMap = { A: 'hash1' };
    const { changed, deleted } = getChangedAndDeleted(current, previous);
    assert.deepEqual(changed, ['NEW']);
    assert.deepEqual(deleted, []);
  });

  it('detects a deleted entry (absent in current, present in previous)', () => {
    const current: DigestMap = { A: 'hash1' };
    const previous: DigestMap = { A: 'hash1', GONE: 'hash2' };
    const { changed, deleted } = getChangedAndDeleted(current, previous);
    assert.deepEqual(changed, []);
    assert.deepEqual(deleted, ['GONE']);
  });

  it('handles simultaneous add, change, and delete', () => {
    const current: DigestMap = { A: 'changed', NEW: 'hash3' };
    const previous: DigestMap = { A: 'original', GONE: 'hash2' };
    const { changed, deleted } = getChangedAndDeleted(current, previous);
    assert.deepEqual(changed.sort(), ['A', 'NEW']);
    assert.deepEqual(deleted, ['GONE']);
  });

  it('returns empty arrays for two empty maps', () => {
    const { changed, deleted } = getChangedAndDeleted({}, {});
    assert.deepEqual(changed, []);
    assert.deepEqual(deleted, []);
  });
});

// ── mergeUnique ────────────────────────────────────────────────────────────

describe('mergeUnique', () => {
  it('merges two arrays and deduplicates', () => {
    const result = mergeUnique(['a', 'b'], ['b', 'c']);
    assert.deepEqual(result.sort(), ['a', 'b', 'c']);
  });

  it('handles empty arrays', () => {
    assert.deepEqual(mergeUnique([], []), []);
    assert.deepEqual(mergeUnique(['a'], []), ['a']);
  });

  it('handles more than two arrays', () => {
    const result = mergeUnique(['a'], ['b'], ['a', 'c']);
    assert.deepEqual(result.sort(), ['a', 'b', 'c']);
  });

  it('returns unique values from a single array with duplicates', () => {
    assert.deepEqual(mergeUnique(['x', 'x', 'y']).sort(), ['x', 'y']);
  });
});

// ── computeBillDigests ─────────────────────────────────────────────────────

describe('computeBillDigests', () => {
  let tmpDir: string;
  before(() => { tmpDir = makeTempDir(); });
  after(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('returns empty object when bills dir does not exist', () => {
    const emptyDir = makeTempDir();
    try {
      assert.deepEqual(computeBillDigests(emptyDir), {});
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('computes digest keyed by bill id from JSON', () => {
    writeBill(tmpDir, '119', 'hr', '1');
    const digests = computeBillDigests(tmpDir);
    assert.ok('119-HR-1' in digests);
    assert.equal(typeof digests['119-HR-1'], 'string');
    assert.equal(digests['119-HR-1'].length, 64);
  });

  it('uses constructed id when bill JSON has no id field', () => {
    const billDir = join(tmpDir, 'bills', '119', 'hjres');
    mkdirSync(billDir, { recursive: true });
    writeFileSync(join(billDir, '5.json'), JSON.stringify({ congress: 119, type: 'HJRES', number: 5 }));
    const digests = computeBillDigests(tmpDir);
    assert.ok('119-HJRES-5' in digests);
  });

  it('produces different digests for different file contents', () => {
    writeBill(tmpDir, '119', 'hr', '10', { title: 'Version 1' });
    const d1 = computeBillDigests(tmpDir)['119-HR-10'];
    writeFileSync(join(tmpDir, 'bills', '119', 'hr', '10.json'), JSON.stringify({ id: '119-HR-10', title: 'Version 2' }));
    const d2 = computeBillDigests(tmpDir)['119-HR-10'];
    assert.notEqual(d1, d2);
  });

  it('produces identical digests for unchanged file contents', () => {
    writeBill(tmpDir, '119', 'hr', '20');
    const d1 = computeBillDigests(tmpDir)['119-HR-20'];
    const d2 = computeBillDigests(tmpDir)['119-HR-20'];
    assert.equal(d1, d2);
  });

  it('skips non-json files in bill directories', () => {
    const billDir = join(tmpDir, 'bills', '119', 'hr');
    mkdirSync(billDir, { recursive: true });
    writeFileSync(join(billDir, 'notes.txt'), 'not json');
    const digests = computeBillDigests(tmpDir);
    assert.ok(!('119-HR-notes' in digests));
  });
});

// ── computeLegislatorDigests ───────────────────────────────────────────────

describe('computeLegislatorDigests', () => {
  let tmpDir: string;
  before(() => { tmpDir = makeTempDir(); });
  after(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('returns empty object when legislators dir does not exist', () => {
    const emptyDir = makeTempDir();
    try {
      assert.deepEqual(computeLegislatorDigests(emptyDir), {});
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('computes digest keyed by bioguide', () => {
    writeLegislator(tmpDir, 'A000001');
    const digests = computeLegislatorDigests(tmpDir);
    assert.ok('A000001' in digests);
    assert.equal(digests['A000001'].length, 64);
  });

  it('falls back to filename (no extension) when no bioguide or id field', () => {
    const legDir = join(tmpDir, 'legislators');
    mkdirSync(legDir, { recursive: true });
    writeFileSync(join(legDir, 'Z999999.json'), JSON.stringify({ name: 'No ID field' }));
    const digests = computeLegislatorDigests(tmpDir);
    assert.ok('Z999999' in digests);
  });

  it('produces different digests for different file contents', () => {
    writeLegislator(tmpDir, 'B000001', { party: 'A' });
    const d1 = computeLegislatorDigests(tmpDir)['B000001'];
    writeFileSync(join(tmpDir, 'legislators', 'B000001.json'), JSON.stringify({ id: 'B000001', bioguide: 'B000001', party: 'B' }));
    const d2 = computeLegislatorDigests(tmpDir)['B000001'];
    assert.notEqual(d1, d2);
  });
});

// ── cascadeFromChangedBills ────────────────────────────────────────────────

describe('cascadeFromChangedBills', () => {
  let tmpDir: string;

  before(() => {
    tmpDir = makeTempDir();
    // Write a bill with two recorded votes, each with two legislators
    const billContent = {
      id: '119-HR-1',
      actions: {
        actions: [
          {
            recordedVotes: [
              {
                id: '119-HR-1-1',
                votes: { A000001: 'Yea', A000002: 'Nay' },
              },
              {
                id: '119-HR-1-2',
                votes: { A000001: 'Yea', A000003: 'Not Voting' },
              },
            ],
          },
        ],
      },
    };
    writeBill(tmpDir, '119', 'hr', '1', billContent);
  });

  after(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('returns empty results when no bills changed or deleted', () => {
    const result = cascadeFromChangedBills([], [], tmpDir);
    assert.deepEqual(result.changedRecordedVotes, []);
    assert.deepEqual(result.changedLegislatorVotes, []);
    assert.deepEqual(result.cascadedLegislators, []);
    assert.deepEqual(result.deletedRecordedVotes, []);
  });

  it('extracts recorded vote IDs from changed bill file', () => {
    const result = cascadeFromChangedBills(['119-HR-1'], [], tmpDir);
    assert.deepEqual(result.changedRecordedVotes.sort(), ['119-HR-1-1', '119-HR-1-2']);
  });

  it('extracts legislator vote IDs from changed bill file', () => {
    const result = cascadeFromChangedBills(['119-HR-1'], [], tmpDir);
    const expected = [
      'A000001-119-HR-1-1',
      'A000002-119-HR-1-1',
      'A000001-119-HR-1-2',
      'A000003-119-HR-1-2',
    ].sort();
    assert.deepEqual(result.changedLegislatorVotes.sort(), expected);
  });

  it('extracts unique cascaded legislator IDs', () => {
    const result = cascadeFromChangedBills(['119-HR-1'], [], tmpDir);
    // A000001 appears in both votes but should only appear once
    assert.deepEqual(result.cascadedLegislators.sort(), ['A000001', 'A000002', 'A000003']);
  });

  it('flags deleted bill IDs with wildcard suffix in deletedRecordedVotes', () => {
    const result = cascadeFromChangedBills([], ['119-HR-99'], tmpDir);
    assert.deepEqual(result.deletedRecordedVotes, ['119-HR-99-*']);
  });

  it('returns empty results for a bill ID that has no matching file', () => {
    const result = cascadeFromChangedBills(['119-HR-999'], [], tmpDir);
    assert.deepEqual(result.changedRecordedVotes, []);
    assert.deepEqual(result.changedLegislatorVotes, []);
    assert.deepEqual(result.cascadedLegislators, []);
  });

  it('handles bill with no recorded votes', () => {
    writeBill(tmpDir, '119', 'hr', '2', { actions: { actions: [{ text: 'some action' }] } });
    const result = cascadeFromChangedBills(['119-HR-2'], [], tmpDir);
    assert.deepEqual(result.changedRecordedVotes, []);
    assert.deepEqual(result.changedLegislatorVotes, []);
  });
});

// ── main (integration) ─────────────────────────────────────────────────────

describe('main', () => {
  let root: string;
  let srcDataDir: string;
  let distCacheDir: string;

  beforeEach(() => {
    root = makeTempDir();
    srcDataDir = join(root, 'src', 'data');
    distCacheDir = join(root, 'dist-cache');
    mkdirSync(join(root, 'src', 'data'), { recursive: true });
    mkdirSync(distCacheDir, { recursive: true });
  });

  after(() => {
    // individual dirs cleaned up in afterEach-like pattern via separate roots
  });

  it('FORCE_FULL_REBUILD removes existing build manifest and returns early', () => {
    const buildManifestPath = join(root, 'src', 'data', '.build-manifest.json');
    writeFileSync(buildManifestPath, '{"changedIds":{}}');
    main({ root, srcDataDir, distCacheDir, forceFullRebuild: true });
    assert.equal(existsSync(buildManifestPath), false);
  });

  it('writes .current-digests.json with bill and legislator hashes', () => {
    writeBill(srcDataDir, '119', 'hr', '1');
    writeLegislator(srcDataDir, 'A000001');
    main({ root, srcDataDir, distCacheDir });
    const currentDigests = readJson<SourceDigestManifest>(join(root, '.current-digests.json'));
    assert.ok(currentDigests !== null);
    assert.ok('119-HR-1' in currentDigests!.bills);
    assert.ok('A000001' in currentDigests!.legislators);
  });

  it('does not write build manifest when no previous dist-cache manifest exists', () => {
    writeBill(srcDataDir, '119', 'hr', '1');
    main({ root, srcDataDir, distCacheDir });
    assert.equal(existsSync(join(root, 'src', 'data', '.build-manifest.json')), false);
  });

  it('writes build manifest with all-empty changedIds when nothing changed', () => {
    writeBill(srcDataDir, '119', 'hr', '1');
    writeLegislator(srcDataDir, 'A000001');
    main({ root, srcDataDir, distCacheDir });
    // Simulate post-build: copy .current-digests.json → dist-cache/.astro-manifest.json
    const currentDigests = readFileSync(join(root, '.current-digests.json'), 'utf8');
    writeFileSync(join(distCacheDir, '.astro-manifest.json'), currentDigests);
    // Second run — nothing changed
    main({ root, srcDataDir, distCacheDir });
    const manifest = readJson<BuildManifest>(join(root, 'src', 'data', '.build-manifest.json'));
    assert.ok(manifest !== null);
    assert.deepEqual(manifest!.changedIds['bills-loader'], []);
    assert.deepEqual(manifest!.changedIds['legislators-loader'], []);
  });

  it('detects a changed bill and cascades to derived collections', () => {
    const billContent = {
      actions: {
        actions: [{
          recordedVotes: [{
            id: '119-HR-1-1',
            votes: { A000001: 'Yea' },
          }],
        }],
      },
    };
    writeBill(srcDataDir, '119', 'hr', '1', billContent);
    main({ root, srcDataDir, distCacheDir });
    const current = readFileSync(join(root, '.current-digests.json'), 'utf8');
    writeFileSync(join(distCacheDir, '.astro-manifest.json'), current);

    // Modify the bill
    writeFileSync(
      join(srcDataDir, 'bills', '119', 'hr', '1.json'),
      JSON.stringify({ id: '119-HR-1', title: 'Modified Title', ...billContent }),
    );
    main({ root, srcDataDir, distCacheDir });

    const manifest = readJson<BuildManifest>(join(root, 'src', 'data', '.build-manifest.json'));
    assert.ok(manifest !== null);
    assert.deepEqual(manifest!.changedIds['bills-loader'], ['119-HR-1']);
    assert.deepEqual(manifest!.changedIds['recorded-votes-loader'], ['119-HR-1-1']);
    assert.deepEqual(manifest!.changedIds['legislator-votes-loader'], ['A000001-119-HR-1-1']);
    assert.ok(manifest!.changedIds['legislators-loader'].includes('A000001'));
  });

  it('detects a deleted bill', () => {
    writeBill(srcDataDir, '119', 'hr', '1');
    main({ root, srcDataDir, distCacheDir });
    const current = readFileSync(join(root, '.current-digests.json'), 'utf8');
    writeFileSync(join(distCacheDir, '.astro-manifest.json'), current);

    // Delete the bill file
    rmSync(join(srcDataDir, 'bills', '119', 'hr', '1.json'));
    main({ root, srcDataDir, distCacheDir });

    const manifest = readJson<BuildManifest>(join(root, 'src', 'data', '.build-manifest.json'));
    assert.ok(manifest !== null);
    assert.deepEqual(manifest!.deletedIds['bills-loader'], ['119-HR-1']);
  });

  it('detects a changed legislator file', () => {
    writeLegislator(srcDataDir, 'A000001');
    main({ root, srcDataDir, distCacheDir });
    const current = readFileSync(join(root, '.current-digests.json'), 'utf8');
    writeFileSync(join(distCacheDir, '.astro-manifest.json'), current);

    // Modify the legislator
    writeFileSync(join(srcDataDir, 'legislators', 'A000001.json'), JSON.stringify({ id: 'A000001', bioguide: 'A000001', party: 'Changed' }));
    main({ root, srcDataDir, distCacheDir });

    const manifest = readJson<BuildManifest>(join(root, 'src', 'data', '.build-manifest.json'));
    assert.ok(manifest !== null);
    assert.deepEqual(manifest!.changedIds['legislators-loader'], ['A000001']);
  });
});
