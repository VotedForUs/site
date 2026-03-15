/**
 * Bill title utilities — pure business logic, no Astro collection API dependencies.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { cleanDisapprovalTitle } from './cleanDisapprovalTitle.js';
import { applyAcronyms, type AcronymEntry } from './applyAcronyms.js';
import { shortenBillTitleBoilerplate } from './shortenBillTitleBoilerplate.js';

function resolveSiteSrcDir(): string {
  const fromConfig = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(fromConfig, '..'),
    path.join(process.cwd(), 'packages', 'site', 'src'),
    path.join(process.cwd(), 'src'),
  ];
  const marker = path.join('data', 'bills');
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, marker))) return dir;
  }
  return path.join(fromConfig, '..');
}

const SITE_SRC_DIR = resolveSiteSrcDir();

const ACRONYMS_PATH = path.join(SITE_SRC_DIR, 'content', 'editorial', 'acronyms.json');
let cachedAcronyms: AcronymEntry[] | null = null;

export function getAcronyms(): AcronymEntry[] {
  if (cachedAcronyms) return cachedAcronyms;
  try {
    if (fs.existsSync(ACRONYMS_PATH)) {
      const data = JSON.parse(fs.readFileSync(ACRONYMS_PATH, 'utf8')) as { acronyms?: AcronymEntry[] };
      cachedAcronyms = Array.isArray(data?.acronyms) ? data.acronyms : [];
    } else {
      cachedAcronyms = [];
    }
  } catch {
    cachedAcronyms = [];
  }
  return cachedAcronyms;
}

/** Minimal bill shape for title resolution. */
export type BillForTitle = {
  title?: string;
  type?: string;
  number?: string;
  congress?: string | number;
  titles?: { titles?: Array<{ title?: string; titleType?: string; updateDate?: string }> };
};

const BILLS_DATA_DIR = () => path.join(SITE_SRC_DIR, 'data', 'bills');
const BILL_TITLES_DIR = () => path.join(SITE_SRC_DIR, 'content', 'editorial', 'bill-titles');

/**
 * Read the editorial title for a bill if the entry exists.
 * File: content/editorial/bill-titles/{congress}-{billType}-{number}.json → field: title
 */
export function getEditorialBillTitle(congress: string, billType: string, billNumber: string | number): string | undefined {
  const billId = `${congress}-${billType.toUpperCase()}-${billNumber}`;
  const p = path.join(BILL_TITLES_DIR(), `${billId}.json`);
  if (!fs.existsSync(p)) return undefined;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8')) as { title?: string };
    return typeof data.title === 'string' && data.title.trim() ? data.title.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Gets the best human-readable title for a bill.
 * Priority:
 * 1. Editorial bill title
 * 2. Popular Titles
 * 3. Newest Short Title
 * 4. Original bill.title
 */
export function getBestBillTitle(bill: BillForTitle): string {
  const defaultTitle = bill.title || 'Untitled Bill';
  const editorialTitle = bill.congress != null && bill.type != null && bill.number != null
    ? getEditorialBillTitle(String(bill.congress), bill.type.toLowerCase(), bill.number)
    : undefined;
  const pipe = (t: string) =>
    shortenBillTitleBoilerplate(applyAcronyms(cleanDisapprovalTitle(t), getAcronyms()));

  if (editorialTitle?.trim()) return pipe(editorialTitle.trim());
  if (!bill.titles?.titles || bill.titles.titles.length === 0) return pipe(defaultTitle);

  const titles = bill.titles.titles;
  const popularTitle = titles.find(t => t.titleType === 'Popular Titles');
  if (popularTitle?.title) return pipe(popularTitle.title);

  const shortTitles = titles.filter(t => t.titleType?.startsWith('Short Title'));
  if (shortTitles.length > 0) {
    const sortedShortTitles = shortTitles.sort((a, b) =>
      new Date(b.updateDate ?? 0).getTime() - new Date(a.updateDate ?? 0).getTime()
    );
    if (sortedShortTitles[0]?.title) return pipe(sortedShortTitles[0].title);
  }

  return pipe(defaultTitle);
}

/**
 * Returns the raw `title` field from the source bill JSON, bypassing computed/editorial overrides.
 */
export function getBillSourceTitle(congress: string | number, billType: string, billNumber: string | number): string | undefined {
  const p = path.join(BILLS_DATA_DIR(), String(congress), billType.toLowerCase(), `${billNumber}.json`);
  if (!fs.existsSync(p)) return undefined;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8')) as { title?: string };
    return typeof data.title === 'string' && data.title.trim() ? data.title.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns true if a bill-title editorial entry exists for the given billId.
 */
export function editorialBillTitleExists(billId: string): boolean {
  return fs.existsSync(path.join(BILL_TITLES_DIR(), `${billId}.json`));
}
