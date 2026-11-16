/** The build benchmark: what it reads out of a build, what it saves, what it prints. */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  USAGE,
  countHtmlFiles,
  deleteDir,
  formatReport,
  formatRun,
  parseAstroReportedMs,
  parseBenchmarkArgs,
  parseLoaderCounter,
  readResults,
  runBenchmark,
  toMetrics,
  type BenchmarkResult,
} from './benchmark.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vfu-bench-'));

const result = (over: Partial<BenchmarkResult> = {}): BenchmarkResult => ({
  scenario: 'cold',
  timestamp: '2026-11-09T12:00:00.000Z',
  gitSha: 'abc1234',
  env: {},
  metrics: {
    totalBuildMs: 221_000, astroReportedBuildMs: 219_500, pageCount: 2857, pagesPerSecond: 13,
    loaderEntriesLoaded: null, loaderEntriesSkipped: null, pagesGenerated: null, pagesFromCache: null,
  },
  ...over,
});

describe('parseAstroReportedMs', () => {
  it('reads seconds and milliseconds', () => {
    assert.equal(parseAstroReportedMs('12:00:01 [build] Complete in 3.5s'), 3500);
    assert.equal(parseAstroReportedMs('[build] Complete in 840ms'), 840);
  });

  it('is null when Astro printed no completion line', () => {
    assert.equal(parseAstroReportedMs('[build] 2857 page(s) built'), null);
  });
});

describe('parseLoaderCounter', () => {
  it('reads the number after a label, whatever the case or separator', () => {
    assert.equal(parseLoaderCounter('bills-loader: Entries loaded: 757', 'entries loaded'), 757);
    assert.equal(parseLoaderCounter('entries skipped 12', 'entries skipped'), 12);
    assert.equal(parseLoaderCounter('nothing here', 'entries loaded'), null);
  });
});

describe('countHtmlFiles', () => {
  it('counts .html files at every depth and nothing else', () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, 'bills', '119'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), '');
    fs.writeFileSync(path.join(dir, 'bills', '119', 'index.html'), '');
    fs.writeFileSync(path.join(dir, 'bills', 'data.json'), '');
    fs.mkdirSync(path.join(dir, 'looks-like.html'));
    assert.equal(countHtmlFiles(dir), 2);
    fs.rmSync(dir, { recursive: true });
  });

  it('is zero when the build wrote nothing', () => {
    assert.equal(countHtmlFiles(path.join(os.tmpdir(), 'vfu-no-such-dist')), 0);
  });
});

describe('deleteDir', () => {
  it('removes a directory and says whether there was one', () => {
    const dir = tmp();
    assert.equal(deleteDir(dir), true);
    assert.equal(fs.existsSync(dir), false);
    assert.equal(deleteDir(dir), false);
  });
});

describe('toMetrics', () => {
  it('derives pages a second from wall-clock time', () => {
    const metrics = toMetrics(4000, '[build] Complete in 3.9s\npages generated: 200\npages from cache: 5', 200);
    assert.equal(metrics.pagesPerSecond, 50);
    assert.equal(metrics.astroReportedBuildMs, 3900);
    assert.equal(metrics.pagesGenerated, 200);
    assert.equal(metrics.pagesFromCache, 5);
    assert.equal(metrics.loaderEntriesLoaded, null);
  });

  it('has no rate for a build that wrote no pages', () => {
    assert.equal(toMetrics(4000, '', 0).pagesPerSecond, null);
  });
});

describe('runBenchmark', () => {
  /** A project root with a stale build and a loader cache in it. */
  const project = () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, '.astro'));
    fs.writeFileSync(path.join(root, '.astro', 'data-store.json'), '{}');
    fs.mkdirSync(path.join(root, 'dist'));
    fs.writeFileSync(path.join(root, 'dist', 'stale.html'), '');
    return root;
  };
  /** A build that writes two pages. */
  const build = (root: string) => {
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', 'index.html'), '');
    fs.writeFileSync(path.join(root, 'dist', 'about.html'), '');
    return { status: 0, output: '[build] Complete in 1.5s' };
  };
  /** A clock that advances two seconds between its two readings. */
  const clock = () => {
    const times = [new Date('2026-11-09T12:00:00.000Z'), new Date('2026-11-09T12:00:02.000Z')];
    return () => times.shift() ?? new Date('2026-11-09T12:00:02.000Z');
  };

  it('cold: clears the loader cache and the old build first', () => {
    const root = project();
    let cacheAtBuild = true;
    const { result: r } = runBenchmark('cold', {
      root, now: clock(),
      build: (dir) => { cacheAtBuild = fs.existsSync(path.join(dir, '.astro')); return build(dir); },
    });
    assert.equal(cacheAtBuild, false);
    assert.equal(r.metrics.pageCount, 2); // the stale page is not counted
    fs.rmSync(root, { recursive: true });
  });

  it('warm: keeps the loader cache, still clears the old build', () => {
    const root = project();
    const { result: r } = runBenchmark('warm', { root, build, now: clock() });
    assert.ok(fs.existsSync(path.join(root, '.astro', 'data-store.json')));
    assert.equal(r.metrics.pageCount, 2);
    fs.rmSync(root, { recursive: true });
  });

  it('times the build and saves the result under benchmark-results/', () => {
    const root = project();
    const { result: r, file } = runBenchmark('cold', { root, build, now: clock() });
    assert.equal(r.metrics.totalBuildMs, 2000);
    assert.equal(r.metrics.pagesPerSecond, 1);
    assert.equal(r.timestamp, '2026-11-09T12:00:00.000Z');
    assert.equal(path.relative(root, file), path.join('benchmark-results', '2026-11-09T12-00-cold.json'));
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), JSON.parse(JSON.stringify(r)));
    // Not a git checkout: the sha is honestly unknown rather than a crash.
    assert.equal(r.gitSha, 'unknown');
    fs.rmSync(root, { recursive: true });
  });

  it('throws with the build output when the build fails, and saves nothing', () => {
    const root = project();
    assert.throws(
      () => runBenchmark('cold', { root, now: clock(), build: () => ({ status: 1, output: 'Cannot find module' }) }),
      /Build failed:\nCannot find module/,
    );
    assert.equal(fs.existsSync(path.join(root, 'benchmark-results')), false);
    fs.rmSync(root, { recursive: true });
  });
});

describe('formatRun', () => {
  it('prints the timings and where the result went', () => {
    const text = formatRun(result(), 'benchmark-results/x.json');
    assert.match(text, /Benchmark complete \(cold\):/);
    assert.match(text, /Total build time: 221\.0s/);
    assert.match(text, /Astro reported: {3}219\.5s/);
    assert.match(text, /Pages\/second: {5}13/);
    assert.match(text, /Results saved to: benchmark-results\/x\.json/);
  });

  it('leaves out what was not measured', () => {
    const text = formatRun(result({ metrics: { ...result().metrics, astroReportedBuildMs: null, pagesPerSecond: null } }), 'x');
    assert.doesNotMatch(text, /Astro reported|Pages\/second/);
  });
});

describe('readResults and formatReport', () => {
  it('reads every saved result, oldest first, ignoring other files', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, '2026-11-10T09-00-warm.json'), JSON.stringify(result({ scenario: 'warm' })));
    fs.writeFileSync(path.join(dir, '2026-11-09T12-00-cold.json'), JSON.stringify(result()));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a result');
    assert.deepEqual(readResults(dir).map(r => r.scenario), ['cold', 'warm']);
    fs.rmSync(dir, { recursive: true });
  });

  it('has no results when nothing has been run', () => {
    assert.deepEqual(readResults(path.join(os.tmpdir(), 'vfu-no-such-results')), []);
    assert.match(formatReport([]), /No benchmark results found/);
  });

  it('tables one row per result, with n/a where a metric is missing', () => {
    const report = formatReport([
      result(),
      result({ scenario: 'warm', metrics: { ...result().metrics, astroReportedBuildMs: null, pagesPerSecond: null } }),
    ]);
    const rows = report.split('\n').filter(line => line.includes(' | '));
    assert.equal(rows.length, 3); // header + two results
    assert.match(rows[0], /^Timestamp\s+\| Scenario/);
    assert.match(rows[1], /^2026-11-09T12:00:00\s+\| cold\s+\| 221\.0\s+\| 219\.5\s+\| 2857\s+\| 13\s+\| abc1234/);
    assert.match(rows[2], /\| warm\s+\| 221\.0\s+\| n\/a\s+\| 2857\s+\| n\/a/);
  });
});

describe('parseBenchmarkArgs', () => {
  it('reads a scenario or the report flag', () => {
    assert.deepEqual(parseBenchmarkArgs(['--scenario', 'cold']), { kind: 'run', scenario: 'cold' });
    assert.deepEqual(parseBenchmarkArgs(['--scenario', 'warm']), { kind: 'run', scenario: 'warm' });
    assert.deepEqual(parseBenchmarkArgs(['--report']), { kind: 'report' });
  });

  it('asks for usage on anything else, naming a bad scenario', () => {
    assert.deepEqual(parseBenchmarkArgs([]), { kind: 'usage' });
    assert.deepEqual(parseBenchmarkArgs(['--scenario', 'hot']), { kind: 'usage', error: 'Invalid scenario. Use: cold or warm' });
    assert.deepEqual(parseBenchmarkArgs(['--scenario']), { kind: 'usage', error: 'Invalid scenario. Use: cold or warm' });
    assert.match(USAGE, /--scenario <cold\|warm>/);
  });
});
