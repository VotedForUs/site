/**
 * The share stubs: what one says, which casts get one, and what a write may
 * and may not replace.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  STUB_MARKER,
  billIdOf,
  buildShareStubs,
  escapeHtml,
  readStubMembers,
  renderStub,
  stubsFor,
  writeStubs,
  type ShareStub,
  type StubMember,
} from './build-share-stubs.js';
import type { RawBill } from './build-finder-index.js';
import { makeDataDir } from './fixtures/dataDir.js';

const members = new Map<string, StubMember>([
  ['A000382', { nameTitle: 'Sen. Angela D. Alsobrooks (MD)', party: 'Democrat', state: 'MD', chamber: 'sen' }],
  ['R000579', { nameTitle: 'Rep. Patrick Ryan (NY-18)', party: 'Democrat', state: 'NY', chamber: 'rep', district: 18 }],
]);

const bills: RawBill[] = [{
  id: '119-HR-1',
  congress: 119,
  type: 'HR',
  number: 1,
  title: 'An act to provide for reconciliation.',
  actions: {
    actions: [
      {
        actionDate: '2025-06-28',
        text: 'Motion to proceed agreed to.',
        recordedVotes: [{
          id: '119-HR-1-3', chamber: 'Senate', rollNumber: 329,
          question: 'On the Motion to Proceed H.R. 1',
          votes: { A000382: 'Nay', X000000: 'Yea' },
        }],
      },
      {
        actionDate: '2025-07-01',
        text: 'Passed by voice vote.',
        recordedVotes: [{
          id: '119-HR-1-9', chamber: 'House', recordType: 'voice',
          question: 'On Passage', votes: {}, membersAtAction: ['R000579'],
        }],
      },
    ],
  },
}];

const none = () => false;
const origin = 'https://votedfor.us';

describe('stubsFor', () => {
  it('yields one stub per cast, skipping a cast with no legislator file', () => {
    const stubs = [...stubsFor(bills, members, { origin, hasImage: none })];
    assert.deepEqual(stubs.map((s) => `${s.voteId}/${s.bioguideId}`), ['119-HR-1-3/A000382', '119-HR-1-9/R000579']);
  });

  it('says who voted how, and on what', () => {
    const [stub] = [...stubsFor(bills, members, { origin, hasImage: none })];
    assert.equal(stub.title, 'Sen. Angela D. Alsobrooks voted Nay');
    assert.match(stub.description, /^On the Motion to Proceed H\.R\. 1 · .+ \(H\.R\. 1\)$/);
  });

  it('names the kind on a consent vote and never the stored literal', () => {
    const stub = [...stubsFor(bills, members, { origin, hasImage: none })][1];
    assert.equal(stub.title, 'Rep. Patrick Ryan joined a Voice Vote');
    assert.doesNotMatch(stub.title, /\bUC\b|\bvv\b/);
  });

  it('uses the cast’s own card where one exists, the site image otherwise', () => {
    const stubs = [...stubsFor(bills, members, { origin, hasImage: (voteId) => voteId === '119-HR-1-3' })];
    assert.equal(stubs[0].image, 'https://votedfor.us/social-cards/119-HR-1-3/A000382.png');
    assert.equal(stubs[0].ownImage, true);
    assert.equal(stubs[1].ownImage, false);
    assert.equal(stubs[1].image, 'https://votedfor.us/social-card-default.png');
  });

  it('points every cast at the image host once one is configured', () => {
    const stubs = [...stubsFor(bills, members, { origin, hasImage: () => true, imageBase: 'https://cards.votedfor.us' })];
    assert.equal(stubs[1].image, 'https://cards.votedfor.us/social-cards/119-HR-1-9/R000579.png');
    assert.equal(stubs[1].ownImage, true);
  });

  it('is limited to the sample bills when a list is given — every cast on them, none off them', () => {
    const other: RawBill = { ...bills[0], id: '119-S-5', type: 'S', number: 5 };
    const stubs = [...stubsFor([...bills, other], members, { origin, hasImage: none, bills: new Set(['119-HR-1']) })];
    assert.deepEqual(stubs.map((s) => `${s.voteId}/${s.bioguideId}`), ['119-HR-1-3/A000382', '119-HR-1-9/R000579']);
    assert.deepEqual([...stubsFor(bills, members, { origin, hasImage: none, bills: new Set(['119-S-99']) })], []);
  });

  it('puts this site’s images under its deployment base, and an image host’s at its root', () => {
    const here = [...stubsFor(bills, members, { origin, base: '/previews/pr-7/', hasImage: (v) => v === '119-HR-1-3' })];
    assert.equal(here[0].image, 'https://votedfor.us/previews/pr-7/social-cards/119-HR-1-3/A000382.png');
    assert.equal(here[1].image, 'https://votedfor.us/previews/pr-7/social-card-default.png');
    const hosted = [...stubsFor(bills, members, {
      origin, base: '/previews/pr-7/', hasImage: () => true, imageBase: 'https://cards.votedfor.us',
    })];
    assert.equal(hosted[0].image, 'https://cards.votedfor.us/social-cards/119-HR-1-3/A000382.png');
  });

  it('skips a recorded vote with no id rather than inventing one', () => {
    const noId: RawBill = { ...bills[0], actions: { actions: [{ recordedVotes: [{ votes: { A000382: 'Yea' } }] }] } };
    assert.deepEqual([...stubsFor([noId], members, { origin, hasImage: none })], []);
  });
});

describe('billIdOf', () => {
  it('reads the id, or builds it the way the sample list spells one', () => {
    assert.equal(billIdOf({ id: '119-HR-1', congress: 119, type: 'HR', number: 1 }), '119-HR-1');
    assert.equal(billIdOf({ congress: 119, type: 'hconres', number: '73' }), '119-HCONRES-73');
  });
});

describe('renderStub', () => {
  const stub: ShareStub = {
    voteId: '119-HR-1-3',
    bioguideId: 'A000382',
    title: 'Sen. Angela D. Alsobrooks voted Nay',
    description: 'On "Passage" <of> H.R. 1 & more',
    image: 'https://votedfor.us/social-cards/119-HR-1-3/A000382.png',
    ownImage: true,
  };
  const html = renderStub(stub, { origin, base: '/' });

  it('carries the tags a link preview reads', () => {
    assert.match(html, /<meta property="og:title" content="Sen\. Angela D\. Alsobrooks voted Nay">/);
    assert.match(html, /<meta property="og:image" content="https:\/\/votedfor\.us\/social-cards\/119-HR-1-3\/A000382\.png">/);
    assert.match(html, /<meta property="og:url" content="https:\/\/votedfor\.us\/bills\/119\/hr\/1\/3\/A000382">/);
    assert.match(html, /<link rel="canonical" href="https:\/\/votedfor\.us\/bills\/119\/hr\/1\/3\/A000382">/);
    assert.match(html, /summary_large_image/);
  });

  it('hands the reader to the roll with the card open', () => {
    assert.match(html, /http-equiv="refresh" content="0; url=\/bills\/119\/hr\/1\/3\?member=A000382"/);
    assert.match(html, /location\.replace\("\/bills\/119\/hr\/1\/3\?member=A000382"\)/);
    assert.match(html, /<a href="\/bills\/119\/hr\/1\/3\?member=A000382">/);
  });

  it('escapes what it interpolates', () => {
    assert.match(html, /On &quot;Passage&quot; &lt;of&gt; H\.R\. 1 &amp; more/);
    assert.equal(escapeHtml(`<a b="c" d='e'>&`), '&lt;a b=&quot;c&quot; d=&#39;e&#39;&gt;&amp;');
  });

  it('stays small — there may be 350,000 of these', () => {
    assert.ok(Buffer.byteLength(html) < 1500, `${Buffer.byteLength(html)} bytes`);
  });

  it('carries a deployment base into the hand-off and into its own URL', () => {
    const based = renderStub(stub, { origin, base: '/site/' });
    assert.match(based, /url=\/site\/bills\/119\/hr\/1\/3\?member=A000382/);
    assert.match(based, /rel="canonical" href="https:\/\/votedfor\.us\/site\/bills\/119\/hr\/1\/3\/A000382"/);
    assert.match(based, /og:url" content="https:\/\/votedfor\.us\/site\/bills\/119\/hr\/1\/3\/A000382"/);
  });

  it('declares the 1200×630 size for the default image too', () => {
    const plain = renderStub({ ...stub, image: 'https://votedfor.us/social-card-default.png', ownImage: false }, { origin, base: '/' });
    assert.match(plain, /og:image:width" content="1200"/);
    assert.match(plain, /summary_large_image/);
  });
});

describe('writeStubs', () => {
  const stub: ShareStub = {
    voteId: '119-HR-1-3', bioguideId: 'A000382', title: 't', description: 'd', image: 'https://votedfor.us/x.png', ownImage: false,
  };
  const file = (dir: string) => path.join(dir, 'bills/119/hr/1/3/A000382/index.html');

  it('writes each stub where its share URL points', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stubs-'));
    const result = writeStubs([stub], { outDir, origin, base: '/' });
    assert.equal(result.count, 1);
    assert.ok(fs.readFileSync(file(outDir), 'utf8').includes(STUB_MARKER));
    fs.rmSync(outDir, { recursive: true });
  });

  it('replaces an earlier stub, as an incremental build needs', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stubs-'));
    writeStubs([stub], { outDir, origin, base: '/' });
    writeStubs([{ ...stub, title: 'second' }], { outDir, origin, base: '/' });
    assert.match(fs.readFileSync(file(outDir), 'utf8'), /<title>second<\/title>/);
    fs.rmSync(outDir, { recursive: true });
  });

  it('refuses to replace a page that is not a stub', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stubs-'));
    fs.mkdirSync(path.dirname(file(outDir)), { recursive: true });
    fs.writeFileSync(file(outDir), '<!doctype html><title>A real page</title>');
    assert.throws(() => writeStubs([stub], { outDir, origin, base: '/' }), /not a share stub/);
    assert.match(fs.readFileSync(file(outDir), 'utf8'), /A real page/);
    fs.rmSync(outDir, { recursive: true });
  });
});

describe('readStubMembers', () => {
  it('reads every legislator file into the fields a stub title needs', () => {
    const { dataDir, cleanup } = makeDataDir();
    const read = readStubMembers(dataDir);
    assert.deepEqual([...read.keys()].sort(), ['A000055', 'N000000', 'R000579', 'S000033']);
    assert.deepEqual(read.get('R000579'), {
      nameTitle: 'Rep. Patrick Ryan (NY-18)', party: 'Democrat', state: 'NY', chamber: 'rep', district: 18,
    });
    assert.equal(read.get('S000033')?.chamber, 'sen');
    assert.equal(read.get('S000033')?.district, undefined);
    cleanup();
  });

  it('is empty when there is no legislators directory', () => {
    assert.equal(readStubMembers(path.join(os.tmpdir(), 'vfu-no-such-dir')).size, 0);
  });
});

describe('buildShareStubs', () => {
  const build = (root: string, dataDir: string, over: Partial<Parameters<typeof buildShareStubs>[0]> = {}) => ({
    outDir: path.join(root, 'dist'),
    dataDir,
    publicDir: path.join(root, 'public'),
    origin,
    base: '/',
    all: false,
    sampleBills: ['999-HR-26'],
    imageBase: null,
    ...over,
  });

  it('refuses to run without a finished build to write into', () => {
    const { root, dataDir, cleanup } = makeDataDir();
    assert.throws(() => buildShareStubs(build(root, dataDir)), /does not exist/);
    cleanup();
  });

  it('writes a stub for every cast on the sample bills that has a legislator file', () => {
    const { root, dataDir, cleanup } = makeDataDir();
    fs.mkdirSync(path.join(root, 'dist'));
    const result = buildShareStubs(build(root, dataDir));
    // Three with files on the roll call and the voice vote; Z999999 has no file.
    assert.equal(result.count, 3);
    assert.equal(result.withImage, 0);
    assert.ok(result.bytes > 0);
    assert.ok(fs.existsSync(path.join(root, 'dist/bills/999/hr/26/1/A000055/index.html')));
    assert.ok(fs.existsSync(path.join(root, 'dist/bills/999/hr/26/2/S000033/index.html')));
    assert.ok(!fs.existsSync(path.join(root, 'dist/bills/999/hr/26/1/Z999999')));
    cleanup();
  });

  it('writes none when the sample names no bill in the data, and all of them under `all`', () => {
    const { root, dataDir, cleanup } = makeDataDir();
    fs.mkdirSync(path.join(root, 'dist'));
    assert.equal(buildShareStubs(build(root, dataDir, { sampleBills: ['119-HR-1'] })).count, 0);
    assert.equal(buildShareStubs(build(root, dataDir, { sampleBills: [], all: true })).count, 3);
    cleanup();
  });

  it('gives a cast its own image only where the PNG has been drawn', () => {
    const { root, dataDir, cleanup } = makeDataDir();
    fs.mkdirSync(path.join(root, 'dist'));
    fs.mkdirSync(path.join(root, 'public/social-cards/999-HR-26-1'), { recursive: true });
    fs.writeFileSync(path.join(root, 'public/social-cards/999-HR-26-1/A000055.png'), '');
    const result = buildShareStubs(build(root, dataDir));
    assert.equal(result.withImage, 1);
    const drawn = fs.readFileSync(path.join(root, 'dist/bills/999/hr/26/1/A000055/index.html'), 'utf8');
    const undrawn = fs.readFileSync(path.join(root, 'dist/bills/999/hr/26/1/R000579/index.html'), 'utf8');
    assert.match(drawn, /og:image" content="https:\/\/votedfor\.us\/social-cards\/999-HR-26-1\/A000055\.png"/);
    assert.match(undrawn, /og:image" content="https:\/\/votedfor\.us\/social-card-default\.png"/);
    cleanup();
  });

  it('takes every cast to have an image once an image host is configured', () => {
    const { root, dataDir, cleanup } = makeDataDir();
    fs.mkdirSync(path.join(root, 'dist'));
    const result = buildShareStubs(build(root, dataDir, { imageBase: 'https://cards.votedfor.us' }));
    assert.equal(result.withImage, 3);
    cleanup();
  });
});
