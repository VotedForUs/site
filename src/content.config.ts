// 1. Import utilities from `astro:content`
import { defineCollection } from 'astro:content';

// 2. Import dependencies
import { fileURLToPath } from 'node:url';
import { z } from 'astro/zod';
import * as fs from 'fs';
import * as path from 'path';

import { legislatorSmallSchema, billWithActionsSchema, recordedVoteWithVotesSchema, recordedVoteSchema, changelogEntrySchema } from './types.zod';

/**
 * Resolve site src directory so paths work regardless of process.cwd() (e.g. run from repo root or packages/site).
 * Tries: (1) dir of this config file, (2) cwd + packages/site/src, (3) cwd + src.
 */
function resolveSiteSrcDir(): string {
  const fromConfig = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    fromConfig,
    path.join(process.cwd(), 'packages', 'site', 'src'),
    path.join(process.cwd(), 'src'),
  ];
  const marker = path.join('data', 'bills');
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, marker))) {
      return dir;
    }
  }
  return fromConfig;
}

const SITE_SRC_DIR = resolveSiteSrcDir();

const ACRONYMS_PATH = path.join(SITE_SRC_DIR, 'content', 'editorial', 'acronyms.json');
let cachedAcronyms: AcronymEntry[] | null = null;

function getAcronyms(): AcronymEntry[] {
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

import { BILL_TYPES } from '@votedforus/votes/types';
import type { BillTitle, BillType, LegislatorSmall, RecordedVoteWithVotes } from '@votedforus/votes/types';
import { cleanDisapprovalTitle } from './utils/cleanDisapprovalTitle.js';
import { applyAcronyms, type AcronymEntry } from './utils/applyAcronyms.js';
import { shortenBillTitleBoilerplate } from './utils/shortenBillTitleBoilerplate.js';

export { cleanDisapprovalTitle } from './utils/cleanDisapprovalTitle.js';

/** Minimal bill shape for title resolution (API data or collection entry data). */
export type BillForTitle = {
  title?: string;
  type?: string;
  number?: string;
  congress?: string | number;
  titles?: { titles?: Array<{ title?: string; titleType?: string; updateDate?: string }> };
};

/**
 * Gets the best human-readable title for a bill
 * Priority:
 * 1. Editorial bill title (from the bill's editorial entry, if it exists)
 * 2. Popular Titles (if exists)
 * 3. Newest Short Title (titleType starts with "Short Title")
 * 4. Original bill.title
 * The result is passed through cleanDisapprovalTitle for shortening disapproval titles.
 *
 * @param bill - Bill object with title, type, number, and optional titles.titles array
 * @returns The best title string
 */
export function getBestBillTitle(bill: BillForTitle): string {
  const defaultTitle = bill.title || 'Untitled Bill';

  const editorialTitle = bill.congress != null && bill.type != null && bill.number != null
    ? getEditorialBillTitle(String(bill.congress), bill.type.toLowerCase(), bill.number)
    : undefined;
  const pipe = (t: string) =>
    shortenBillTitleBoilerplate(applyAcronyms(cleanDisapprovalTitle(t), getAcronyms()));

  if (editorialTitle?.trim()) {
    return pipe(editorialTitle.trim());
  }

  if (!bill.titles?.titles || bill.titles.titles.length === 0) {
    return pipe(defaultTitle);
  }

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

const VOTE_ACTIONS_DIR = () => path.join(SITE_SRC_DIR, 'content', 'editorial', 'vote-actions');

/**
 * Returns true if a vote-action editorial entry exists for the given voteId.
 * File: content/editorial/vote-actions/{voteId}.json
 */
export function voteActionEntryExists(voteId: string): boolean {
  return fs.existsSync(path.join(VOTE_ACTIONS_DIR(), `${voteId}.json`));
}

/**
 * Returns the editorial action string for a vote if one exists, otherwise undefined.
 * File: content/editorial/vote-actions/{voteId}.json → field: action
 */
export function getEditorialVoteAction(voteId: string): string | undefined {
  const p = path.join(VOTE_ACTIONS_DIR(), `${voteId}.json`);
  if (!fs.existsSync(p)) return undefined;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8')) as { action?: string };
    return typeof data.action === 'string' && data.action.trim() ? data.action.trim() : undefined;
  } catch {
    return undefined;
  }
}

const BILLS_DATA_DIR = () => path.join(SITE_SRC_DIR, 'data', 'bills');

/**
 * Returns the raw `title` field from the source bill JSON, bypassing any computed/editorial overrides.
 * Used to display "Original title" when getBestBillTitle returns a different value.
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

const BILL_TITLES_DIR = () => path.join(SITE_SRC_DIR, 'content', 'editorial', 'bill-titles');

/**
 * Returns true if a bill-title editorial entry exists for the given billId.
 * File: content/editorial/bill-titles/{billId}.json
 */
export function editorialBillTitleExists(billId: string): boolean {
  return fs.existsSync(path.join(BILL_TITLES_DIR(), `${billId}.json`));
}

/**
 * Read the editorial title for a bill if the entry exists.
 * File: content/editorial/bill-titles/{congress}-{billType}-{number}.json → field: title
 */
function getEditorialBillTitle(congress: string, billType: string, billNumber: string | number): string | undefined {
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
 * Single bills collection: reads from src/data/bills/{congress}/{billType}/*.json
 * Entry id = BillWithActions['id'] = {congress}-{TYPE}-{number}
 */
const bills = defineCollection({
  loader: () => {
    const billsDataDir = path.join(SITE_SRC_DIR, 'data', 'bills');
    if (!fs.existsSync(billsDataDir)) {
      return [];
    }
    const entries: { id: string; [key: string]: unknown }[] = [];
    const congressDirs = fs.readdirSync(billsDataDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^\d+$/.test(d.name))
      .map(d => d.name);
    for (const congress of congressDirs) {
      const congressPath = path.join(billsDataDir, congress);
      const billTypeDirs = fs.readdirSync(congressPath, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      for (const billType of billTypeDirs) {
        const billTypePath = path.join(congressPath, billType);
        const files = fs.readdirSync(billTypePath).filter((f: string) => f.endsWith('.json'));
        for (const file of files) {
          const filePath = path.join(billTypePath, file);
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const bill = JSON.parse(content);
            const id = bill.id ?? `${bill.congress}-${bill.type.toUpperCase()}-${bill.number}`;
            const title = getBestBillTitle(bill);
            entries.push({ id, ...bill, title });
          } catch (e) {
            console.warn(`Warning: Could not parse ${filePath}:`, e);
          }
        }
      }
    }
    return entries;
  },
  schema: billWithActionsSchema,
});

/**
 * Recorded vote schema for the recordedVotes collection
 * Extends recordedVoteWithVotesSchema with bill reference and action context
 */
const recordedVoteEntrySchema = recordedVoteWithVotesSchema.and(z.object({
  // Vote identification (unique per bill)
  voteNumber: z.number(),
  // Bill reference
  billId: z.string(),
  billType: z.string(),
  billNumber: z.string(),
  billTitle: z.string(),
  // Action context
  actionDate: z.string(),
  actionText: z.string().optional(),
  // True when this is the final vote in its chamber before the bill had a final disposition (BecameLaw/President)
  finalChamberVote: z.boolean().optional(),
}));

/**
 * Legislator vote record schema
 * Uses recordedVoteSchema.pick() for chamber, congress, and rollNumber
 */
const legislatorVoteEntrySchema = recordedVoteSchema.pick({
  chamber: true,
  congress: true,
  rollNumber: true,
}).extend({
  // Legislator reference
  bioguideId: z.string(),
  // Vote reference
  voteId: z.string(),
  voteNumber: z.number(),
  // The actual vote cast
  vote: z.string(),
  // Bill info for convenience
  billId: z.string(),
  billType: z.string(),
  billNumber: z.string(),
  billTitle: z.string(),
  // Vote context
  actionDate: z.string(),
  question: z.string().optional(),
});

/**
 * Type for vote entries used in collections
 * Extends RecordedVoteWithVotes with bill reference and action context
 */
interface VoteEntry extends RecordedVoteWithVotes {
  id: string;
  voteNumber: number;
  billId: string;
  billType: string;
  billNumber: string;
  billTitle: string;
  actionDate: string;
  actionText?: string;
  finalChamberVote?: boolean;
}

/**
 * Read all bill JSON files from src/data/bills/{congress}/{billType}/ and extract recorded votes
 * Vote id uses recordedVote.id when present (format 119-HR-1-1, 1-based), else fallback to billId-voteNumber
 */
function loadAllBills(): { bills: any[]; votes: VoteEntry[] } {
  const billsDataDir = path.join(SITE_SRC_DIR, 'data', 'bills');
  const allBills: any[] = [];
  const allVotes: VoteEntry[] = [];
  if (!fs.existsSync(billsDataDir)) {
    return { bills: allBills, votes: allVotes };
  }
  const congressDirs = fs.readdirSync(billsDataDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d+$/.test(d.name))
    .map(d => d.name);
  for (const congress of congressDirs) {
    const congressPath = path.join(billsDataDir, congress);
    const billTypeDirs = fs.readdirSync(congressPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    for (const billType of billTypeDirs) {
      const billTypePath = path.join(congressPath, billType);
      const files = fs.readdirSync(billTypePath).filter((f: string) => f.endsWith('.json'));
      for (const file of files) {
        try {
          const filePath = path.join(billTypePath, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const bill = JSON.parse(content);
          const billId = bill.id ?? `${bill.congress}-${bill.type.toUpperCase()}-${bill.number}`;
          allBills.push({ ...bill, id: billId });
          if (!bill.actions?.actions) continue;
          const billVotes: Array<{ vote: any; actionDate: string; actionText: string }> = [];
          for (const action of bill.actions.actions) {
            if (!action.recordedVotes) continue;
            for (const recordedVote of action.recordedVotes) {
              billVotes.push({
                vote: recordedVote,
                actionDate: action.actionDate,
                actionText: action.text,
              });
            }
          }
          billVotes.sort((a, b) =>
            new Date(a.vote.date || a.actionDate).getTime() -
            new Date(b.vote.date || b.actionDate).getTime()
          );
          const billActions = bill.actions?.actions ?? [];
          const billHasFinalDisposition = billActions.some((a: { type?: string }) => {
            const t = (a.type ?? '').toLowerCase();
            return t === 'becamelaw' || t === 'president';
          });
          // Index of the final vote in each chamber (chronologically last in that chamber before law)
          let lastHouseIndex = -1;
          let lastSenateIndex = -1;
          for (let i = billVotes.length - 1; i >= 0; i--) {
            const ch = (billVotes[i].vote.chamber ?? '').toLowerCase();
            if (ch === 'house' && lastHouseIndex < 0) lastHouseIndex = i;
            if (ch === 'senate' && lastSenateIndex < 0) lastSenateIndex = i;
          }
          billVotes.forEach((item, index) => {
            const idSuffix = item.vote.id?.split('-').pop();
            const voteNumber = idSuffix != null && Number(idSuffix) ? Number(idSuffix) : index + 1;
            const voteId = item.vote.id ?? `${billId}-${voteNumber}`;
            const bestTitle = getBestBillTitle(bill);
            const finalChamberVote = billHasFinalDisposition && (index === lastHouseIndex || index === lastSenateIndex);
            allVotes.push({
              id: voteId,
              voteNumber,
              billId,
              billType: bill.type,
              billNumber: bill.number,
              congress: bill.congress,
              billTitle: bestTitle,
              chamber: item.vote.chamber,
              date: item.vote.date,
              rollNumber: item.vote.rollNumber,
              sessionNumber: item.vote.sessionNumber,
              url: item.vote.url,
              votes: item.vote.votes,
              result: item.vote.result,
              senateCount: item.vote.senateCount,
              votePartyTotal: item.vote.votePartyTotal,
              voteUrl: item.vote.voteUrl,
              question: item.vote.question,
              actionDate: item.actionDate,
              actionText: item.actionText,
              finalChamberVote,
            });
          });
        } catch (e) {
          console.warn(`Warning: Could not parse ${path.join(billTypePath, file)}:`, e);
        }
      }
    }
  }
  return { bills: allBills, votes: allVotes };
}

// Load data once for use by multiple collections
let _cachedData: { bills: any[]; votes: VoteEntry[] } | null = null;

function getCachedData() {
  if (!_cachedData) {
    _cachedData = loadAllBills();
  }
  return _cachedData;
}

/**
 * Custom loader for recorded votes collection
 * Creates entries with ID format: {congress}-{TYPE}-{number}-{voteNumber}
 * voteNumber increments from 1, oldest votes first
 */
const recordedVotes = defineCollection({
  loader: () => {
    const { votes } = getCachedData();
    return votes;
  },
  schema: recordedVoteEntrySchema,
});

/**
 * Custom loader for legislator votes collection
 * Creates entries for each legislator's vote
 * ID format: {bioguideId}-{voteId}
 */
const legislatorVotes = defineCollection({
  loader: () => {
    const { votes } = getCachedData();
    const legislatorVoteEntries: Array<{
      id: string;
      bioguideId: string;
      voteId: string;
      voteNumber: number;
      vote: string;
      billId: string;
      billType: string;
      billNumber: string;
      congress: number;
      billTitle: string;
      actionDate: string;
      rollNumber: number;
      chamber: string;
      question?: string;
    }> = [];
    
    for (const voteEntry of votes) {
      if (!voteEntry.votes) continue;
      
      for (const [bioguideId, vote] of Object.entries(voteEntry.votes)) {
        legislatorVoteEntries.push({
          id: `${bioguideId}-${voteEntry.id}`,
          bioguideId,
          voteId: voteEntry.id,
          voteNumber: voteEntry.voteNumber,
          vote,
          billId: voteEntry.billId,
          billType: voteEntry.billType,
          billNumber: voteEntry.billNumber,
          congress: voteEntry.congress,
          billTitle: voteEntry.billTitle,
          actionDate: voteEntry.actionDate,
          rollNumber: voteEntry.rollNumber,
          chamber: voteEntry.chamber,
          question: voteEntry.question,
        });
      }
    }
    
    return legislatorVoteEntries;
  },
  schema: legislatorVoteEntrySchema,
});

// 4. Define your collection(s) — legislators from src/data/legislators/[bioguideid].json
function loadLegislatorsFromDir(): LegislatorSmall[] {
  const dir = path.join(SITE_SRC_DIR, 'data', 'legislators');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.json'));
  const entries: LegislatorSmall[] = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      const leg = JSON.parse(content);
      const id = leg.bioguide ?? leg.id ?? file.replace(/\.json$/, '');
      entries.push({ id, ...leg });
    } catch (e) {
      console.warn(`Warning: Could not parse ${path.join(dir, file)}:`, e);
    }
  }
  return entries;
}

/**
 * Load all per-run changelog entries from src/data/changelog/.
 * Excludes the accumulated changelog.json (exact filename match).
 * ID is derived from the filename: {date}-{runId}
 */
function loadChangelogEntries(): Array<{ id: string } & Record<string, unknown>> {
  const dir = path.join(SITE_SRC_DIR, 'data', 'changelog');
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f: string) => f.endsWith('.json') && f !== 'changelog.json');
  const entries: Array<{ id: string } & Record<string, unknown>> = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      const entry = JSON.parse(content) as Record<string, unknown>;
      const id = path.basename(file, '.json');
      entries.push({ id, ...entry });
    } catch (e) {
      console.warn(`Warning: Could not parse changelog entry ${file}:`, e);
    }
  }
  return entries;
}

const changelog = defineCollection({
  loader: () => loadChangelogEntries(),
  schema: changelogEntrySchema,
});

const legislators = defineCollection({
  loader: () => loadLegislatorsFromDir(),
  schema: legislatorSmallSchema,
});

const senators = defineCollection({
  loader: () => {
    const data = loadLegislatorsFromDir().filter((e: LegislatorSmall) => e?.type === 'sen');
    return data.sort((a: LegislatorSmall, b: LegislatorSmall) => {
      const stateCompare = (a?.state ?? '').localeCompare(b?.state ?? '');
      if (stateCompare !== 0) return stateCompare;
      return (a?.name ?? '').localeCompare(b?.name ?? '');
    });
  },
  schema: legislatorSmallSchema,
});

const representatives = defineCollection({
  loader: () => {
    const data = loadLegislatorsFromDir().filter((e: LegislatorSmall) => e?.type === 'rep');
    return data.sort((a: LegislatorSmall, b: LegislatorSmall) => {
      const stateCompare = (a?.state ?? '').localeCompare(b?.state ?? '');
      if (stateCompare !== 0) return stateCompare;
      return ((a?.district ?? 0) as number) - ((b?.district ?? 0) as number);
    });
  },
  schema: legislatorSmallSchema,
});

// 5. Export a single `collections` object to register your collection(s)
export const collections = {
  changelog,
  legislators,
  senators,
  representatives,
  bills,
  recordedVotes,
  legislatorVotes,
};

// Re-export types for use in pages
export type { BillType, BillTitle };

// Export the entry schemas for use in components
export { recordedVoteEntrySchema, legislatorVoteEntrySchema };
