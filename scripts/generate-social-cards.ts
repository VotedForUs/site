/**
 * @file generate-social-cards.ts
 * @description Draws the share-card PNGs: one per cast in `SHARE_SAMPLE`
 * (`src/shareConfig.ts`) plus the site's default preview image.
 *
 * It starts `astro dev`, opens `/social-card-capture` for each cast in a
 * headless browser, and saves a 1200×630 screenshot to
 * `public/social-cards/{voteId}/{bioguideId}.png`. The results are committed:
 * CI and the deploy never run a browser.
 *
 * The sample is a handful of casts on purpose. While the card's design is
 * still moving, drawing all 360,000 would be hours of work thrown away on
 * every change; this takes seconds per card. The full set is a launch-time
 * job against wherever `SOCIAL_CARDS_BASE` points.
 *
 * ```bash
 * npm run social-cards                                   # the sample + the default
 * npm run social-cards -- 119-HR-1-3/A000382             # only the casts named
 * SOCIAL_CARDS_SERVER=http://localhost:4321 npm run social-cards   # use a dev server already running
 * ```
 *
 * Puppeteer finds Chrome through `PUPPETEER_EXECUTABLE_PATH` when its own
 * download is not installed.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser } from 'puppeteer';
import { DEFAULT_CARD_PATH, SHARE_SAMPLE, cardImagePath } from '../src/shareConfig.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');
const CARD = { width: 1200, height: 630 } as const;
const PORT = 4320;
/** Content sync reads every bill and legislator file before the first request is served. */
const SERVER_READY_TIMEOUT_MS = 180_000;

/** One image to draw: where to capture it from and where to save it. */
export type CardJob = { label: string; query: string; file: string };

/**
 * The capture jobs for a list of casts, plus the default image.
 *
 * @param casts - Casts to draw
 * @param includeDefault - Whether to also draw the site's default image
 * @returns Jobs with paths relative to `public/`
 */
export function cardJobs(
  casts: ReadonlyArray<{ voteId: string; bioguideId: string }>,
  includeDefault: boolean,
): CardJob[] {
  const jobs: CardJob[] = casts.map(({ voteId, bioguideId }) => ({
    label: `${voteId}/${bioguideId}`,
    query: `voteId=${encodeURIComponent(voteId)}&bioguideId=${encodeURIComponent(bioguideId)}`,
    file: cardImagePath(voteId, bioguideId),
  }));
  if (includeDefault) jobs.push({ label: 'default', query: 'default', file: DEFAULT_CARD_PATH });
  return jobs;
}

/**
 * Read `voteId/bioguideId` arguments. None means the whole sample.
 *
 * @param args - Command-line arguments after the script name
 * @returns The casts named, or null for the sample
 */
export function parseCastArgs(args: string[]): Array<{ voteId: string; bioguideId: string }> | null {
  const named = args.filter((a) => !a.startsWith('-'));
  if (!named.length) return null;
  return named.map((arg) => {
    const match = /^(\d+-[A-Z]+-\d+-\d+)\/([A-Za-z0-9]+)$/.exec(arg);
    if (!match) throw new Error(`"${arg}" is not voteId/bioguideId, e.g. 119-HR-1-3/A000382`);
    return { voteId: match[1], bioguideId: match[2] };
  });
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      // not listening yet
    }
    await delay(1000);
  }
  return false;
}

function startDevServer(): ChildProcess {
  return spawn('npx', ['astro', 'dev', '--port', String(PORT)], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
    detached: true,
  });
}

function stopDevServer(server: ChildProcess): void {
  if (!server.pid) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill('SIGTERM');
  }
}

/**
 * Screenshot one card. Throws unless the page answered 200 and the card on it
 * is exactly the card size — a 404 page or a half-loaded card is not an image
 * worth saving.
 */
async function capture(browser: Browser, serverUrl: string, job: CardJob): Promise<void> {
  const page = await browser.newPage();
  try {
    await page.setViewport({ ...CARD, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    const response = await page.goto(`${serverUrl}/social-card-capture?${job.query}`, {
      waitUntil: 'networkidle0',
      timeout: 120_000,
    });
    if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? 'no response'}`);

    // Fonts and the portrait decide the layout; wait for both rather than a fixed delay.
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images]
          .filter((img) => !img.hidden && img.getAttribute('src'))
          .map((img) => img.decode().catch(() => { throw new Error(`image failed: ${img.src}`); })),
      );
    });
    // `fonts.ready` resolves even when a face failed, so ask what actually arrived.
    const fonts = await page.evaluate(() => {
      const faces = [...document.fonts].map((f) => ({ family: f.family.replace(/["']/g, ''), status: f.status }));
      return {
        sans: faces.some((f) => f.family === 'Public Sans' && f.status === 'loaded'),
        failed: faces.filter((f) => f.status === 'error').map((f) => f.family),
      };
    });
    if (!fonts.sans) throw new Error('Public Sans did not load — the card would be drawn in a fallback face');
    if (fonts.failed.length) throw new Error(`fonts failed to load: ${[...new Set(fonts.failed)].join(', ')}`);

    const out = path.join(PUBLIC_DIR, job.file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out as `${string}.png`, clip: { x: 0, y: 0, ...CARD } });
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  const named = parseCastArgs(process.argv.slice(2));
  const jobs = cardJobs(named ?? SHARE_SAMPLE, named === null);

  const external = process.env.SOCIAL_CARDS_SERVER?.replace(/\/$/, '');
  const serverUrl = external ?? `http://localhost:${PORT}`;
  const server = external ? null : startDevServer();
  let failed = 0;
  try {
    console.log(external ? `Using ${serverUrl}` : `Starting astro dev on :${PORT}…`);
    if (!(await waitForServer(`${serverUrl}/social-card-capture?default`, SERVER_READY_TIMEOUT_MS))) {
      throw new Error(`${serverUrl}/social-card-capture did not answer — is it an astro dev server?`);
    }
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
      for (const job of jobs) {
        try {
          await capture(browser, serverUrl, job);
          console.log(`  ✓ ${job.label} → public${job.file}`);
        } catch (err) {
          failed += 1;
          console.error(`  ✗ ${job.label}: ${err instanceof Error ? err.message : err}`);
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    if (server) stopDevServer(server);
  }
  console.log(`social cards: ${jobs.length - failed} drawn, ${failed} failed`);
  if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
