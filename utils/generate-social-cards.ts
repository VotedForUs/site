import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import puppeteer from 'puppeteer';

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

const OUTPUT_DIR = 'public/social-cards/v';
const PORT = 4320;
const BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOT_DELAY = 1000;
const SERVER_READY_TIMEOUT = 30000;

/** Only generate cards for these (voteId, bioguideId) pairs. Plan: h1-1 and hr-4405 → 119-HR-1-1 and 119-HR-4405-1. Order: do faster card first to warm server. */
const ALLOWLIST: Array<{ voteId: string; bioguideId: string }> = [
  { voteId: '119-HR-4405-5', bioguideId: 'A000055' },
  { voteId: '119-HR-1-5', bioguideId: 'O000172' },
  { voteId: '119-HR-1-4', bioguideId: 'K000394' },
  { voteId: '119-HR-1-1', bioguideId: 'A000382' },
];

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url: string, timeout: number): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // Server not ready yet
    }
    await delay(500);
  }
  return false;
}

function startDevServer(): ChildProcess {
  console.log(`Starting dev server on port ${PORT}...`);
  const server = spawn('npx', ['astro', 'dev', '--port', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    cwd: join(process.cwd()),
  });

  server.stdout?.on('data', (data) => {
    const output = data.toString();
    if (output.includes('localhost')) console.log('Dev server:', output.trim());
  });
  server.stderr?.on('data', (data) => {
    console.error('Dev server stderr:', data.toString());
  });
  return server;
}

async function generateSocialCards(): Promise<void> {
  const cwd = process.cwd();
  const outputBase = join(cwd, OUTPUT_DIR);

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // Warm up the server with a quick request so first card load is faster
  try {
    const page = await browser.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.close();
  } catch {
    // Ignore warmup failure
  }

  let processed = 0;
  let failed = 0;

  for (const { voteId, bioguideId } of ALLOWLIST) {
    const dir = join(outputBase, voteId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const outputFile = join(dir, `${bioguideId}.png`);
    const url = `${BASE_URL}/social-card-voted?voteId=${encodeURIComponent(voteId)}&bioguideId=${encodeURIComponent(bioguideId)}`;

    try {
      console.log(`Generating social card for ${voteId} / ${bioguideId}...`);
      const page = await browser.newPage();
      await page.setViewport({
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        deviceScaleFactor: 1,
      });
      const response = await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 60000,
      });
      if (response && !response.ok()) {
        throw new Error(`HTTP ${response.status()}`);
      }
      await delay(SCREENSHOT_DELAY);
      await page.screenshot({
        path: outputFile,
        clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT },
      });
      console.log(`  ✓ ${voteId}/${bioguideId}.png`);
      processed++;
      await page.close();
    } catch (error) {
      console.error(`  ✗ Failed ${voteId}/${bioguideId}:`, error);
      failed++;
    }
  }

  await browser.close();
  console.log('\n--- Summary ---');
  console.log(`Generated: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${ALLOWLIST.length}`);
  if (failed > 0) process.exit(1);
}

async function main(): Promise<void> {
  const withServer = process.argv.includes('--with-server');

  if (withServer) {
    const server = startDevServer();
    try {
      console.log('Waiting for dev server to be ready...');
      const ready = await waitForServer(BASE_URL, SERVER_READY_TIMEOUT);
      if (!ready) throw new Error('Dev server failed to start within timeout');
      console.log('Dev server is ready.');
      await delay(2000);
      await generateSocialCards();
    } finally {
      console.log('\nStopping dev server...');
      if (server.pid) {
        try {
          process.kill(-server.pid, 'SIGKILL');
        } catch {
          server.kill('SIGKILL');
        }
      } else {
        server.kill('SIGKILL');
      }
      await delay(500);
      console.log('Done.');
    }
  } else {
    console.log('Checking if dev server is running...');
    const ready = await waitForServer(BASE_URL, 5000);
    if (!ready) {
      console.error('Dev server is not running. Either:');
      console.error('  1. Start it with: npm run dev (then run from another terminal: npm run social-cards)');
      console.error('  2. Or use: npm run social-cards -- --with-server');
      process.exit(1);
    }
    await generateSocialCards();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
