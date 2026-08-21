/**
 * Loads legislator vote and legislator rows from on-disk JSON for non-Astro contexts
 * (Storybook, tests). Mirrors the `legislatorVotes` and `legislators` collections.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBestBillTitle } from './billTitle.js';
import { normalizeLegislatorForCollection } from './normalizeLegislatorForCollection.js';
import {
  resolveLegislatorVoteViewWithSources,
  type LegislatorVoteLegislatorSource,
  type LegislatorVoteRecord,
  type ResolveLegislatorVoteResult,
} from './legislatorVoteView.js';
import { legislatorSmallSchema } from '../types.zod.js';

const SITE_SRC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let legislatorVoteIndex: Map<string, LegislatorVoteRecord> | null = null;

/**
 * Builds the `${bioguideId}-${voteId}` index from bill JSON on disk.
 *
 * @returns Map keyed by legislator vote collection id.
 */
function getLegislatorVoteIndex(): Map<string, LegislatorVoteRecord> {
  if (legislatorVoteIndex) return legislatorVoteIndex;

  const index = new Map<string, LegislatorVoteRecord>();
  const billsDataDir = path.join(SITE_SRC_DIR, 'data', 'bills');
  if (!fs.existsSync(billsDataDir)) {
    legislatorVoteIndex = index;
    return index;
  }

  const congressDirs = fs.readdirSync(billsDataDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
    .map((d) => d.name);

  for (const congress of congressDirs) {
    const congressPath = path.join(billsDataDir, congress);
    const billTypeDirs = fs.readdirSync(congressPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const billType of billTypeDirs) {
      const billTypePath = path.join(congressPath, billType);
      const files = fs.readdirSync(billTypePath).filter((f) => f.endsWith('.json'));

      for (const file of files) {
        try {
          const bill = JSON.parse(fs.readFileSync(path.join(billTypePath, file), 'utf8')) as {
            id?: string;
            congress?: number;
            type?: string;
            number?: string;
            actions?: { actions?: Array<{ actionDate?: string; recordedVotes?: Array<Record<string, unknown>> }> };
          };
          const billId = bill.id ?? `${bill.congress}-${bill.type?.toUpperCase()}-${bill.number}`;
          const billTitle = getBestBillTitle(bill);
          const actions = bill.actions?.actions ?? [];

          const billVotes: Array<{ vote: Record<string, unknown>; actionDate: string }> = [];
          for (const action of actions) {
            if (!action.recordedVotes) continue;
            for (const rv of action.recordedVotes) {
              billVotes.push({ vote: rv, actionDate: action.actionDate ?? '' });
            }
          }

          billVotes.sort(
            (a, b) =>
              new Date(String(a.vote.date ?? a.actionDate)).getTime() -
              new Date(String(b.vote.date ?? b.actionDate)).getTime(),
          );

          billVotes.forEach((item, actionIndex) => {
            const vote = item.vote;
            const voteIdSuffix = typeof vote.id === 'string' ? vote.id.split('-').pop() : undefined;
            const voteNumber =
              voteIdSuffix != null && Number(voteIdSuffix) ? Number(voteIdSuffix) : actionIndex + 1;
            const voteId = typeof vote.id === 'string' ? vote.id : `${billId}-${voteNumber}`;
            const memberVotes = vote.votes;
            if (!memberVotes || typeof memberVotes !== 'object') return;

            for (const [bioguideId, cast] of Object.entries(memberVotes)) {
              if (typeof cast !== 'string') continue;
              index.set(`${bioguideId}-${voteId}`, {
                bioguideId,
                voteId,
                vote: cast,
                billId,
                billType: bill.type ?? billType.toUpperCase(),
                billNumber: String(bill.number ?? ''),
                billTitle,
                actionDate: item.actionDate,
                rollNumber: Number(vote.rollNumber ?? 0),
                chamber: String(vote.chamber ?? ''),
                question: typeof vote.question === 'string' ? vote.question : undefined,
              });
            }
          });
        } catch {
          // Skip malformed bill files in dev/storybook contexts.
        }
      }
    }
  }

  legislatorVoteIndex = index;
  return index;
}

/**
 * Loads one legislator record from `src/data/legislators`.
 *
 * @param bioguideId - Legislator bioguide id.
 * @returns Normalized legislator fields, or `undefined` when missing.
 */
function loadLegislatorFromFile(bioguideId: string): LegislatorVoteLegislatorSource | undefined {
  const filePath = path.join(SITE_SRC_DIR, 'data', 'legislators', `${bioguideId}.json`);
  if (!fs.existsSync(filePath)) return undefined;

  try {
    const leg = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    const normalized = normalizeLegislatorForCollection(leg, bioguideId);
    const parsed = legislatorSmallSchema.safeParse({ ...normalized, id: bioguideId });
    if (!parsed.success) return undefined;
    return parsed.data;
  } catch {
    return undefined;
  }
}

/**
 * Resolves a legislator vote view from on-disk JSON (no Astro content layer).
 *
 * @param params - Vote and legislator ids.
 * @returns Discriminated union with the view or a failure reason.
 */
export async function resolveLegislatorVoteViewFromFiles(
  params: { voteId: string; bioguideId: string },
): Promise<ResolveLegislatorVoteResult> {
  const index = getLegislatorVoteIndex();

  return resolveLegislatorVoteViewWithSources(params, {
    getLegislatorVote: async (id) => index.get(id),
    getLegislator: async (bioguideId) => loadLegislatorFromFile(bioguideId),
  });
}

/**
 * Clears cached vote index (for tests).
 */
export function clearLegislatorVoteFileIndexCache(): void {
  legislatorVoteIndex = null;
}
