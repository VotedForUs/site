/**
 * Analyzes bill titles from generated data/bills (API only, no editorial).
 * Computes effective title: best of Popular / Short Title / bill.title, then
 * cleanDisapprovalTitle, then applyAcronyms. Outputs analysis and report.
 *
 * Run from repo root: npx tsx packages/site/scripts/analyze-bill-titles.ts
 * Or from packages/site: npx tsx scripts/analyze-bill-titles.ts
 * Requires packages/site/src/data/bills to exist (generate via site:bills:generate:*).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanDisapprovalTitle } from '../src/utils/cleanDisapprovalTitle.js';
import { applyAcronyms, type AcronymEntry } from '../src/utils/applyAcronyms.js';
import { shortenBillTitleBoilerplate } from '../src/utils/shortenBillTitleBoilerplate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, '..');
const BILLS_DIR = path.join(SITE_ROOT, 'src', 'data', 'bills');
const ACRONYMS_PATH = path.join(SITE_ROOT, 'src', 'content', 'editorial', 'acronyms.json');

type BillTitleEntry = { title?: string; titleType?: string; updateDate?: string };
type BillFromData = {
  title?: string;
  titles?: { titles?: BillTitleEntry[] };
};

function loadAcronyms(): AcronymEntry[] {
  try {
    if (fs.existsSync(ACRONYMS_PATH)) {
      const data = JSON.parse(fs.readFileSync(ACRONYMS_PATH, 'utf8')) as { acronyms?: AcronymEntry[] };
      return Array.isArray(data?.acronyms) ? data.acronyms : [];
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Best title from API data only (no editorial): Popular Titles > newest Short Title > bill.title.
 */
function getEffectiveTitleFromApiOnly(bill: BillFromData): string {
  const defaultTitle = bill.title?.trim() || 'Untitled Bill';
  const titles = bill.titles?.titles;
  if (!titles?.length) return defaultTitle;

  const popular = titles.find((t) => t.titleType === 'Popular Titles');
  if (popular?.title?.trim()) return popular.title.trim();

  const shortTitles = titles.filter((t) => t.titleType?.startsWith('Short Title'));
  if (shortTitles.length > 0) {
    const sorted = [...shortTitles].sort(
      (a, b) => new Date(b.updateDate ?? 0).getTime() - new Date(a.updateDate ?? 0).getTime()
    );
    if (sorted[0]?.title?.trim()) return sorted[0].title.trim();
  }

  return defaultTitle;
}

function collectAllTitles(): string[] {
  const out: string[] = [];
  if (!fs.existsSync(BILLS_DIR)) return out;

  const acronyms = loadAcronyms();
  const congressDirs = fs.readdirSync(BILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
    .map((d) => d.name);

  for (const congress of congressDirs) {
    const congressPath = path.join(BILLS_DIR, congress);
    const billTypeDirs = fs.readdirSync(congressPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const billType of billTypeDirs) {
      const billTypePath = path.join(congressPath, billType);
      const files = fs.readdirSync(billTypePath).filter((f) => f.endsWith('.json'));

      for (const file of files) {
        const filePath = path.join(billTypePath, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const bill = JSON.parse(content) as BillFromData;
          const raw = getEffectiveTitleFromApiOnly(bill);
          const cleaned = shortenBillTitleBoilerplate(
            applyAcronyms(cleanDisapprovalTitle(raw), acronyms)
          );
          out.push(cleaned);
        } catch {
          // skip invalid files
        }
      }
    }
  }
  return out;
}

const PREFIX_PATTERNS = [
  'A bill to',
  'To amend',
  'Making appropriations',
  'Making consolidated appropriations',
  'Providing for congressional disapproval',
  'Disapproval of',
  'A joint resolution',
  'An act to',
  'To provide',
  'To authorize',
  'To establish',
  'To direct',
  'To prohibit',
  'To require',
  'To support',
  'To improve',
  'To extend',
  'To reform',
  'For other purposes',
];

function getPrefix(title: string): string {
  const t = title.trim();
  for (const p of PREFIX_PATTERNS) {
    if (t.startsWith(p)) return p;
  }
  const firstWords = t.split(/\s+/).slice(0, 4).join(' ');
  return firstWords.length > 40 ? firstWords.slice(0, 40) + '…' : firstWords || '(empty)';
}

const PHRASE_CANDIDATES = [
  'United States Code',
  'for other purposes',
  'relating to',
  'for the fiscal year ending',
  'and for other purposes',
  'of title 5',
  'of the rule submitted by',
  'relating to "',
];

function countPhrase(title: string, phrase: string): number {
  let count = 0;
  let idx = 0;
  const lower = title.toLowerCase();
  const phraseLower = phrase.toLowerCase();
  while ((idx = lower.indexOf(phraseLower, idx)) !== -1) {
    count++;
    idx += phraseLower.length;
  }
  return count;
}

function runAnalysis(titles: string[]): {
  total: number;
  unique: number;
  byPrefix: Map<string, number>;
  phraseCounts: Map<string, number>;
  lengthBuckets: Map<string, number>;
} {
  const byPrefix = new Map<string, number>();
  const phraseCounts = new Map<string, number>();
  const lengthBuckets = new Map<string, number>();

  for (const p of PHRASE_CANDIDATES) phraseCounts.set(p, 0);

  for (const t of titles) {
    const prefix = getPrefix(t);
    byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1);

    for (const phrase of PHRASE_CANDIDATES) {
      const n = countPhrase(t, phrase);
      if (n > 0) phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + n);
    }

    const len = t.length;
    const bucket =
      len <= 50 ? '1–50' : len <= 100 ? '51–100' : len <= 150 ? '101–150' : len <= 200 ? '151–200' : '200+';
    lengthBuckets.set(bucket, (lengthBuckets.get(bucket) ?? 0) + 1);
  }

  return {
    total: titles.length,
    unique: new Set(titles).size,
    byPrefix,
    phraseCounts,
    lengthBuckets,
  };
}

function writeReport(titles: string[], analysis: ReturnType<typeof runAnalysis>, reportPath: string): void {
  const lines: string[] = [
    '# Bill title shortening analysis',
    '',
    'Data source: `packages/site/src/data/bills` (API only, no editorial).',
    'Effective title = best of Popular / Short Title / bill.title → cleanDisapprovalTitle → applyAcronyms.',
    '',
    '## Summary',
    '',
    `- **Total titles:** ${analysis.total}`,
    `- **Unique titles:** ${analysis.unique}`,
    '',
    '## Length distribution (characters)',
    '',
    '| Bucket | Count |',
    '|--------|-------|',
  ];

  const order = ['1–50', '51–100', '101–150', '151–200', '200+'];
  for (const b of order) {
    const n = analysis.lengthBuckets.get(b) ?? 0;
    lines.push(`| ${b} | ${n} |`);
  }

  lines.push('', '## Common prefixes (grouped)');
  lines.push('', '| Prefix | Count |');
  lines.push('|--------|-------|');

  const sortedPrefixes = [...analysis.byPrefix.entries()].sort((a, b) => b[1] - a[1]);
  for (const [prefix, count] of sortedPrefixes.slice(0, 25)) {
    const safe = prefix.replace(/\|/g, '\\|');
    lines.push(`| ${safe} | ${count} |`);
  }

  lines.push('', '## Repeated phrases (occurrence count across all titles)');
  lines.push('', '| Phrase | Total occurrences |');
  lines.push('|--------|-------------------|');

  const sortedPhrases = [...analysis.phraseCounts.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  for (const [phrase, count] of sortedPhrases) {
    lines.push(`| ${phrase} | ${count} |`);
  }

  lines.push(
    '',
    '## Recommended shortening rules (consistent)',
    '',
    '1. **Already done:** CRA disapproval → "Disapproval of {name} rule on the {action}".',
    '2. **Already done:** Acronym substitution for known agencies (e.g. EPA, BLM).',
    '3. **Proposed:** Strip or shorten leading boilerplate (e.g. "A bill to" → "To"; "An act to provide for reconciliation pursuant to title II of H. Con. Res. X" → "Reconciliation pursuant to H. Con. Res. X").',
    '4. **Proposed:** Replace "United States Code" with "U.S.C." where it appears.',
    '5. **Proposed:** Optional max length with word-boundary truncation + ellipsis for UI display.',
    '6. **Proposed:** Apply same rule for all "Making appropriations for the fiscal year..." titles (e.g. shorten to "FY20XX Appropriations" where derivable).',
    ''
  );

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
}

function main(): void {
  const repoRoot = path.resolve(SITE_ROOT, '..', '..');
  const reportPath = path.join(repoRoot, 'docs', 'bill-title-shortening.md');

  if (!fs.existsSync(BILLS_DIR)) {
    console.error(`Bills directory not found: ${BILLS_DIR}`);
    console.error('Generate it first, e.g.: npm run site:bills:generate:hr (or build-from-cache).');
    const emptyReport = [
      '# Bill title shortening analysis',
      '',
      'No data. Generate bill data first:',
      '`npm run site:bills:generate:hr` (or other bill types) or `npm run site:bills:build-from-cache`.',
      '',
      'Data source: `packages/site/src/data/bills` (API only, no editorial).',
      '',
    ].join('\n');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, emptyReport, 'utf8');
    console.log(`Wrote empty report to ${reportPath}`);
    return;
  }

  const titles = collectAllTitles();
  const analysis = runAnalysis(titles);
  writeReport(titles, analysis, reportPath);
  console.log(`Analyzed ${titles.length} titles. Report written to ${reportPath}`);
}

main();
