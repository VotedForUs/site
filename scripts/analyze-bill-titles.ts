/**
 * Analyzes bill titles from `src/data/bills` (API only, no editorial) and
 * writes `docs/bill-title-shortening.md`: how long the titles are, which
 * prefixes and phrases repeat, and so which shortening rules would pay.
 *
 * Effective title = best of Popular / Short Title / bill.title, then
 * cleanDisapprovalTitle, applyAcronyms and shortenBillTitleBoilerplate.
 *
 * ```bash
 * npm run analyze-bill-titles
 * ```
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanDisapprovalTitle } from '../src/utils/cleanDisapprovalTitle.js';
import { applyAcronyms, type AcronymEntry } from '../src/utils/applyAcronyms.js';
import { shortenBillTitleBoilerplate } from '../src/utils/shortenBillTitleBoilerplate.js';

const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BILLS_DIR = path.join(SITE_ROOT, 'src', 'data', 'bills');
const ACRONYMS_PATH = path.join(SITE_ROOT, 'src', 'content', 'editorial', 'acronyms.json');
const REPORT_PATH = path.join(SITE_ROOT, 'docs', 'bill-title-shortening.md');

export type BillTitleEntry = { title?: string; titleType?: string; updateDate?: string };
export type BillFromData = {
  title?: string;
  titles?: { titles?: BillTitleEntry[] };
};

/** What one run counted. */
export type TitleAnalysis = {
  total: number;
  unique: number;
  byPrefix: Map<string, number>;
  phraseCounts: Map<string, number>;
  lengthBuckets: Map<string, number>;
};

/**
 * The editorial acronym list, or none when the file is missing or unreadable.
 *
 * @param file - `acronyms.json`
 * @returns Acronym entries
 */
export function loadAcronyms(file = ACRONYMS_PATH): AcronymEntry[] {
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { acronyms?: AcronymEntry[] };
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
export function getEffectiveTitleFromApiOnly(bill: BillFromData): string {
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

/**
 * The effective title of every bill file under a bills directory.
 *
 * @param billsDir - `src/data/bills`
 * @param acronyms - Acronyms to substitute
 * @returns One cleaned title per readable bill file
 */
export function collectAllTitles(billsDir = BILLS_DIR, acronyms: AcronymEntry[] = loadAcronyms()): string[] {
  const out: string[] = [];
  if (!fs.existsSync(billsDir)) return out;

  const congressDirs = fs.readdirSync(billsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
    .map((d) => d.name);

  for (const congress of congressDirs) {
    const congressPath = path.join(billsDir, congress);
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

/** The known boilerplate prefix a title opens with, else its first four words. */
export function getPrefix(title: string): string {
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

/** How many times a phrase occurs in a title, case-insensitively. */
export function countPhrase(title: string, phrase: string): number {
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

/** The length bucket a title of `len` characters falls in. */
export function lengthBucket(len: number): string {
  return len <= 50 ? '1–50' : len <= 100 ? '51–100' : len <= 150 ? '101–150' : len <= 200 ? '151–200' : '200+';
}

/**
 * Count prefixes, repeated phrases and lengths across a set of titles.
 *
 * @param titles - Effective titles
 * @returns The counts
 */
export function runAnalysis(titles: string[]): TitleAnalysis {
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

    const bucket = lengthBucket(t.length);
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

/**
 * The report, as Markdown.
 *
 * @param analysis - Output of {@link runAnalysis}
 * @returns The report's text
 */
export function renderReport(analysis: TitleAnalysis): string {
  const lines: string[] = [
    '# Bill title shortening analysis',
    '',
    'Data source: `src/data/bills` (API only, no editorial).',
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

  return lines.join('\n');
}

/** The report written when there is no bill data to analyze. */
export const EMPTY_REPORT = [
  '# Bill title shortening analysis',
  '',
  'No data. Generate bill data first: `npm run voted-bills-sync:generate` or `npm run build-from-cache`.',
  '',
  'Data source: `src/data/bills` (API only, no editorial).',
  '',
].join('\n');

/**
 * Analyze every bill title and write the report.
 *
 * @param options.billsDir - `src/data/bills`
 * @param options.reportPath - Where the Markdown report goes
 * @param options.acronyms - Acronyms to substitute
 * @returns How many titles were analyzed, and where the report was written
 */
export function analyzeBillTitles(options: {
  billsDir?: string;
  reportPath?: string;
  acronyms?: AcronymEntry[];
} = {}): { titles: number; reportPath: string; empty: boolean } {
  const billsDir = options.billsDir ?? BILLS_DIR;
  const reportPath = options.reportPath ?? REPORT_PATH;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  if (!fs.existsSync(billsDir)) {
    fs.writeFileSync(reportPath, EMPTY_REPORT, 'utf8');
    return { titles: 0, reportPath, empty: true };
  }
  const titles = collectAllTitles(billsDir, options.acronyms ?? loadAcronyms());
  fs.writeFileSync(reportPath, renderReport(runAnalysis(titles)), 'utf8');
  return { titles: titles.length, reportPath, empty: false };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const result = analyzeBillTitles();
  if (result.empty) {
    console.error(`Bills directory not found: ${BILLS_DIR}`);
    console.log(`Wrote empty report to ${result.reportPath}`);
  } else {
    console.log(`Analyzed ${result.titles} titles. Report written to ${result.reportPath}`);
  }
}
