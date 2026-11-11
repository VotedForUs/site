/**
 * @file generate-social-cards.ts
 * @description Draws the share-card PNGs: one per member per recorded vote on
 * the bills in `SHARE_SAMPLE_BILLS` (`src/shareConfig.ts`), plus the site's
 * default preview image.
 *
 * It starts Astro's dev server, opens `/social-card-capture?voteId=…` in a headless
 * browser — one page load per vote, not per cast — and for each member swaps
 * their cast onto the card and saves a 1200×630 screenshot to
 * `public/social-cards/{voteId}/{bioguideId}.png`. That directory is
 * git-ignored: the PR preview workflow draws the sample on every run, which
 * is also what makes its timing worth reading.
 *
 * Which casts are drawn comes from the stub script's own enumeration, so a
 * cast has an image exactly when it has a share stub.
 *
 * ```bash
 * npm run social-cards                         # every cast on the sample bills + the default
 * npm run social-cards -- 119-HR-4405          # every cast on one bill
 * npm run social-cards -- 119-HR-1-3/A000382   # one cast
 * npm run social-cards -- --default            # only the site default image
 * SOCIAL_CARDS_SERVER=http://localhost:4321 npm run social-cards   # use a dev server already running
 * SOCIAL_CARDS_WORKERS=8 npm run social-cards  # browser pages drawing at once (default: CPU count, 2–8)
 * ```
 *
 * Puppeteer finds Chrome through `PUPPETEER_EXECUTABLE_PATH` when its own
 * download is not installed.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { DEFAULT_CARD_PATH, SHARE_SAMPLE_BILLS, cardImagePath } from '../src/shareConfig.js';
import { billIdOfVote } from '../src/utils/voteLinks.js';
import { readBills, type RawBill } from './build-finder-index.js';
import { billIdOf, readStubMembers, stubsFor, type StubMember } from './build-share-stubs.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARD = { width: 1200, height: 630 } as const;
const PORT = 4320;
/** Content sync reads every bill and legislator file before the first request is served. */
const SERVER_READY_TIMEOUT_MS = 180_000;
/**
 * Casts drawn per page load. A House vote is 435 casts; splitting it lets
 * every worker draw from the same vote instead of one worker owning it.
 */
export const CASTS_PER_JOB = 60;

/** One cast: a member's position on a recorded vote. */
export type Cast = { voteId: string; bioguideId: string };

/** One page load's worth of work: a vote, and the members to draw from it. */
export type CardJob = { voteId: string; members: string[] };

/** What the command line asked for. */
export type CardRequest = {
  /** Bill ids to draw every cast of; empty means the sample. */
  bills: string[];
  /** Single casts to draw. */
  casts: Cast[];
  /** Draw the site default image. */
  includeDefault: boolean;
  /** Draw nothing but the site default image. */
  onlyDefault: boolean;
};

/** The outcome of a run. */
export type DrawReport = {
  drawn: number;
  failed: Array<{ label: string; reason: string }>;
  bytes: number;
  seconds: number;
};

/**
 * What a worker needs from a browser page. Puppeteer sits behind this so the
 * drawing loop can be tested against a page that draws nothing.
 */
export interface CaptureSurface {
  /** Load a capture URL. @returns the HTTP status */
  open(query: string): Promise<number>;
  /** Wait for fonts; report whether the card's face arrived and which failed. */
  fonts(): Promise<{ sans: boolean; failed: string[] }>;
  /** Put a member's cast on the card. @returns false when the page has no such cast */
  show(bioguideId: string): Promise<boolean>;
  /** Save what the page shows. @returns bytes written */
  shoot(file: string): Promise<number>;
  close(): Promise<void>;
}

/**
 * Read the command line: bill ids, `voteId/bioguideId` casts, `--default`.
 *
 * @param args - Arguments after the script name
 * @returns What to draw
 * @throws On an argument that is neither a bill id nor a cast
 */
export function parseCardArgs(args: string[]): CardRequest {
  const onlyDefault = args.includes('--default');
  const named = args.filter((a) => !a.startsWith('-'));
  const bills: string[] = [];
  const casts: Cast[] = [];
  for (const arg of named) {
    const cast = /^(\d+-[A-Z]+-\d+-\d+)\/([A-Za-z0-9]+)$/.exec(arg);
    if (cast) casts.push({ voteId: cast[1], bioguideId: cast[2] });
    else if (/^\d+-[A-Z]+-\d+$/.test(arg)) bills.push(arg);
    else throw new Error(`"${arg}" is neither a bill id (119-HR-4405) nor a cast (119-HR-1-3/A000382)`);
  }
  // Naming something specific means that and nothing else; no names means the sample and the default.
  return { bills, casts, onlyDefault, includeDefault: onlyDefault || named.length === 0 };
}

/**
 * Every cast on the given bills that has a legislator file — the same casts
 * the stub script writes a stub for.
 *
 * @param bills - Raw bill files
 * @param members - Member fields by bioguide id
 * @param billIds - Bills to take casts from
 * @returns Casts in data order
 */
export function castsOnBills(bills: RawBill[], members: Map<string, StubMember>, billIds: readonly string[]): Cast[] {
  const stubs = stubsFor(bills, members, { origin: 'https://x', hasImage: () => false, bills: new Set(billIds) });
  return [...stubs].map(({ voteId, bioguideId }) => ({ voteId, bioguideId }));
}

/**
 * Group casts into page loads: one vote per job, at most `size` members each.
 *
 * @param casts - Casts to draw
 * @param size - Most members per job
 * @returns Jobs, a vote's casts kept in order
 */
export function toJobs(casts: readonly Cast[], size = CASTS_PER_JOB): CardJob[] {
  const byVote = new Map<string, string[]>();
  for (const { voteId, bioguideId } of casts) {
    const members = byVote.get(voteId);
    if (members) {
      if (!members.includes(bioguideId)) members.push(bioguideId);
    } else {
      byVote.set(voteId, [bioguideId]);
    }
  }
  const jobs: CardJob[] = [];
  for (const [voteId, members] of byVote) {
    for (let i = 0; i < members.length; i += size) jobs.push({ voteId, members: members.slice(i, i + size) });
  }
  return jobs;
}

/** How many pages draw at once: the CPUs there are, between 2 and 8. */
export function workerCount(requested: string | undefined, cpus = os.availableParallelism()): number {
  const asked = Number(requested);
  if (Number.isInteger(asked) && asked > 0) return asked;
  return Math.min(8, Math.max(2, cpus));
}

/**
 * Draw every job, `workers` pages at a time.
 *
 * One failed cast does not stop the run — the report names each — but a page
 * that will not load, or loads without the card's typeface, fails every cast
 * in its job: a card in a fallback face is worse than no card.
 *
 * @param jobs - Page loads to work through
 * @param options.workers - Pages drawing at once
 * @param options.outDir - `public/`
 * @param options.newSurface - Opens a fresh page
 * @param options.onProgress - Called after each job with the running count
 * @returns What was drawn, what failed, and how long it took
 */
export async function drawJobs(
  jobs: readonly CardJob[],
  options: {
    workers: number;
    outDir: string;
    newSurface: () => Promise<CaptureSurface>;
    onProgress?: (drawn: number) => void;
  },
): Promise<DrawReport> {
  const started = Date.now();
  const report: DrawReport = { drawn: 0, failed: [], bytes: 0, seconds: 0 };
  const queue = [...jobs];
  const madeDirs = new Set<string>();

  const work = async () => {
    const surface = await options.newSurface();
    try {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const failJob = (reason: string) => {
          for (const member of job!.members) report.failed.push({ label: `${job!.voteId}/${member}`, reason });
        };
        try {
          const status = await surface.open(`voteId=${encodeURIComponent(job.voteId)}`);
          if (status !== 200) { failJob(`HTTP ${status}`); continue; }
          const fonts = await surface.fonts();
          if (!fonts.sans) { failJob('Public Sans did not load'); continue; }
          if (fonts.failed.length) { failJob(`fonts failed to load: ${fonts.failed.join(', ')}`); continue; }
        } catch (err) {
          failJob(reasonOf(err));
          continue;
        }
        for (const member of job.members) {
          try {
            if (!(await surface.show(member))) throw new Error('no such cast on this vote');
            const file = path.join(options.outDir, cardImagePath(job.voteId, member));
            const dir = path.dirname(file);
            if (!madeDirs.has(dir)) {
              fs.mkdirSync(dir, { recursive: true });
              madeDirs.add(dir);
            }
            report.bytes += await surface.shoot(file);
            report.drawn += 1;
          } catch (err) {
            report.failed.push({ label: `${job.voteId}/${member}`, reason: reasonOf(err) });
          }
        }
        options.onProgress?.(report.drawn);
      }
    } finally {
      await surface.close();
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.workers, jobs.length)) }, work));
  report.seconds = (Date.now() - started) / 1000;
  return report;
}

const reasonOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** `4h 46m`, `3m 05s`, `42s`. */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/**
 * The run in a few lines, with what the same rate means for the full set —
 * the number this sample exists to produce.
 *
 * @param report - What a run did
 * @param context.workers - Pages that drew at once
 * @param context.totalCasts - Every cast in the data
 * @returns Markdown, for the console and the workflow's step summary
 */
export function formatSummary(report: DrawReport, context: { workers: number; totalCasts: number }): string {
  const rate = report.seconds > 0 ? report.drawn / report.seconds : 0;
  const each = report.drawn > 0 ? report.bytes / report.drawn : 0;
  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  const lines = [
    '### Share card images',
    '',
    `- **Drawn:** ${report.drawn.toLocaleString('en-US')} in ${formatDuration(report.seconds)}` +
      ` — ${rate.toFixed(1)} a second on ${context.workers} pages`,
    `- **Size:** ${mb(report.bytes)}, ${(each / 1024).toFixed(0)} KB each`,
  ];
  if (rate > 0 && context.totalCasts > report.drawn) {
    lines.push(
      `- **At this rate, all ${context.totalCasts.toLocaleString('en-US')} casts:** ` +
        `${formatDuration(context.totalCasts / rate)} and ${(each * context.totalCasts / 1024 ** 3).toFixed(1)} GB`,
    );
  }
  if (report.failed.length) {
    lines.push(`- **Failed:** ${report.failed.length}`);
    for (const f of report.failed.slice(0, 10)) lines.push(`  - \`${f.label}\`: ${f.reason}`);
    if (report.failed.length > 10) lines.push(`  - …and ${report.failed.length - 10} more`);
  }
  return lines.join('\n');
}

/** A Puppeteer page, as the drawing loop sees it. */
export async function puppeteerSurface(browser: Browser, serverUrl: string): Promise<CaptureSurface> {
  const page: Page = await browser.newPage();
  await page.setViewport({ ...CARD, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  return {
    async open(query) {
      const response = await page.goto(`${serverUrl}/social-card-capture?${query}`, {
        waitUntil: 'networkidle0',
        timeout: 120_000,
      });
      return response?.status() ?? 0;
    },
    // `fonts.ready` resolves even when a face failed, so ask what actually arrived.
    fonts: () =>
      page.evaluate(async () => {
        await document.fonts.ready;
        const faces = [...document.fonts].map((f) => ({ family: f.family.replace(/["']/g, ''), status: f.status }));
        return {
          sans: faces.some((f) => f.family === 'Public Sans' && f.status === 'loaded'),
          failed: [...new Set(faces.filter((f) => f.status === 'error').map((f) => f.family))],
        };
      }),
    show: (bioguideId) => page.evaluate((id) => window.vfuShowCast?.(id) ?? Promise.resolve(false), bioguideId),
    async shoot(file) {
      const png = await page.screenshot({ path: file as `${string}.png`, clip: { x: 0, y: 0, ...CARD } });
      return png.byteLength;
    },
    close: () => page.close(),
  };
}

declare global {
  interface Window {
    vfuShowCast?: (bioguideId: string) => Promise<boolean>;
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until a URL answers 200, or time out. */
export async function waitForServer(url: string, timeoutMs: number, intervalMs = 1000): Promise<boolean> {
  const started = Date.now();
  for (;;) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      // not listening yet
    }
    if (Date.now() - started + intervalMs > timeoutMs) return false;
    await delay(intervalMs);
  }
}

/**
 * Start Astro's dev server in this process. Not `astro dev` in a child: the
 * CLI moves itself to the background in some environments, where a parent can
 * neither see when it is ready nor reliably stop it.
 *
 * @returns The server's URL and a function that stops it
 */
async function startDevServer(): Promise<{ url: string; stop: () => Promise<void> }> {
  const { dev } = await import('astro');
  const server = await dev({
    root: REPO_ROOT,
    // The capture route lives at the root whatever base the build will have.
    base: '/',
    server: { port: PORT },
    logLevel: 'error',
    // No file watching and no hot reload: a page that reloads itself halfway
    // through a vote loses the cast it was showing.
    vite: { server: { hmr: false, watch: null } },
  });
  return { url: `http://localhost:${server.address.port}`, stop: () => server.stop() };
}

/**
 * Draw the site's default image: the one page that is not a cast.
 *
 * @param surface - A page to draw with
 * @param outDir - `public/`
 * @returns Bytes written
 * @throws When the page or its fonts did not load
 */
export async function drawDefault(surface: CaptureSurface, outDir: string): Promise<number> {
  const status = await surface.open('default');
  if (status !== 200) throw new Error(`default image: HTTP ${status}`);
  const fonts = await surface.fonts();
  if (!fonts.sans || fonts.failed.length) throw new Error('default image: fonts did not load');
  return surface.shoot(path.join(outDir, DEFAULT_CARD_PATH));
}

/**
 * Turn a request into the casts to draw.
 *
 * Naming bills or casts draws those; naming nothing draws the sample. A bill
 * that yields no casts is an error, not zero work: it is a typo in the
 * command or in `SHARE_SAMPLE_BILLS`, and a build that silently drew nothing
 * for it would look like a pass.
 *
 * @param request - Output of {@link parseCardArgs}
 * @param bills - Raw bill files
 * @param members - Member fields by bioguide id
 * @param sampleBills - The bills drawn when the request names none
 * @returns Casts to draw, in data order
 * @throws When a wanted bill has no recorded votes in the data
 */
export function planCasts(
  request: CardRequest,
  bills: RawBill[],
  members: Map<string, StubMember>,
  sampleBills: readonly string[],
): Cast[] {
  if (request.onlyDefault) return [];
  const named = request.bills.length > 0 || request.casts.length > 0;
  const wanted = named ? request.bills : sampleBills;
  const onBills = castsOnBills(bills, members, wanted);
  const found = new Set(onBills.map((c) => billIdOfVote(c.voteId)));
  const missing = wanted.filter((id) => !found.has(id));
  if (missing.length) throw new Error(`no recorded votes found for: ${missing.join(', ')}`);
  return [...onBills, ...request.casts];
}

async function main(): Promise<void> {
  const request = parseCardArgs(process.argv.slice(2));
  const dataDir = path.join(REPO_ROOT, 'src', 'data');
  const outDir = path.join(REPO_ROOT, 'public');
  const bills = readBills(dataDir);
  const members = readStubMembers(dataDir);
  const casts = planCasts(request, bills, members, SHARE_SAMPLE_BILLS);
  const jobs = toJobs(casts);
  const workers = workerCount(process.env.SOCIAL_CARDS_WORKERS);

  const external = process.env.SOCIAL_CARDS_SERVER?.replace(/\/$/, '');
  if (!external) console.log('Starting the Astro dev server…');
  const server = external ? null : await startDevServer();
  const serverUrl = external ?? server!.url;
  let report: DrawReport = { drawn: 0, failed: [], bytes: 0, seconds: 0 };
  try {
    console.log(`Capturing from ${serverUrl}`);
    if (!(await waitForServer(`${serverUrl}/social-card-capture?default`, SERVER_READY_TIMEOUT_MS))) {
      throw new Error(`${serverUrl}/social-card-capture did not answer — is it an astro dev server?`);
    }
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
      if (request.includeDefault) {
        const surface = await puppeteerSurface(browser, serverUrl);
        try {
          await drawDefault(surface, outDir);
          console.log(`default image → public${DEFAULT_CARD_PATH}`);
        } finally {
          await surface.close();
        }
      }
      if (jobs.length) {
        const votes = new Set(casts.map((c) => c.voteId)).size;
        console.log(`Drawing ${casts.length.toLocaleString('en-US')} casts on ${votes} votes, ${workers} pages at a time…`);
        let lastLogged = 0;
        report = await drawJobs(jobs, {
          workers,
          outDir,
          newSurface: () => puppeteerSurface(browser, serverUrl),
          onProgress: (drawn) => {
            if (drawn - lastLogged >= 250) {
              lastLogged = drawn;
              console.log(`  ${drawn.toLocaleString('en-US')} / ${casts.length.toLocaleString('en-US')}`);
            }
          },
        });
      }
    } finally {
      await browser.close();
    }
  } finally {
    await server?.stop();
  }

  if (jobs.length) {
    const totalCasts = castsOnBills(bills, members, bills.map(billIdOf)).length;
    const summary = formatSummary(report, { workers, totalCasts });
    console.log(`\n${summary}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n\n`);
  }
  if (report.failed.length) process.exit(1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
