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
  escapeHtml,
  renderStub,
  stubsFor,
  writeStubs,
  type ShareStub,
  type StubMember,
} from './build-share-stubs.js';
import type { RawBill } from './build-finder-index.js';

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
    assert.equal(stubs[0].image, 'https://votedfor.us/social-cards/v/119-HR-1-3/A000382.png');
    assert.equal(stubs[0].ownImage, true);
    assert.equal(stubs[1].ownImage, false);
    assert.doesNotMatch(stubs[1].image, /social-cards/);
  });

  it('is limited to the sample when one is given', () => {
    const only = new Set(['119-HR-1-9/R000579']);
    const stubs = [...stubsFor(bills, members, { origin, hasImage: none, only })];
    assert.deepEqual(stubs.map((s) => s.bioguideId), ['R000579']);
  });
});

describe('renderStub', () => {
  const stub: ShareStub = {
    voteId: '119-HR-1-3',
    bioguideId: 'A000382',
    title: 'Sen. Angela D. Alsobrooks voted Nay',
    description: 'On "Passage" <of> H.R. 1 & more',
    image: 'https://votedfor.us/social-cards/v/119-HR-1-3/A000382.png',
    ownImage: true,
  };
  const html = renderStub(stub, { origin, base: '/' });

  it('carries the tags a link preview reads', () => {
    assert.match(html, /<meta property="og:title" content="Sen\. Angela D\. Alsobrooks voted Nay">/);
    assert.match(html, /<meta property="og:image" content="https:\/\/votedfor\.us\/social-cards\/v\/119-HR-1-3\/A000382\.png">/);
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

  it('carries a deployment base into the hand-off but not into the canonical URL', () => {
    const based = renderStub(stub, { origin, base: '/site/' });
    assert.match(based, /url=\/site\/bills\/119\/hr\/1\/3\?member=A000382/);
    assert.match(based, /rel="canonical" href="https:\/\/votedfor\.us\/bills\/119\/hr\/1\/3\/A000382"/);
  });

  it('claims a small card when the image is only the site default', () => {
    const plain = renderStub({ ...stub, image: 'https://votedfor.us/favicon.svg', ownImage: false }, { origin, base: '/' });
    assert.match(plain, /<meta name="twitter:card" content="summary">/);
    assert.doesNotMatch(plain, /og:image:width/);
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
