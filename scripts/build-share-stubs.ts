/**
 * @file build-share-stubs.ts
 * @description Writes the share stubs: one small HTML file per member×vote
 * cast, at `dist/bills/{term}/{type}/{number}/{vote}/{bioguide}/index.html`.
 *
 * One member's cast on one vote is not a page — the card opens in place over
 * the roll. But a link preview is built by a crawler that reads the HTML at
 * the shared URL and runs no JavaScript, so a cast that should have a preview
 * needs a file with the tags in it. A stub is that file and nothing else: the
 * Open Graph tags, a canonical link, and a hand-off to the roll with the card
 * open (`?member=`). About 1 KB, against the 217 KB page it replaces.
 *
 * Astro does not render these. There are about 350,000 casts; a template
 * string per cast is seconds of work where a route was two hours.
 *
 * Which casts get one is `src/shareConfig.ts`: the sample by default, every
 * cast under `SHARE_STUBS=all`.
 *
 * ```bash
 * npm run share:stubs                  # the sample, into dist/
 * SHARE_STUBS=all npm run share:stubs  # every cast
 * ```
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBestBillTitle } from '../src/utils/billTitle.js';
import { formatLegislationIdentifier } from '../src/utils/billLegislationFormat.js';
import { getEditorialVoteAction } from '../src/utils/editorial.js';
import { buildLegislatorVoteDisplay } from '../src/utils/legislatorVoteDisplay.js';
import { memberCastsForDisplay } from '../src/utils/memberCastsForDisplay.js';
import { normalizeLegislatorForCollection } from '../src/utils/normalizeLegislatorForCollection.js';
import { stateNameFromCode } from '../src/utils/stateNames.js';
import { voteCardPath, voteSharePath } from '../src/utils/voteLinks.js';
import { SHARE_SAMPLE, SHARE_STUBS_ALL } from '../src/shareConfig.js';
import { seoConfig } from '../utils/seoConfig.js';
import { readBills, type RawBill } from './build-finder-index.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Everything one stub says. */
export type ShareStub = {
  voteId: string;
  bioguideId: string;
  /** "Sen. Angela D. Alsobrooks voted Nay" */
  title: string;
  /** "On the Motion to Proceed H.R. 1 · One Big Beautiful Bill Act (H.R. 1)" */
  description: string;
  /** Absolute URL of the preview image. */
  image: string;
  /** True when `image` is this cast's own 1200×630 card rather than the site default. */
  ownImage: boolean;
};

/** The member fields a stub's title needs. */
export type StubMember = {
  nameTitle: string;
  party: string;
  state: string;
  chamber: 'sen' | 'rep';
  district?: number;
};

/** Marks a file as a stub, so a rebuild may replace it but never a real page. */
export const STUB_MARKER = '<meta name="generator" content="vfu-share-stub">';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for an HTML attribute or text node. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Where a cast's own card image lives, relative to the site root. */
export function cardImagePath(voteId: string, bioguideId: string): string {
  return `/social-cards/v/${voteId}/${bioguideId}.png`;
}

/**
 * The stub document.
 *
 * The hand-off is both a meta refresh and a script: the script is immediate
 * and keeps the stub out of history, the refresh covers a reader with
 * scripting off, and the link covers a client that honours neither.
 *
 * @param stub - What the preview says
 * @param options.origin - Site origin for absolute URLs
 * @param options.base - Deployment base for the hand-off
 * @returns A complete HTML document
 */
export function renderStub(stub: ShareStub, options: { origin: string; base: string }): string {
  const origin = options.origin.replace(/\/$/, '');
  const shareUrl = `${origin}${voteSharePath(stub.voteId, stub.bioguideId)}`;
  const target = voteCardPath(stub.voteId, stub.bioguideId, options.base);
  const t = escapeHtml(stub.title);
  const d = escapeHtml(stub.description);
  const size = stub.ownImage
    ? '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
    : '';
  return [
    `<!doctype html><html lang="en"><head><meta charset="utf-8">${STUB_MARKER}`,
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${escapeHtml(shareUrl)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${escapeHtml(seoConfig.siteName)}">`,
    `<meta property="og:url" content="${escapeHtml(shareUrl)}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:image" content="${escapeHtml(stub.image)}">${size}`,
    `<meta name="twitter:card" content="${stub.ownImage ? 'summary_large_image' : 'summary'}">`,
    `<meta http-equiv="refresh" content="0; url=${escapeHtml(target)}">`,
    `<script>location.replace(${JSON.stringify(target).replace(/</g, '\\u003c')})</script>`,
    `</head><body><p><a href="${escapeHtml(target)}">${t}</a></p></body></html>`,
  ].join('');
}

/**
 * Every cast in the data, as stubs. A generator, because under
 * `SHARE_STUBS=all` there are about 350,000 and none needs to outlive its write.
 *
 * @param bills - Raw bill files
 * @param members - Member fields by bioguide id
 * @param options.origin - Site origin for absolute image URLs
 * @param options.hasImage - Whether a cast has its own card image
 * @param options.only - When set, only these `voteId/bioguideId` keys are yielded
 */
export function* stubsFor(
  bills: RawBill[],
  members: Map<string, StubMember>,
  options: { origin: string; hasImage: (voteId: string, bioguideId: string) => boolean; only?: Set<string> },
): Generator<ShareStub> {
  const origin = options.origin.replace(/\/$/, '');
  for (const bill of bills) {
    const billTitle = getBestBillTitle(bill as Parameters<typeof getBestBillTitle>[0]);
    const identifier = formatLegislationIdentifier(String(bill.type).toLowerCase(), String(bill.number));
    for (const action of bill.actions?.actions ?? []) {
      for (const vote of action.recordedVotes ?? []) {
        if (!vote.id) continue;
        const question = getEditorialVoteAction(vote.id) ?? vote.question ?? action.text ?? 'Recorded vote';
        for (const [bioguideId, cast] of Object.entries(memberCastsForDisplay(vote))) {
          if (options.only && !options.only.has(`${vote.id}/${bioguideId}`)) continue;
          const member = members.get(bioguideId);
          if (!member) continue; // a cast by someone with no legislator file has no card either
          const display = buildLegislatorVoteDisplay({
            voteCast: cast,
            recordType: vote.recordType,
            nameTitle: member.nameTitle,
            party: member.party,
            stateName: stateNameFromCode(member.state),
            chamber: member.chamber,
            state: member.state,
            district: member.district,
          });
          const ownImage = options.hasImage(vote.id, bioguideId);
          yield {
            voteId: vote.id,
            bioguideId,
            title: `${display.displayName} ${display.voteVerb} ${display.actionLabel}`,
            description: `${question} · ${billTitle} (${identifier})`,
            image: `${origin}${ownImage ? cardImagePath(vote.id, bioguideId) : seoConfig.image.url}`,
            ownImage,
          };
        }
      }
    }
  }
}

/** Member fields for every legislator file under `src/data/legislators`. */
export function readStubMembers(dataDir: string): Map<string, StubMember> {
  const dir = path.join(dataDir, 'legislators');
  const members = new Map<string, StubMember>();
  if (!fs.existsSync(dir)) return members;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const id = path.basename(file, '.json');
    const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Record<string, unknown>;
    const leg = normalizeLegislatorForCollection(raw, id);
    members.set(id, {
      nameTitle: leg.nameTitle ?? id,
      party: leg.party ?? '',
      state: leg.state ?? '',
      chamber: leg.type === 'sen' ? 'sen' : 'rep',
      district: typeof leg.district === 'number' ? leg.district : undefined,
    });
  }
  return members;
}

/**
 * Write stubs under `outDir`. An earlier stub at the same path is replaced —
 * an incremental build restores them from `dist-cache` — but any other file
 * there is a real page, and a stub must not silently take its place.
 *
 * @returns How many were written, and their total size
 */
export function writeStubs(
  stubs: Iterable<ShareStub>,
  options: { outDir: string; origin: string; base: string },
): { count: number; bytes: number } {
  let count = 0;
  let bytes = 0;
  const made = new Set<string>();
  for (const stub of stubs) {
    const dir = path.join(options.outDir, voteSharePath(stub.voteId, stub.bioguideId));
    const parent = path.dirname(dir);
    if (!made.has(parent)) {
      fs.mkdirSync(parent, { recursive: true });
      made.add(parent);
    }
    fs.mkdirSync(dir, { recursive: true });
    const html = renderStub(stub, options);
    writeStubFile(path.join(dir, 'index.html'), html);
    count += 1;
    bytes += Buffer.byteLength(html);
  }
  return { count, bytes };
}

/** Write one stub, replacing only a previous stub. */
function writeStubFile(file: string, html: string): void {
  try {
    fs.writeFileSync(file, html, { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    const head = fs.readFileSync(file, 'utf8').slice(0, 400);
    if (!head.includes(STUB_MARKER)) {
      throw new Error(
        `${file} already holds a page that is not a share stub — ` +
        'a stale build is in dist/ or dist-cache/; run a full rebuild (npm run build:full)',
      );
    }
    fs.writeFileSync(file, html);
  }
}

function main() {
  const outDir = path.join(REPO_ROOT, 'dist');
  if (!fs.existsSync(outDir)) {
    throw new Error('dist/ does not exist — share stubs are written into a finished build');
  }
  const publicDir = path.join(REPO_ROOT, 'public');
  const dataDir = path.join(REPO_ROOT, 'src', 'data');
  const started = Date.now();
  const stubs = stubsFor(readBills(dataDir), readStubMembers(dataDir), {
    origin: seoConfig.baseURL,
    hasImage: (voteId, bioguideId) => fs.existsSync(path.join(publicDir, cardImagePath(voteId, bioguideId))),
    only: SHARE_STUBS_ALL ? undefined : new Set(SHARE_SAMPLE.map((s) => `${s.voteId}/${s.bioguideId}`)),
  });
  const { count, bytes } = writeStubs(stubs, {
    outDir,
    origin: seoConfig.baseURL,
    base: process.env.BASE_URL ?? '/',
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `share stubs: ${count} written (${SHARE_STUBS_ALL ? 'every cast' : 'sample'}), ` +
    `${(bytes / 1024 / 1024).toFixed(1)} MB, ${seconds}s`,
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
