/**
 * Build manifest utilities for incremental static page generation.
 * Reads `.build-manifest.json` written by scripts/incremental-check.ts.
 * When the manifest is absent (full build), all pages are built.
 *
 * changedIds arrays are converted to Sets on load for O(1) lookups.
 * With 100k+ entries, Array.includes() per entry is O(n²) — a hang.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface RawBuildManifest {
  changedIds: Record<string, string[]>;
}

export interface BuildManifest {
  /** Per-collection Sets of IDs that need rebuilding. O(1) lookup. */
  changedIds: Record<string, Set<string>>;
}

let _manifest: BuildManifest | null | undefined;

export function getBuildManifest(): BuildManifest | null {
  if (_manifest !== undefined) return _manifest;
  // In `astro dev`, always behave like a full build:
  // - `getStaticPaths()` must include *all* bills/terms that exist on disk
  // - otherwise routes (e.g. `/bills/119/`) can 404 if the manifest has empty `changedIds`
  const isDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
  if (isDev) return (_manifest = null);
  // Use process.cwd() (project root) — import.meta.url is unreliable in
  // Astro's Vite build context where files are compiled to temp paths.
  const manifestPath = join(process.cwd(), 'src', 'data', '.build-manifest.json');
  if (!existsSync(manifestPath)) return (_manifest = null);
  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as RawBuildManifest;
    // Convert arrays → Sets so shouldBuildPage is O(1) per call
    const changedIds: Record<string, Set<string>> = {};
    for (const [collection, ids] of Object.entries(raw.changedIds)) {
      changedIds[collection] = new Set(ids);
    }
    return (_manifest = { changedIds });
  } catch {
    return (_manifest = null);
  }
}

/**
 * Returns true if a page for the given collection entry should be built.
 * - No manifest present → full build → always returns true
 * - Collection absent from manifest → new collection → treat all entries as changed
 * - ID in changedIds Set → returns true
 * - ID not in changedIds Set → skip (use cached page)
 */
export function shouldBuildPage(collection: string, id: string): boolean {
  const manifest = getBuildManifest();
  if (!manifest) return true;
  if (!(collection in manifest.changedIds)) return true;
  return manifest.changedIds[collection].has(id);
}
