/**
 * Build performance benchmarking script.
 *
 * Scenarios:
 *   cold   — deletes .astro/ and dist/ before building (full cold start)
 *   warm   — keeps .astro/ from a prior run (loader cache hit path)
 *
 * Usage:
 *   tsx scripts/benchmark.ts --scenario cold
 *   tsx scripts/benchmark.ts --scenario warm
 *   tsx scripts/benchmark.ts --report
 */

import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

type Scenario = 'cold' | 'warm';

interface BenchmarkMetrics {
  totalBuildMs: number;
  astroReportedBuildMs: number | null;
  pageCount: number;
  pagesPerSecond: number | null;
  loaderEntriesLoaded: number | null;
  loaderEntriesSkipped: number | null;
  pagesGenerated: number | null;
  pagesFromCache: number | null;
}

interface BenchmarkResult {
  scenario: Scenario;
  timestamp: string;
  gitSha: string;
  env: Record<string, string | undefined>;
  metrics: BenchmarkMetrics;
}

const ROOT = path.resolve(import.meta.dirname, '..');
const RESULTS_DIR = path.join(ROOT, 'benchmark-results');

function getGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function parseAstroReportedMs(stdout: string): number | null {
  const match = stdout.match(/\[build\]\s+Complete in\s+([\d.]+)(s|ms)/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  return match[2] === 'ms' ? Math.round(value) : Math.round(value * 1000);
}

function parseLoaderCounter(stdout: string, label: string): number | null {
  const re = new RegExp(`${label}[:\\s]+(\\d+)`, 'i');
  const match = stdout.match(re);
  return match ? parseInt(match[1], 10) : null;
}

function countHtmlFiles(distDir: string): number {
  if (!fs.existsSync(distDir)) return 0;
  try {
    const result = execSync(`find "${distDir}" -name "*.html" | wc -l`, { cwd: ROOT })
      .toString()
      .trim();
    return parseInt(result, 10) || 0;
  } catch {
    return 0;
  }
}

function deleteDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`Deleted ${path.relative(ROOT, dir)}/`);
  }
}

function runBenchmark(scenario: Scenario): BenchmarkResult {
  const astroDir = path.join(ROOT, '.astro');
  const distDir = path.join(ROOT, 'dist');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);

  if (scenario === 'cold') {
    deleteDir(astroDir);
    deleteDir(distDir);
  } else {
    // warm: keep .astro/ (loader cache), delete dist/ so page count is fresh
    deleteDir(distDir);
  }

  const capturedEnv = {
    BILLS_PER_TYPE_LIMIT: process.env.BILLS_PER_TYPE_LIMIT,
    LEGISLATORS_LIMIT: process.env.LEGISLATORS_LIMIT,
  };

  console.log(`\nRunning ${scenario} build benchmark...`);
  const start = Date.now();

  const result = spawnSync('npx', ['astro', 'build', '--silent'], {
    cwd: ROOT,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env },
    encoding: 'utf8',
  });

  const totalBuildMs = Date.now() - start;
  const combinedOutput = (result.stdout ?? '') + (result.stderr ?? '');

  if (result.status !== 0) {
    console.error('Build failed:');
    console.error(combinedOutput);
    process.exit(1);
  }

  const pageCount = countHtmlFiles(distDir);
  const astroReportedBuildMs = parseAstroReportedMs(combinedOutput);
  const pagesPerSecond = pageCount > 0 && totalBuildMs > 0
    ? Math.round((pageCount / totalBuildMs) * 1000)
    : null;

  const metrics: BenchmarkMetrics = {
    totalBuildMs,
    astroReportedBuildMs,
    pageCount,
    pagesPerSecond,
    loaderEntriesLoaded: parseLoaderCounter(combinedOutput, 'entries loaded'),
    loaderEntriesSkipped: parseLoaderCounter(combinedOutput, 'entries skipped'),
    pagesGenerated: parseLoaderCounter(combinedOutput, 'pages generated'),
    pagesFromCache: parseLoaderCounter(combinedOutput, 'pages from cache'),
  };

  const benchmarkResult: BenchmarkResult = {
    scenario,
    timestamp: new Date().toISOString(),
    gitSha: getGitSha(),
    env: capturedEnv,
    metrics,
  };

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const filename = path.join(RESULTS_DIR, `${timestamp}-${scenario}.json`);
  fs.writeFileSync(filename, JSON.stringify(benchmarkResult, null, 2));

  console.log(`\nBenchmark complete (${scenario}):`);
  console.log(`  Total build time: ${(totalBuildMs / 1000).toFixed(1)}s`);
  if (astroReportedBuildMs !== null) {
    console.log(`  Astro reported:   ${(astroReportedBuildMs / 1000).toFixed(1)}s`);
  }
  console.log(`  Pages generated:  ${pageCount}`);
  if (pagesPerSecond !== null) {
    console.log(`  Pages/second:     ${pagesPerSecond}`);
  }
  console.log(`  Results saved to: ${path.relative(ROOT, filename)}`);

  return benchmarkResult;
}

function printReport(): void {
  if (!fs.existsSync(RESULTS_DIR)) {
    console.log('No benchmark results found. Run benchmark:cold or benchmark:warm first.');
    return;
  }

  const files = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    console.log('No benchmark results found.');
    return;
  }

  const results: BenchmarkResult[] = files.map(f =>
    JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), 'utf8'))
  );

  const colWidth = 22;
  const header = ['Timestamp', 'Scenario', 'Total(s)', 'Astro(s)', 'Pages', 'pg/s', 'SHA']
    .map(h => h.padEnd(colWidth)).join(' | ');
  const separator = '-'.repeat(header.length);

  console.log('\nBenchmark Report');
  console.log(separator);
  console.log(header);
  console.log(separator);

  for (const r of results) {
    const row = [
      r.timestamp.slice(0, 19),
      r.scenario,
      (r.metrics.totalBuildMs / 1000).toFixed(1),
      r.metrics.astroReportedBuildMs != null
        ? (r.metrics.astroReportedBuildMs / 1000).toFixed(1)
        : 'n/a',
      String(r.metrics.pageCount),
      r.metrics.pagesPerSecond != null ? String(r.metrics.pagesPerSecond) : 'n/a',
      r.gitSha,
    ].map(v => v.padEnd(colWidth)).join(' | ');
    console.log(row);
  }
  console.log(separator);
}

const args = process.argv.slice(2);
const scenarioFlag = args.indexOf('--scenario');
const isReport = args.includes('--report');

if (isReport) {
  printReport();
} else if (scenarioFlag !== -1) {
  const scenario = args[scenarioFlag + 1] as Scenario;
  if (scenario !== 'cold' && scenario !== 'warm') {
    console.error('Invalid scenario. Use: cold or warm');
    process.exit(1);
  }
  runBenchmark(scenario);
} else {
  console.error('Usage: tsx scripts/benchmark.ts --scenario <cold|warm>');
  console.error('       tsx scripts/benchmark.ts --report');
  process.exit(1);
}
