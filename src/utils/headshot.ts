/**
 * Whether we actually hold a portrait for a member, and where it is.
 *
 * `vfu legislators:generate --images` downloads portraits to
 * `public/images/legislators/{BIOGUIDE}.jpg`, and those files are what the site
 * serves. The legislator data also carries an `imageUrl`, but for members whose
 * portrait was never downloaded that field is a congress.gov URL — so reading
 * it as "there is a headshot" produces two different bugs at once: a row that
 * requests a local file which 404s, and a page that hotlinks congress.gov on
 * every view.
 *
 * The only trustworthy answer is the file on disk, which is what this reads.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export const HEADSHOT_DIR = path.join('images', 'legislators');

/** The public path for a member's portrait, whether or not it exists. */
export function headshotPath(bioguideId: string): string {
  return `/${HEADSHOT_DIR.split(path.sep).join('/')}/${bioguideId}.jpg`;
}

/** Keyed by directory: one build reads one, a test may read another. */
const cache = new Map<string, Set<string>>();

/** Every bioguide id we hold a portrait for. Read once per directory. */
export function heldHeadshots(publicDir = path.join(process.cwd(), 'public')): Set<string> {
  const cached = cache.get(publicDir);
  if (cached) return cached;
  let held: Set<string>;
  try {
    held = new Set(
      fs.readdirSync(path.join(publicDir, HEADSHOT_DIR))
        .filter(file => file.endsWith('.jpg'))
        .map(file => path.basename(file, '.jpg')),
    );
  } catch {
    held = new Set();
  }
  cache.set(publicDir, held);
  return held;
}

/** The portrait path when we hold one, otherwise null — never a remote URL. */
export function localHeadshot(bioguideId: string, publicDir?: string): string | null {
  return heldHeadshots(publicDir).has(bioguideId) ? headshotPath(bioguideId) : null;
}
