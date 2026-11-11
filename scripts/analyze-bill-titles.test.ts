/** The bill-title analysis: which title is taken, what is counted, what is written. */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  EMPTY_REPORT,
  analyzeBillTitles,
  collectAllTitles,
  countPhrase,
  getEffectiveTitleFromApiOnly,
  getPrefix,
  lengthBucket,
  loadAcronyms,
  renderReport,
  runAnalysis,
} from './analyze-bill-titles.js';
import { makeDataDir } from './fixtures/dataDir.js';

describe('getEffectiveTitleFromApiOnly', () => {
  it('prefers a popular title over everything else', () => {
    assert.equal(getEffectiveTitleFromApiOnly({
      title: 'A bill to do a thing.',
      titles: { titles: [
        { title: 'Thing Act', titleType: 'Short Title(s) as Introduced' },
        { title: ' The Thing Bill ', titleType: 'Popular Titles' },
      ] },
    }), 'The Thing Bill');
  });

  it('takes the newest short title when there is no popular one', () => {
    assert.equal(getEffectiveTitleFromApiOnly({
      title: 'A bill to do a thing.',
      titles: { titles: [
        { title: 'Thing Act of 2025', titleType: 'Short Title(s) as Introduced', updateDate: '2025-01-01' },
        { title: 'Thing Act of 2026', titleType: 'Short Title(s) as Passed House', updateDate: '2026-02-01' },
        { title: 'Undated Thing Act', titleType: 'Short Title(s) as Reported' },
      ] },
    }), 'Thing Act of 2026');
  });

  it('falls back to the official title, and never returns nothing', () => {
    assert.equal(getEffectiveTitleFromApiOnly({ title: ' A bill to do a thing. ' }), 'A bill to do a thing.');
    assert.equal(getEffectiveTitleFromApiOnly({ title: 'Official', titles: { titles: [{ title: '  ', titleType: 'Popular Titles' }] } }), 'Official');
    assert.equal(getEffectiveTitleFromApiOnly({ title: 'Official', titles: { titles: [{ title: '', titleType: 'Short Title(s)' }] } }), 'Official');
    assert.equal(getEffectiveTitleFromApiOnly({}), 'Untitled Bill');
  });
});

describe('getPrefix', () => {
  it('names the boilerplate a title opens with', () => {
    assert.equal(getPrefix('To amend title 5, United States Code'), 'To amend');
    assert.equal(getPrefix('  Making appropriations for the fiscal year'), 'Making appropriations');
  });

  it('otherwise takes the first four words, cut at forty characters', () => {
    assert.equal(getPrefix('Midnight Rules Relief Act of 2025'), 'Midnight Rules Relief Act');
    assert.equal(getPrefix('Supercalifragilistic Extraordinarily Unreasonably Long'), 'Supercalifragilistic Extraordinarily Unr…');
    assert.equal(getPrefix('   '), '(empty)');
  });
});

describe('countPhrase', () => {
  it('counts every occurrence, whatever the case', () => {
    assert.equal(countPhrase('For other purposes, and for other purposes.', 'for other purposes'), 2);
    assert.equal(countPhrase('Nothing here', 'for other purposes'), 0);
  });
});

describe('lengthBucket', () => {
  it('puts each boundary in the lower bucket', () => {
    assert.deepEqual([1, 50, 51, 100, 101, 150, 151, 200, 201].map(lengthBucket),
      ['1–50', '1–50', '51–100', '51–100', '101–150', '101–150', '151–200', '151–200', '200+']);
  });
});

describe('runAnalysis', () => {
  const analysis = runAnalysis([
    'To amend title 5, United States Code, and for other purposes',
    'To amend title 5, United States Code, and for other purposes',
    'Midnight Rules Relief Act',
  ]);

  it('counts titles and distinct titles', () => {
    assert.equal(analysis.total, 3);
    assert.equal(analysis.unique, 2);
  });

  it('groups by prefix, phrase and length', () => {
    assert.equal(analysis.byPrefix.get('To amend'), 2);
    assert.equal(analysis.byPrefix.get('Midnight Rules Relief Act'), 1);
    assert.equal(analysis.phraseCounts.get('United States Code'), 2);
    assert.equal(analysis.phraseCounts.get('relating to'), 0);
    assert.equal(analysis.lengthBuckets.get('51–100'), 2);
    assert.equal(analysis.lengthBuckets.get('1–50'), 1);
  });
});

describe('renderReport', () => {
  const report = renderReport(runAnalysis(['To amend title 5, United States Code', 'A | B Act']));

  it('summarises, then tables length, prefixes and the phrases that occurred', () => {
    assert.match(report, /\*\*Total titles:\*\* 2/);
    assert.match(report, /\| 1–50 \| 2 \|/);
    assert.match(report, /\| 200\+ \| 0 \|/);
    assert.match(report, /\| To amend \| 1 \|/);
    assert.match(report, /\| United States Code \| 1 \|/);
    assert.doesNotMatch(report, /\| relating to \|/);
  });

  it('escapes a pipe in a prefix so the table survives it', () => {
    assert.match(report, /\| A \\\| B Act \| 1 \|/);
  });

  it('names the data source as it is in this repo', () => {
    assert.match(report, /`src\/data\/bills`/);
    assert.doesNotMatch(report, /packages\/site/);
  });
});

describe('loadAcronyms', () => {
  it('reads the acronym list', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vfu-acr-')), 'acronyms.json');
    fs.writeFileSync(file, JSON.stringify({ acronyms: [{ acronym: 'EPA', name: 'Environmental Protection Agency' }] }));
    assert.deepEqual(loadAcronyms(file), [{ acronym: 'EPA', name: 'Environmental Protection Agency' }]);
  });

  it('is empty when the file is missing, malformed, or holds no list', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfu-acr-'));
    assert.deepEqual(loadAcronyms(path.join(dir, 'missing.json')), []);
    fs.writeFileSync(path.join(dir, 'bad.json'), '{not json');
    assert.deepEqual(loadAcronyms(path.join(dir, 'bad.json')), []);
    fs.writeFileSync(path.join(dir, 'other.json'), '{"acronyms":"EPA"}');
    assert.deepEqual(loadAcronyms(path.join(dir, 'other.json')), []);
  });
});

describe('collectAllTitles', () => {
  it('reads one cleaned title per bill file', () => {
    const { dataDir, cleanup } = makeDataDir();
    const titles = collectAllTitles(path.join(dataDir, 'bills'), []);
    assert.deepEqual(titles.sort(), ['Midnight Rules Relief Act', 'To require something.']);
    cleanup();
  });

  it('skips a file it cannot parse, and anything that is not a congress directory', () => {
    const { dataDir, cleanup } = makeDataDir();
    fs.writeFileSync(path.join(dataDir, 'bills', '999', 'hr', 'broken.json'), '{');
    fs.mkdirSync(path.join(dataDir, 'bills', 'drafts'));
    assert.equal(collectAllTitles(path.join(dataDir, 'bills'), []).length, 2);
    cleanup();
  });

  it('is empty when there is no bills directory', () => {
    assert.deepEqual(collectAllTitles(path.join(os.tmpdir(), 'vfu-no-such-dir'), []), []);
  });
});

describe('analyzeBillTitles', () => {
  it('writes the report into a directory it creates', () => {
    const { root, dataDir, cleanup } = makeDataDir();
    const reportPath = path.join(root, 'docs', 'bill-title-shortening.md');
    const result = analyzeBillTitles({ billsDir: path.join(dataDir, 'bills'), reportPath, acronyms: [] });
    assert.deepEqual(result, { titles: 2, reportPath, empty: false });
    assert.match(fs.readFileSync(reportPath, 'utf8'), /\*\*Total titles:\*\* 2/);
    cleanup();
  });

  it('writes a report that says there is no data, rather than an empty table', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfu-titles-'));
    const reportPath = path.join(root, 'docs', 'report.md');
    const result = analyzeBillTitles({ billsDir: path.join(root, 'nope'), reportPath });
    assert.equal(result.empty, true);
    assert.equal(fs.readFileSync(reportPath, 'utf8'), EMPTY_REPORT);
    fs.rmSync(root, { recursive: true });
  });
});
