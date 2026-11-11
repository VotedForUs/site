/**
 * Build performance benchmarking.
 *
 * Scenarios:
 *   cold   — deletes .astro/ and dist/ before building (full cold start)
 *   warm   — keeps .astro/ from a prior run (loader cache hit path)
 *
 * ```bash
 * npm run benchmark:cold
 * npm run benchmark:warm
 * npm run benchmark:report
 * ```
 */

import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type Scenario = 'cold' | 'warm';

export interface BenchmarkMetrics {
  totalBuildMs: number;
  astroReportedBuildMs: number | null;
  pageCount: number;
  pagesPerSecond: number | null;
  loaderEntriesLoaded: number | null;
  loaderEntriesSkipped: number | null;
  pagesGenerated: number | null;
  pagesFromCache: number | null;
}

export interface BenchmarkResult {
  scenario: Scenario;
  timestamp: string;
  gitSha: string;
  env: Record<string, string | undefined>;
  metrics: BenchmarkMetrics;
}

/** What a build run hands back: its exit status and everything it printed. */
export type BuildRun = { status: number | null; output: string };

/** What the command line asked for. */
export type BenchmarkCommand =
  | { kind: 'report' }
  | { kind: 'run'; scenario: Scenario }
  | { kind: 'usage'; error?: string };

const ROOT = path.resolve(import.meta.dirname, '..');

function getGitSha(root: string): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

/**
 * The build time Astro itself reported, in milliseconds.
 *
 * @param stdout - Build output
 * @returns Milliseconds, or null when Astro printed no completion line
 */
export function parseAstroReportedMs(stdout: string): number | null {
  const match = stdout.match(/\[build\]\s+Complete in\s+([\d.]+)(s|ms)/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  return match[2] === 'ms' ? Math.round(value) : Math.round(value * 1000);
}

/**
 * A counter a loader printed, e.g. `entries loaded: 757`.
 *
 * @param stdout - Build output
 * @param label - The counter's label
 * @returns The number after the label, or null when it is not there
 */
export function parseLoaderCounter(stdout: string, label: string): number | null {
  const re = new RegExp(`${label}[:\\s]+(\\d+)`, 'i');
  const match = stdout.match(re);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * How many `.html` files a build wrote.
 *
 * @param distDir - Build output directory
 * @returns The count; 0 when the directory does not exist
 */
export function countHtmlFiles(distDir: string): number {
  if (!fs.existsSync(distDir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(distDir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.html')) count += 1;
  }
  return count;
}

/** Remove a directory if it is there. @returns whether it was */
export function deleteDir(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

/**
 * Metrics for one finished build.
 *
 * @param totalBuildMs - Wall-clock time of the build
 * @param output - Everything the build printed
 * @param pageCount - HTML files in the output directory
 * @returns The metrics a result file records
 */
export function toMetrics(totalBuildMs: number, output: string, pageCount: number): BenchmarkMetrics {
  return {
    totalBuildMs,
    astroReportedBuildMs: parseAstroReportedMs(output),
    pageCount,
    pagesPerSecond: pageCount > 0 && totalBuildMs > 0 ? Math.round((pageCount / totalBuildMs) * 1000) : null,
    loaderEntriesLoaded: parseLoaderCounter(output, 'entries loaded'),
    loaderEntriesSkipped: parseLoaderCounter(output, 'entries skipped'),
    pagesGenerated: parseLoaderCounter(output, 'pages generated'),
    pagesFromCache: parseLoaderCounter(output, 'pages from cache'),
  };
}

/** Run `astro build` in `root` and capture what it prints. */
function astroBuild(root: string): BuildRun {
  const result = spawnSync('npx', ['astro', 'build', '--silent'], {
    cwd: root,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env },
    encoding: 'utf8',
  });
  return { status: result.status, output: (result.stdout ?? '') + (result.stderr ?? '') };
}

/**
 * Time one build and save the result under `benchmark-results/`.
 *
 * @param scenario - `cold` clears the loader cache first; `warm` keeps it
 * @param options.root - Project root
 * @param options.build - Runs the build; `astro build` unless a test supplies its own
 * @param options.now - Clock, for the result's timestamp and timing
 * @returns The result and the file it was saved to
 * @throws When the build exits non-zero
 */
export function runBenchmark(
  scenario: Scenario,
  options: { root?: string; build?: (root: string) => BuildRun; now?: () => Date } = {},
): { result: BenchmarkResult; file: string } {
  const root = options.root ?? ROOT;
  const now = options.now ?? (() => new Date());
  const astroDir = path.join(root, '.astro');
  const distDir = path.join(root, 'dist');

  // cold: no loader cache. warm: keep .astro/, but always clear dist/ so the page count is this build's.
  if (scenario === 'cold') deleteDir(astroDir);
  deleteDir(distDir);

  const started = now();
  const run = (options.build ?? astroBuild)(root);
  const totalBuildMs = now().getTime() - started.getTime();
  if (run.status !== 0) throw new Error(`Build failed:\n${run.output}`);

  const result: BenchmarkResult = {
    scenario,
    timestamp: started.toISOString(),
    gitSha: getGitSha(root),
    env: {
      BILLS_PER_TYPE_LIMIT: process.env.BILLS_PER_TYPE_LIMIT,
      LEGISLATORS_LIMIT: process.env.LEGISLATORS_LIMIT,
    },
    metrics: toMetrics(totalBuildMs, run.output, countHtmlFiles(distDir)),
  };

  const resultsDir = path.join(root, 'benchmark-results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const stamp = started.toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const file = path.join(resultsDir, `${stamp}-${scenario}.json`);
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  return { result, file };
}

/** The lines printed after a run. */
export function formatRun(result: BenchmarkResult, file: string): string {
  const { metrics } = result;
  const lines = [
    `Benchmark complete (${result.scenario}):`,
    `  Total build time: ${(metrics.totalBuildMs / 1000).toFixed(1)}s`,
  ];
  if (metrics.astroReportedBuildMs !== null) {
    lines.push(`  Astro reported:   ${(metrics.astroReportedBuildMs / 1000).toFixed(1)}s`);
  }
  lines.push(`  Pages generated:  ${metrics.pageCount}`);
  if (metrics.pagesPerSecond !== null) lines.push(`  Pages/second:     ${metrics.pagesPerSecond}`);
  lines.push(`  Results saved to: ${file}`);
  return lines.join('\n');
}

/**
 * Every saved result, oldest first.
 *
 * @param resultsDir - `benchmark-results/`
 * @returns Parsed result files; empty when the directory is missing
 */
export function readResults(resultsDir: string): BenchmarkResult[] {
  if (!fs.existsSync(resultsDir)) return [];
  return fs.readdirSync(resultsDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8')) as BenchmarkResult);
}

/**
 * The comparison table across saved results.
 *
 * @param results - Output of {@link readResults}
 * @returns The table, or a line saying there is nothing to report
 */
export function formatReport(results: BenchmarkResult[]): string {
  if (results.length === 0) return 'No benchmark results found. Run benchmark:cold or benchmark:warm first.';

  const colWidth = 22;
  const row = (cells: string[]) => cells.map(c => c.padEnd(colWidth)).join(' | ');
  const header = row(['Timestamp', 'Scenario', 'Total(s)', 'Astro(s)', 'Pages', 'pg/s', 'SHA']);
  const separator = '-'.repeat(header.length);

  const body = results.map(r => row([
    r.timestamp.slice(0, 19),
    r.scenario,
    (r.metrics.totalBuildMs / 1000).toFixed(1),
    r.metrics.astroReportedBuildMs != null ? (r.metrics.astroReportedBuildMs / 1000).toFixed(1) : 'n/a',
    String(r.metrics.pageCount),
    r.metrics.pagesPerSecond != null ? String(r.metrics.pagesPerSecond) : 'n/a',
    r.gitSha,
  ]));
  return ['', 'Benchmark Report', separator, header, separator, ...body, separator].join('\n');
}

/**
 * Read the command line.
 *
 * @param args - Arguments after the script name
 * @returns What to do; `usage` when the arguments name neither a run nor the report
 */
export function parseBenchmarkArgs(args: string[]): BenchmarkCommand {
  if (args.includes('--report')) return { kind: 'report' };
  const flag = args.indexOf('--scenario');
  if (flag === -1) return { kind: 'usage' };
  const scenario = args[flag + 1];
  if (scenario !== 'cold' && scenario !== 'warm') return { kind: 'usage', error: 'Invalid scenario. Use: cold or warm' };
  return { kind: 'run', scenario };
}

export const USAGE = [
  'Usage: tsx scripts/benchmark.ts --scenario <cold|warm>',
  '       tsx scripts/benchmark.ts --report',
].join('\n');

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const command = parseBenchmarkArgs(process.argv.slice(2));
  if (command.kind === 'report') {
    console.log(formatReport(readResults(path.join(ROOT, 'benchmark-results'))));
  } else if (command.kind === 'run') {
    console.log(`\nRunning ${command.scenario} build benchmark...`);
    try {
      const { result, file } = runBenchmark(command.scenario);
      console.log(`\n${formatRun(result, path.relative(ROOT, file))}`);
    } catch (err: unknown) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  } else {
    if (command.error) console.error(command.error);
    console.error(USAGE);
    process.exit(1);
  }
}
