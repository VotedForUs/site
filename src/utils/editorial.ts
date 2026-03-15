/**
 * Editorial content utilities — pure business logic, no Astro collection API dependencies.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

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
