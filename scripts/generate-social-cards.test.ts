/**
 * The card-image generator: which casts it draws, how it splits the work,
 * what a failure costs, and what it reports. The browser sits behind
 * `CaptureSurface`, so the drawing loop runs here against a page that draws
 * nothing.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  CASTS_PER_JOB,
  castsOnBills,
  drawDefault,
  drawJobs,
  planCasts,
  formatDuration,
  formatSummary,
  parseCardArgs,
  toJobs,
  waitForServer,
  workerCount,
  type CaptureSurface,
  type CardJob,
} from './generate-social-cards.js';
import { readStubMembers, stubsFor } from './build-share-stubs.js';
import { readBills } from './build-finder-index.js';
import { makeDataDir } from './fixtures/dataDir.js';

describe('parseCardArgs', () => {
  it('is the sample and the default image when nothing is named', () => {
    assert.deepEqual(parseCardArgs([]), { bills: [], casts: [], onlyDefault: false, includeDefault: true });
  });

  it('reads bill ids and single casts, and then draws only those', () => {
    assert.deepEqual(parseCardArgs(['119-HR-4405', '119-HCONRES-22-1/A000382']), {
      bills: ['119-HR-4405'],
      casts: [{ voteId: '119-HCONRES-22-1', bioguideId: 'A000382' }],
      onlyDefault: false,
      includeDefault: false,
    });
  });

  it('draws only the default image under --default', () => {
    assert.deepEqual(parseCardArgs(['--default']), { bills: [], casts: [], onlyDefault: true, includeDefault: true });
  });

  it('refuses anything else rather than guessing', () => {
    assert.throws(() => parseCardArgs(['hr-4405']), /neither a bill id .* nor a cast/);
    assert.throws(() => parseCardArgs(['../x/y']), /neither a bill id/);
  });
});

describe('castsOnBills', () => {
  it('is every cast on the named bills that has a legislator file', () => {
    const { dataDir, cleanup } = makeDataDir();
    const casts = castsOnBills(readBills(dataDir), readStubMembers(dataDir), ['999-HR-26']);
    assert.deepEqual(casts, [
      { voteId: '999-HR-26-1', bioguideId: 'A000055' },
      { voteId: '999-HR-26-1', bioguideId: 'R000579' },
      { voteId: '999-HR-26-2', bioguideId: 'S000033' },
    ]);
    cleanup();
  });

  it('is exactly the casts the stub script writes a stub for', () => {
    const { dataDir, cleanup } = makeDataDir();
    const bills = readBills(dataDir);
    const members = readStubMembers(dataDir);
    const stubs = [...stubsFor(bills, members, { origin: 'https://votedfor.us', hasImage: () => false, bills: new Set(['999-HR-26']) })];
    assert.deepEqual(
      castsOnBills(bills, members, ['999-HR-26']),
      stubs.map(({ voteId, bioguideId }) => ({ voteId, bioguideId })),
    );
    cleanup();
  });

  it('is empty for a bill that is not in the data', () => {
    const { dataDir, cleanup } = makeDataDir();
    assert.deepEqual(castsOnBills(readBills(dataDir), readStubMembers(dataDir), ['119-HR-1']), []);
    cleanup();
  });
});

describe('planCasts', () => {
  const plan = (args: string[], sample: string[] = ['999-HR-26']) => {
    const { dataDir, cleanup } = makeDataDir();
    try {
      return planCasts(parseCardArgs(args), readBills(dataDir), readStubMembers(dataDir), sample);
    } finally {
      cleanup();
    }
  };

  it('draws the sample bills when nothing is named', () => {
    assert.equal(plan([]).length, 3);
  });

  it('draws only what is named, the sample set aside', () => {
    assert.deepEqual(plan(['999-HR-26-1/R000579'], ['119-HR-1']), [{ voteId: '999-HR-26-1', bioguideId: 'R000579' }]);
    assert.equal(plan(['999-HR-26'], ['119-HR-1']).length, 3);
  });

  it('draws no casts under --default', () => {
    assert.deepEqual(plan(['--default']), []);
  });

  it('fails on a sample bill with no recorded votes in the data — a typo must not pass as zero work', () => {
    assert.throws(() => plan([], ['999-HR-26', '999-HR-27']), /no recorded votes found for: 999-HR-27/);
    assert.throws(() => plan(['999-S-5']), /no recorded votes found for: 999-S-5/);
  });
});

describe('drawDefault', () => {
  it('captures the default page into public/social-card-default.png', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfu-cards-'));
    const { log, newSurface } = fakeSurface();
    assert.equal(await drawDefault(await newSurface(), dir), 1000);
    assert.deepEqual(log.opened, ['default']);
    assert.ok(fs.existsSync(path.join(dir, 'social-card-default.png')));
    fs.rmSync(dir, { recursive: true });
  });

  it('refuses a page that did not load, or loaded without its fonts', async () => {
    await assert.rejects(drawDefault(await fakeSurface({ status: () => 500 }).newSurface(), os.tmpdir()), /HTTP 500/);
    await assert.rejects(drawDefault(await fakeSurface({ fonts: { sans: false, failed: [] } }).newSurface(), os.tmpdir()), /fonts did not load/);
    await assert.rejects(drawDefault(await fakeSurface({ fonts: { sans: true, failed: ['Playfair Display'] } }).newSurface(), os.tmpdir()), /fonts did not load/);
  });
});

describe('toJobs', () => {
  const cast = (voteId: string, n: number) => ({ voteId, bioguideId: `M${String(n).padStart(6, '0')}` });

  it('groups casts by vote: one page load serves a whole vote', () => {
    const jobs = toJobs([cast('119-S-5-1', 1), cast('119-S-5-2', 1), cast('119-S-5-1', 2)]);
    assert.deepEqual(jobs, [
      { voteId: '119-S-5-1', members: ['M000001', 'M000002'] },
      { voteId: '119-S-5-2', members: ['M000001'] },
    ]);
  });

  it('splits a large vote so every worker can draw from it', () => {
    const house = Array.from({ length: 435 }, (_, n) => cast('119-HR-1-1', n));
    const jobs = toJobs(house);
    assert.equal(jobs.length, Math.ceil(435 / CASTS_PER_JOB));
    assert.ok(jobs.every(job => job.members.length <= CASTS_PER_JOB));
    assert.equal(jobs.flatMap(job => job.members).length, 435);
  });

  it('draws a cast named twice once', () => {
    assert.deepEqual(toJobs([cast('119-S-5-1', 1), cast('119-S-5-1', 1)]), [{ voteId: '119-S-5-1', members: ['M000001'] }]);
  });

  it('has no jobs for no casts', () => {
    assert.deepEqual(toJobs([]), []);
  });
});

describe('workerCount', () => {
  it('follows the CPUs there are, between 2 and 8', () => {
    assert.equal(workerCount(undefined, 1), 2);
    assert.equal(workerCount(undefined, 4), 4);
    assert.equal(workerCount(undefined, 64), 8);
  });

  it('takes a whole positive number from the environment over that', () => {
    assert.equal(workerCount('12', 4), 12);
    assert.equal(workerCount('0', 4), 4);
    assert.equal(workerCount('many', 4), 4);
    assert.equal(workerCount('2.5', 4), 4);
  });
});

/** A page that records what it was asked and writes one-byte files. */
function fakeSurface(behaviour: {
  status?: (query: string) => number;
  fonts?: { sans: boolean; failed: string[] };
  missing?: Set<string>;
  shootThrows?: Set<string>;
  openThrows?: boolean;
} = {}) {
  const log = { opened: [] as string[], shown: [] as string[], closed: 0, surfaces: 0 };
  const newSurface = async (): Promise<CaptureSurface> => {
    log.surfaces += 1;
    let current = '';
    return {
      async open(query) {
        if (behaviour.openThrows) throw new Error('net::ERR_CONNECTION_REFUSED');
        log.opened.push(query);
        return behaviour.status?.(query) ?? 200;
      },
      fonts: async () => behaviour.fonts ?? { sans: true, failed: [] },
      async show(bioguideId) {
        current = bioguideId;
        log.shown.push(bioguideId);
        return !behaviour.missing?.has(bioguideId);
      },
      async shoot(file) {
        if (behaviour.shootThrows?.has(current)) throw new Error('disk full');
        fs.writeFileSync(file, 'x');
        return 1000;
      },
      async close() { log.closed += 1; },
    };
  };
  return { log, newSurface };
}

describe('drawJobs', () => {
  const outDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vfu-cards-'));
  const jobs: CardJob[] = [
    { voteId: '119-S-5-1', members: ['A000001', 'B000002'] },
    { voteId: '119-S-5-2', members: ['A000001'] },
  ];

  it('loads each vote once and writes one PNG per cast where its stub points', async () => {
    const dir = outDir();
    const { log, newSurface } = fakeSurface();
    const report = await drawJobs(jobs, { workers: 1, outDir: dir, newSurface });
    assert.equal(report.drawn, 3);
    assert.equal(report.bytes, 3000);
    assert.deepEqual(report.failed, []);
    assert.deepEqual(log.opened, ['voteId=119-S-5-1', 'voteId=119-S-5-2']);
    assert.ok(fs.existsSync(path.join(dir, 'social-cards/119-S-5-1/B000002.png')));
    assert.ok(fs.existsSync(path.join(dir, 'social-cards/119-S-5-2/A000001.png')));
    fs.rmSync(dir, { recursive: true });
  });

  it('opens no more pages than there are jobs, and closes every one', async () => {
    const dir = outDir();
    const { log, newSurface } = fakeSurface();
    await drawJobs(jobs, { workers: 8, outDir: dir, newSurface });
    assert.equal(log.surfaces, 2);
    assert.equal(log.closed, 2);
    fs.rmSync(dir, { recursive: true });
  });

  it('reports progress after each job', async () => {
    const dir = outDir();
    const seen: number[] = [];
    await drawJobs(jobs, { workers: 1, outDir: dir, newSurface: fakeSurface().newSurface, onProgress: n => seen.push(n) });
    assert.deepEqual(seen, [2, 3]);
    fs.rmSync(dir, { recursive: true });
  });

  it('fails one cast without stopping the rest', async () => {
    const dir = outDir();
    const { newSurface } = fakeSurface({ missing: new Set(['B000002']) });
    const report = await drawJobs(jobs, { workers: 1, outDir: dir, newSurface });
    assert.equal(report.drawn, 2);
    assert.deepEqual(report.failed, [{ label: '119-S-5-1/B000002', reason: 'no such cast on this vote' }]);
    assert.ok(!fs.existsSync(path.join(dir, 'social-cards/119-S-5-1/B000002.png')));
    fs.rmSync(dir, { recursive: true });
  });

  it('names the reason when a screenshot cannot be saved', async () => {
    const dir = outDir();
    const { newSurface } = fakeSurface({ shootThrows: new Set(['B000002']) });
    const report = await drawJobs(jobs, { workers: 1, outDir: dir, newSurface });
    assert.deepEqual(report.failed, [{ label: '119-S-5-1/B000002', reason: 'disk full' }]);
    fs.rmSync(dir, { recursive: true });
  });

  it('fails every cast on a vote whose page does not load, and draws the others', async () => {
    const dir = outDir();
    const { log, newSurface } = fakeSurface({ status: q => (q.endsWith('119-S-5-1') ? 404 : 200) });
    const report = await drawJobs(jobs, { workers: 1, outDir: dir, newSurface });
    assert.equal(report.drawn, 1);
    assert.deepEqual(report.failed.map(f => `${f.label}: ${f.reason}`), [
      '119-S-5-1/A000001: HTTP 404', '119-S-5-1/B000002: HTTP 404',
    ]);
    assert.deepEqual(log.shown, ['A000001']);
    fs.rmSync(dir, { recursive: true });
  });

  it('draws nothing in a fallback typeface', async () => {
    const dir = outDir();
    const missingFace = await drawJobs(jobs, { workers: 1, outDir: dir, newSurface: fakeSurface({ fonts: { sans: false, failed: [] } }).newSurface });
    assert.equal(missingFace.drawn, 0);
    assert.ok(missingFace.failed.every(f => f.reason === 'Public Sans did not load'));
    const brokenFace = await drawJobs(jobs, { workers: 1, outDir: dir, newSurface: fakeSurface({ fonts: { sans: true, failed: ['JetBrains Mono'] } }).newSurface });
    assert.equal(brokenFace.drawn, 0);
    assert.equal(brokenFace.failed[0].reason, 'fonts failed to load: JetBrains Mono');
    fs.rmSync(dir, { recursive: true });
  });

  it('survives a page that throws on load, and still closes it', async () => {
    const dir = outDir();
    const { log, newSurface } = fakeSurface({ openThrows: true });
    const report = await drawJobs(jobs, { workers: 2, outDir: dir, newSurface });
    assert.equal(report.drawn, 0);
    assert.equal(report.failed.length, 3);
    assert.equal(report.failed[0].reason, 'net::ERR_CONNECTION_REFUSED');
    assert.equal(log.closed, log.surfaces);
    fs.rmSync(dir, { recursive: true });
  });

  it('does nothing, without opening a page it would not use, when there are no jobs', async () => {
    const { log, newSurface } = fakeSurface();
    const report = await drawJobs([], { workers: 4, outDir: os.tmpdir(), newSurface });
    assert.equal(report.drawn, 0);
    assert.equal(log.opened.length, 0);
    assert.equal(log.closed, log.surfaces);
  });
});

describe('formatDuration', () => {
  it('reads as a person would say it', () => {
    assert.equal(formatDuration(42.4), '42s');
    assert.equal(formatDuration(185), '3m 05s');
    assert.equal(formatDuration(17_160), '4h 46m');
  });
});

describe('formatSummary', () => {
  const report = { drawn: 2000, failed: [], bytes: 2000 * 100 * 1024, seconds: 100 };

  it('gives the rate, the size, and what that rate means for every cast', () => {
    const text = formatSummary(report, { workers: 4, totalCasts: 360_000 });
    assert.match(text, /\*\*Drawn:\*\* 2,000 in 1m 40s — 20\.0 a second on 4 pages/);
    assert.match(text, /\*\*Size:\*\* 195\.3 MB, 100 KB each/);
    assert.match(text, /all 360,000 casts:\*\* 5h 00m and 34\.3 GB/);
  });

  it('makes no projection when everything was drawn, or nothing was', () => {
    assert.doesNotMatch(formatSummary(report, { workers: 4, totalCasts: 2000 }), /At this rate/);
    const nothing = formatSummary({ drawn: 0, failed: [], bytes: 0, seconds: 0 }, { workers: 4, totalCasts: 360_000 });
    assert.doesNotMatch(nothing, /At this rate/);
    assert.match(nothing, /0\.0 a second/);
  });

  it('lists the first ten failures and counts the rest', () => {
    const failed = Array.from({ length: 12 }, (_, n) => ({ label: `119-S-5-1/M${n}`, reason: 'HTTP 404' }));
    const text = formatSummary({ ...report, failed }, { workers: 4, totalCasts: 360_000 });
    assert.match(text, /\*\*Failed:\*\* 12/);
    assert.equal(text.split('\n').filter(line => line.includes('HTTP 404')).length, 10);
    assert.match(text, /…and 2 more/);
  });
});

describe('waitForServer', () => {
  it('answers true as soon as the URL returns 200', async () => {
    let hits = 0;
    const server = http.createServer((_, res) => { hits += 1; res.statusCode = hits < 2 ? 503 : 200; res.end(); });
    await new Promise<void>(resolve => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    assert.equal(await waitForServer(`http://localhost:${port}/`, 2000, 10), true);
    assert.equal(hits, 2);
    server.close();
  });

  it('gives up after the timeout when nothing is listening', async () => {
    const server = http.createServer();
    await new Promise<void>(resolve => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    await new Promise(resolve => server.close(resolve));
    assert.equal(await waitForServer(`http://localhost:${port}/`, 60, 20), false);
  });
});
