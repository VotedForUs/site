// 1. Import utilities from `astro:content`
import { defineCollection } from 'astro:content';
import type { Loader } from 'astro/loaders';

// 2. Import dependencies
import { fileURLToPath } from 'node:url';
import { z } from 'astro/zod';
import * as fs from 'fs';
import * as path from 'path';

import { legislatorSmallSchema, billWithActionsSchema, recordedVoteWithVotesSchema, recordedVoteSchema, changelogEntrySchema } from './types.zod';
import { getBestBillTitle } from './utils/billTitle.js';
import { normalizeLegislatorForCollection } from './utils/normalizeLegislatorForCollection.js';


// Re-export utility functions so existing imports from content.config continue to work
export { getBestBillTitle, getBillSourceTitle, editorialBillTitleExists } from './utils/billTitle.js';
export type { BillForTitle } from './utils/billTitle.js';
export { voteActionEntryExists, getEditorialVoteAction } from './utils/editorial.js';
export { cleanDisapprovalTitle } from './utils/cleanDisapprovalTitle.js';

import type { BillTitle, BillType, LegislatorSmall, RecordedVoteWithVotes } from '@votedforus/votes/types';

/**
 * Resolve site src directory so paths work regardless of process.cwd().
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
    if (fs.existsSync(path.join(dir, marker))) return dir;
  }
  return fromConfig;
}

const SITE_SRC_DIR = resolveSiteSrcDir();

// ─── Loader digest manifest ──────────────────────────────────────────────────
// We write our own manifest instead of relying on .astro/data-store.json (internal Astro API).
// The incremental-check script reads this file to determine changed entry IDs.

const LOADER_DIGESTS_PATH = path.join(process.cwd(), '.loader-digests.json');

type DigestManifest = Record<string, Record<string, string>>;

function readDigestManifest(): DigestManifest {
  try {
    return JSON.parse(fs.readFileSync(LOADER_DIGESTS_PATH, 'utf8')) as DigestManifest;
  } catch {
    return {};
  }
}

function writeDigestsToManifest(collectionName: string, digests: Record<string, string>): void {
  try {
    const manifest = readDigestManifest();
    manifest[collectionName] = digests;
    fs.writeFileSync(LOADER_DIGESTS_PATH, JSON.stringify(manifest, null, 2));
  } catch (error) {
    console.warn(`Warning: Could not write loader digest manifest:`, error);
  }
}

// ─── Source-file-backed loader helper ────────────────────────────────────────

/**
 * Creates a full Content Loader API loader that:
 * - Uses generateDigest per entry to skip unchanged entries (Tier 1 caching)
 * - Explicitly deletes removed entries (never calls store.clear())
 * - Writes a custom digest manifest for the incremental build system
 * - Hot-reloads on file changes in dev mode
 */
function makeFileLoader<T extends { id: string }>(
  name: string,
  loadEntries: () => T[],
): Loader {
  return {
    name,
    load: async ({ store, generateDigest, watcher, logger }) => {
      const entries = loadEntries();
      const currentIds = new Set<string>();
      const collectionDigests: Record<string, string> = {};
      let loaded = 0;
      let skipped = 0;

      for (const entry of entries) {
        const { id, ...data } = entry;
        currentIds.add(id);
        const digest = generateDigest(data);
        collectionDigests[id] = digest;

        if (store.get(id)?.digest === digest) {
          skipped++;
          continue;
        }
        store.set({ id, data: entry as Record<string, unknown>, digest });
        loaded++;
      }

      // Remove entries whose source files no longer exist — never call store.clear()
      for (const [id] of store.entries()) {
        if (!currentIds.has(id)) {
          store.delete(id);
        }
      }

      logger.info(`${name}: ${loaded} entries loaded, ${skipped} entries skipped`);
      writeDigestsToManifest(name, collectionDigests);

      if (watcher) {
        watcher.on('change', (p) => {
          if (p.startsWith(SITE_SRC_DIR)) {
            logger.info(`${name}: detected change at ${p}, reloading`);
          }
        });
      }
    },
  } satisfies Loader;
}

// ─── Bill data loading ────────────────────────────────────────────────────────

/**
 * Recorded vote schema for the recordedVotes collection
 */
const recordedVoteEntrySchema = recordedVoteWithVotesSchema.and(z.object({
  voteNumber: z.number(),
  billId: z.string(),
  billType: z.string(),
  billNumber: z.string(),
  billTitle: z.string(),
  actionDate: z.string(),
  actionText: z.string().optional(),
  finalChamberVote: z.boolean().optional(),
}));

/**
 * Legislator vote record schema
 */
const legislatorVoteEntrySchema = recordedVoteSchema.pick({
  chamber: true,
  congress: true,
  rollNumber: true,
}).extend({
  bioguideId: z.string(),
  voteId: z.string(),
  voteNumber: z.number(),
  vote: z.string(),
  billId: z.string(),
  billType: z.string(),
  billNumber: z.string(),
  billTitle: z.string(),
  actionDate: z.string(),
  question: z.string().optional(),
});

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

function loadAllBills(): { bills: Array<{ id: string; [key: string]: unknown }>; votes: VoteEntry[] } {
  const billsDataDir = path.join(SITE_SRC_DIR, 'data', 'bills');
  const allBills: Array<{ id: string; [key: string]: unknown }> = [];
  const allVotes: VoteEntry[] = [];
  if (!fs.existsSync(billsDataDir)) return { bills: allBills, votes: allVotes };

  const congressDirs = fs.readdirSync(billsDataDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d+$/.test(d.name))
    .map(d => d.name);

  for (const congress of congressDirs) {
    const congressPath = path.join(billsDataDir, congress);
    const billTypeDirs = fs.readdirSync(congressPath, { withFileTypes: true })
      .filter(d => d.isDirectory()).map(d => d.name);

    for (const billType of billTypeDirs) {
      const billTypePath = path.join(congressPath, billType);
      const files = fs.readdirSync(billTypePath).filter((f: string) => f.endsWith('.json'));

      for (const file of files) {
        try {
          const filePath = path.join(billTypePath, file);
          const bill = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const billId = bill.id ?? `${bill.congress}-${bill.type.toUpperCase()}-${bill.number}`;
          const title = getBestBillTitle(bill);
          allBills.push({ id: billId, ...bill, title });

          if (!bill.actions?.actions) continue;

          const billVotes: Array<{ vote: any; actionDate: string; actionText: string }> = [];
          for (const action of bill.actions.actions) {
            if (!action.recordedVotes) continue;
            for (const rv of action.recordedVotes) {
              billVotes.push({ vote: rv, actionDate: action.actionDate, actionText: action.text });
            }
          }
          billVotes.sort((a, b) =>
            new Date(a.vote.date || a.actionDate).getTime() -
            new Date(b.vote.date || b.actionDate).getTime()
          );

          const billHasFinalDisposition = (bill.actions?.actions ?? []).some((a: { type?: string }) => {
            const t = (a.type ?? '').toLowerCase();
            return t === 'becamelaw' || t === 'president';
          });
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
            const finalChamberVote = billHasFinalDisposition && (index === lastHouseIndex || index === lastSenateIndex);
            allVotes.push({
              id: voteId,
              voteNumber,
              billId,
              billType: bill.type,
              billNumber: bill.number,
              congress: bill.congress,
              billTitle: getBestBillTitle(bill),
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
              recordType: item.vote.recordType,
              membersAtAction: item.vote.membersAtAction,
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

let _cachedData: { bills: Array<{ id: string; [key: string]: unknown }>; votes: VoteEntry[] } | null = null;
function getCachedData() {
  if (!_cachedData) _cachedData = loadAllBills();
  return _cachedData;
}

// ─── Legislators loader helpers ───────────────────────────────────────────────

function loadLegislatorsFromDir(): LegislatorSmall[] {
  const dir = path.join(SITE_SRC_DIR, 'data', 'legislators');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.json'));
  const entries: LegislatorSmall[] = [];
  for (const file of files) {
    try {
      const leg = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Record<string, unknown>;
      const fromFile = file.replace(/\.json$/, '');
      const normalized = normalizeLegislatorForCollection(leg, fromFile);
      const slugId = normalized.bioguide;
      const parsed = legislatorSmallSchema.safeParse({ ...normalized, id: slugId });
      if (!parsed.success) {
        console.warn(`Warning: legislator ${file} failed schema:`, parsed.error.issues);
        continue;
      }
      entries.push(parsed.data);
    } catch (e) {
      console.warn(`Warning: Could not parse ${path.join(dir, file)}:`, e);
    }
  }
  return entries;
}

function loadChangelogEntries(): Array<{ id: string } & Record<string, unknown>> {
  const dir = path.join(SITE_SRC_DIR, 'data', 'changelog');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter((f: string) => f.endsWith('.json') && f !== 'changelog.json');
  const entries: Array<{ id: string } & Record<string, unknown>> = [];
  for (const file of files) {
    try {
      const entry = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Record<string, unknown>;
      entries.push({ id: path.basename(file, '.json'), ...entry });
    } catch (e) {
      console.warn(`Warning: Could not parse changelog entry ${file}:`, e);
    }
  }
  return entries;
}

// ─── Collections ─────────────────────────────────────────────────────────────

const bills = defineCollection({
  loader: makeFileLoader('bills-loader', () => getCachedData().bills),
  schema: billWithActionsSchema,
});

const recordedVotes = defineCollection({
  loader: makeFileLoader('recorded-votes-loader', () => getCachedData().votes),
  schema: recordedVoteEntrySchema,
});

const legislatorVotes = defineCollection({
  loader: makeFileLoader('legislator-votes-loader', () => {
    const { votes } = getCachedData();
    const entries: Array<{
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
        entries.push({
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
    return entries;
  }),
  schema: legislatorVoteEntrySchema,
});

const changelog = defineCollection({
  loader: makeFileLoader('changelog-loader', () => loadChangelogEntries()),
  schema: changelogEntrySchema,
});

const legislators = defineCollection({
  loader: makeFileLoader('legislators-loader', () => loadLegislatorsFromDir()),
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
