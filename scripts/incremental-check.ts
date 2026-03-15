/**
 * @file incremental-check.ts
 * @description Pre-build incremental check script for the VotedFor.Us site.
 *
 * Computes SHA-256 hashes of source data files (bills, legislators) directly —
 * independently of Astro's content loaders — and compares them with the
 * manifest saved at the end of the previous build
 * (`dist-cache/.astro-manifest.json`).
 *
 * **Why file hashes instead of loader digests?**
 * Astro's content loaders write `.loader-digests.json` *during* `astro build`.
 * Running a pre-build comparison against that file would always see identical
 * values (both sides reflect the previous build's state), detecting zero
 * changes every time. By hashing source files directly before the build starts,
 * this script sees the *current* state of `src/data/` and can accurately diff
 * it against what was hashed when the last build completed.
 *
 * **Build flow (local or CI):**
 * ```
 * tsx scripts/incremental-check.ts   ← writes .current-digests.json + .build-manifest.json
 * astro build                        ← getStaticPaths reads .build-manifest.json
 * rsync -a --ignore-existing dist-cache/ dist/   ← restore unchanged cached pages
 * cp .current-digests.json dist-cache/.astro-manifest.json  ← save for next run
 * ```
 *
 * **Environment variables:**
 * - `FORCE_FULL_REBUILD=true` — deletes `.build-manifest.json` so `getStaticPaths`
 *   falls back to building every page. Use after layout/component changes.
 *
 * @see {@link https://github.com/VotedForUs/site/blob/main/scripts/INCREMENTAL-BUILD.md}
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DATA_DIR = path.join(ROOT, 'src', 'data');
const DIST_CACHE_DIR = path.join(ROOT, 'dist-cache');
const PREVIOUS_MANIFEST_PATH = path.join(DIST_CACHE_DIR, '.astro-manifest.json');
const CURRENT_DIGESTS_PATH = path.join(ROOT, '.current-digests.json');
const BUILD_MANIFEST_PATH = path.join(ROOT, 'src', 'data', '.build-manifest.json');

/**
 * A map from an entry ID (e.g. bill ID or bioguide ID) to its SHA-256 hash.
 * Used to detect content changes between builds.
 */
export type DigestMap = Record<string, string>;

/**
 * The manifest written to `.current-digests.json` after each build.
 * Saved to `dist-cache/.astro-manifest.json` post-build and read back
 * by the next run's incremental check as the "previous" baseline.
 */
export type SourceDigestManifest = {
  /** Bill digests keyed by bill ID (`{congress}-{TYPE}-{number}`). */
  bills: DigestMap;
  /** Legislator digests keyed by bioguide ID. */
  legislators: DigestMap;
};

/**
 * Written to `src/data/.build-manifest.json` and consumed by every
 * `getStaticPaths` function at build time.
 *
 * - `changedIds` — per-collection arrays of entry IDs that need their pages
 *   rebuilt. An absent collection key means "treat all entries as changed"
 *   (new collection). An empty array means "nothing changed — skip all".
 * - `deletedIds` — entry IDs whose source files no longer exist. These must
 *   be excluded from the `rsync` merge so stale cached pages are not served.
 */
export interface BuildManifest {
  changedIds: Record<string, string[]>;
  deletedIds: Record<string, string[]>;
}

/**
 * Returns the SHA-256 hex digest of the given string or Buffer.
 *
 * @param content - Raw file content or any Buffer to hash.
 * @returns 64-character lowercase hex string.
 */
export function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Reads and JSON-parses a file, returning `null` on any error (missing file,
 * permission denied, malformed JSON, etc.).
 *
 * @param filePath - Absolute path to the JSON file.
 * @returns Parsed value typed as `T`, or `null`.
 */
export function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Walks `{srcDataDir}/bills/{congress}/{billType}/{number}.json` and returns
 * a `DigestMap` keyed by bill ID.
 *
 * Bill ID is taken from `bill.id` in the JSON; if absent, it is constructed
 * as `{congress}-{BILLTYPE}-{number}` from the directory and file name.
 *
 * @param srcDataDir - Root of the `src/data` directory. Defaults to the
 *   project's own `src/data` directory. Override in tests to use a temp dir.
 * @returns Map of `{ billId: sha256(fileContent) }`.
 */
export function computeBillDigests(srcDataDir: string = SRC_DATA_DIR): DigestMap {
  const billsDir = path.join(srcDataDir, 'bills');
  const digests: DigestMap = {};
  if (!fs.existsSync(billsDir)) return digests;

  for (const congress of fs.readdirSync(billsDir)) {
    const congressPath = path.join(billsDir, congress);
    if (!fs.statSync(congressPath).isDirectory()) continue;

    for (const billType of fs.readdirSync(congressPath)) {
      const billTypePath = path.join(congressPath, billType);
      if (!fs.statSync(billTypePath).isDirectory()) continue;

      for (const file of fs.readdirSync(billTypePath)) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(billTypePath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        try {
          const bill = JSON.parse(content);
          const billNumber = path.basename(file, '.json');
          const billId: string =
            bill.id ?? `${congress}-${billType.toUpperCase()}-${billNumber}`;
          digests[billId] = sha256(content);
        } catch {
          const billNumber = path.basename(file, '.json');
          digests[`${congress}-${billType.toUpperCase()}-${billNumber}`] = sha256(content);
        }
      }
    }
  }
  return digests;
}

/**
 * Walks `{srcDataDir}/legislators/{bioguide}.json` and returns a `DigestMap`
 * keyed by bioguide ID.
 *
 * The key is resolved in order: `leg.bioguide` → `leg.id` → filename
 * (without `.json`).
 *
 * @param srcDataDir - Root of the `src/data` directory. Defaults to the
 *   project's own `src/data` directory. Override in tests to use a temp dir.
 * @returns Map of `{ bioguideId: sha256(fileContent) }`.
 */
export function computeLegislatorDigests(srcDataDir: string = SRC_DATA_DIR): DigestMap {
  const legDir = path.join(srcDataDir, 'legislators');
  const digests: DigestMap = {};
  if (!fs.existsSync(legDir)) return digests;

  for (const file of fs.readdirSync(legDir)) {
    if (!file.endsWith('.json')) continue;
    const filePath = path.join(legDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    try {
      const leg = JSON.parse(content);
      const id: string = leg.bioguide ?? leg.id ?? path.basename(file, '.json');
      digests[id] = sha256(content);
    } catch {
      digests[path.basename(file, '.json')] = sha256(content);
    }
  }
  return digests;
}

/**
 * Diffs two `DigestMap`s and returns which entry IDs changed or were deleted.
 *
 * - An entry is **changed** if it is new (not in `previous`) or its hash
 *   differs from the previous hash.
 * - An entry is **deleted** if it existed in `previous` but is absent from
 *   `current`.
 * - When `previous` is `undefined` (no prior build), every entry in `current`
 *   is treated as changed and nothing is deleted.
 *
 * @param current - Digests computed from the current source files.
 * @param previous - Digests from the previous build manifest, or `undefined`
 *   if no previous manifest exists.
 * @returns `{ changed: string[], deleted: string[] }`.
 */
export function getChangedAndDeleted(
  current: DigestMap,
  previous: DigestMap | undefined,
): { changed: string[]; deleted: string[] } {
  const changed: string[] = [];
  const deleted: string[] = [];

  for (const [id, hash] of Object.entries(current)) {
    if (!previous || previous[id] !== hash) {
      changed.push(id);
    }
  }

  if (previous) {
    for (const id of Object.keys(previous)) {
      if (!(id in current)) deleted.push(id);
    }
  }

  return { changed, deleted };
}

/**
 * Derives the IDs of all `recordedVotes`, `legislatorVotes`, and `legislators`
 * collection entries that must be rebuilt because a parent bill file changed.
 *
 * **Dependency graph:**
 * ```
 * changed bill file
 *   → recordedVote IDs   (from actions.actions[].recordedVotes[].id)
 *     → legislatorVote IDs  ({bioguideId}-{voteId})
 *       → legislator IDs    (bioguideId, de-duplicated)
 * ```
 *
 * For deleted bills the file no longer exists, so only the bill-level wildcard
 * `{billId}-*` is recorded in `deletedRecordedVotes`. The `rsync` post-build
 * merge is responsible for pruning stale pages; `getStaticPaths` will simply
 * not produce paths for deleted bills.
 *
 * @param changedBillIds - Bill IDs whose source files changed this run.
 * @param deletedBillIds - Bill IDs whose source files were removed this run.
 * @param srcDataDir - Root of `src/data`. Defaults to the project's own
 *   directory; override in tests.
 */
export function cascadeFromChangedBills(
  changedBillIds: string[],
  deletedBillIds: string[],
  srcDataDir: string = SRC_DATA_DIR,
): {
  changedRecordedVotes: string[];
  deletedRecordedVotes: string[];
  changedLegislatorVotes: string[];
  deletedLegislatorVotes: string[];
  cascadedLegislators: string[];
} {
  const changedRecordedVotes: string[] = [];
  const deletedRecordedVotes: string[] = [];
  const changedLegislatorVotes: string[] = [];
  const deletedLegislatorVotes: string[] = [];
  const cascadedLegislators = new Set<string>();

  /**
   * Parses a bill file and extracts all recordedVote IDs, legislatorVote IDs,
   * and legislator bioguide IDs embedded in its actions.
   */
  function extractVotesFromBillId(billId: string): {
    rvIds: string[];
    lvIds: string[];
    legislators: string[];
  } {
    // Bill ID format: {congress}-{TYPE}-{number}
    const parts = billId.split('-');
    if (parts.length < 3) return { rvIds: [], lvIds: [], legislators: [] };
    const [congress, billType, ...numberParts] = parts;
    const number = numberParts.join('-');
    const filePath = path.join(
      srcDataDir,
      'bills',
      congress,
      billType.toLowerCase(),
      `${number}.json`,
    );
    const bill = readJson<Record<string, unknown>>(filePath);
    if (!bill) return { rvIds: [], lvIds: [], legislators: [] };

    const rvIds: string[] = [];
    const lvIds: string[] = [];
    const legIds: string[] = [];

    const actions = (bill.actions as { actions?: unknown[] } | undefined)?.actions ?? [];
    for (const action of actions as Record<string, unknown>[]) {
      for (const rv of (action.recordedVotes ?? []) as Record<string, unknown>[]) {
        const rvId = rv.id as string | undefined;
        if (!rvId) continue;
        rvIds.push(rvId);
        for (const bioguideId of Object.keys(rv.votes ?? {})) {
          lvIds.push(`${bioguideId}-${rvId}`);
          legIds.push(bioguideId);
        }
      }
    }
    return { rvIds, lvIds, legislators: legIds };
  }

  for (const billId of changedBillIds) {
    const { rvIds, lvIds, legislators } = extractVotesFromBillId(billId);
    changedRecordedVotes.push(...rvIds);
    changedLegislatorVotes.push(...lvIds);
    legislators.forEach(id => cascadedLegislators.add(id));
  }

  // For deleted bills the file is gone — flag prefix-wildcard so the post-build
  // merge can prune stale pages (getStaticPaths won't produce them anyway).
  for (const billId of deletedBillIds) {
    deletedRecordedVotes.push(`${billId}-*`);
  }

  return {
    changedRecordedVotes,
    deletedRecordedVotes,
    changedLegislatorVotes,
    deletedLegislatorVotes,
    cascadedLegislators: [...cascadedLegislators],
  };
}

/**
 * Concatenates multiple string arrays and removes duplicates.
 *
 * @param arrays - One or more string arrays to merge.
 * @returns A new array containing every unique value across all inputs.
 */
export function mergeUnique(...arrays: string[][]): string[] {
  return [...new Set(arrays.flat())];
}

/**
 * Orchestrates the full incremental check:
 *
 * 1. Hashes all bill and legislator source files → `.current-digests.json`.
 * 2. Reads the previous build's manifest from `dist-cache/.astro-manifest.json`.
 * 3. Diffs current vs previous digests to find changed and deleted IDs.
 * 4. Cascades bill changes to dependent collections (recordedVotes,
 *    legislatorVotes, legislators).
 * 5. Writes `src/data/.build-manifest.json` for `getStaticPaths` to consume.
 *
 * When `forceFullRebuild` is `true` (or `FORCE_FULL_REBUILD=true` env var),
 * the function deletes any existing `.build-manifest.json` and returns early,
 * causing `getStaticPaths` to fall back to building all pages.
 *
 * When no previous manifest exists (first build, or after `dist-cache/` was
 * cleared), the function writes `.current-digests.json` but does not write
 * `.build-manifest.json`, so `getStaticPaths` also falls back to full build.
 *
 * @param options.root - Project root directory. Defaults to the repo root.
 * @param options.srcDataDir - `src/data` directory. Defaults to `{root}/src/data`.
 * @param options.distCacheDir - Cache directory. Defaults to `{root}/dist-cache`.
 * @param options.forceFullRebuild - When `true`, bypasses all diffing.
 */
export function main(options: {
  root?: string;
  srcDataDir?: string;
  distCacheDir?: string;
  forceFullRebuild?: boolean;
} = {}): void {
  const root = options.root ?? ROOT;
  const srcDataDir = options.srcDataDir ?? SRC_DATA_DIR;
  const distCacheDir = options.distCacheDir ?? DIST_CACHE_DIR;
  const forceFullRebuild = options.forceFullRebuild ?? process.env.FORCE_FULL_REBUILD === 'true';

  const previousManifestPath = path.join(distCacheDir, '.astro-manifest.json');
  const currentDigestsPath = path.join(root, '.current-digests.json');
  const buildManifestPath = path.join(root, 'src', 'data', '.build-manifest.json');

  if (forceFullRebuild) {
    console.log('FORCE_FULL_REBUILD=true — skipping incremental check, full build will run');
    if (fs.existsSync(buildManifestPath)) fs.unlinkSync(buildManifestPath);
    return;
  }

  const currentBills = computeBillDigests(srcDataDir);
  const currentLegislators = computeLegislatorDigests(srcDataDir);
  const current: SourceDigestManifest = { bills: currentBills, legislators: currentLegislators };

  // Always save current digests so the post-build step can promote them
  // to dist-cache/.astro-manifest.json for the next run's comparison.
  fs.writeFileSync(currentDigestsPath, JSON.stringify(current, null, 2));

  const previous = readJson<SourceDigestManifest>(previousManifestPath);
  if (!previous) {
    console.log('No previous dist-cache manifest found — full build will run');
    return;
  }

  const { changed: changedBills, deleted: deletedBills } = getChangedAndDeleted(
    currentBills,
    previous.bills,
  );

  const { changed: changedLegsFromFiles, deleted: deletedLegs } = getChangedAndDeleted(
    currentLegislators,
    previous.legislators,
  );

  const cascade = cascadeFromChangedBills(changedBills, deletedBills, srcDataDir);

  // A legislator page must be rebuilt if its own file changed OR if any bill
  // that legislator voted on changed (cascaded from bill diff).
  const changedLegislators = mergeUnique(changedLegsFromFiles, cascade.cascadedLegislators);

  const changedIds: Record<string, string[]> = {
    'bills-loader': changedBills,
    'recorded-votes-loader': [...new Set(cascade.changedRecordedVotes)],
    'legislator-votes-loader': [...new Set(cascade.changedLegislatorVotes)],
    'legislators-loader': changedLegislators,
    'changelog-loader': [], // changelog is small and always fully rendered
  };

  const deletedIds: Record<string, string[]> = {
    'bills-loader': deletedBills,
    'recorded-votes-loader': cascade.deletedRecordedVotes,
    'legislator-votes-loader': cascade.deletedLegislatorVotes,
    'legislators-loader': deletedLegs,
    'changelog-loader': [],
  };

  const totalChanged = Object.values(changedIds).reduce((sum, ids) => sum + ids.length, 0);
  const totalDeleted = Object.values(deletedIds).reduce((sum, ids) => sum + ids.length, 0);

  console.log(`Incremental check: ${totalChanged} entries changed, ${totalDeleted} entries deleted`);
  for (const [col, ids] of Object.entries(changedIds)) {
    if (ids.length > 0) console.log(`  ${col}: ${ids.length} changed`);
  }

  const manifest: BuildManifest = { changedIds, deletedIds };
  fs.mkdirSync(path.dirname(buildManifestPath), { recursive: true });
  fs.writeFileSync(buildManifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Build manifest written to ${buildManifestPath}`);
}

// Only execute when run directly, not when imported for testing
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
