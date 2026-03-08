/**
 * Replaces known government agency (or org) full names with their acronyms.
 * Uses longest-name-first order so "Environmental Protection Agency" is replaced
 * before shorter substrings like "Protection" or "Agency".
 */

export type AcronymEntry = { name: string; acronym: string };

/**
 * Applies acronym replacements to a string. Replaces each known full name with
 * its acronym. Sorts by name length descending so longer names are replaced first.
 *
 * @param title - Text to process (e.g. a bill title)
 * @param acronyms - List of { name, acronym } entries from the acronym dictionary
 * @returns Title with full names replaced by acronyms
 */
export function applyAcronyms(title: string, acronyms: AcronymEntry[]): string {
  if (!title || typeof title !== 'string') return title;
  if (!acronyms?.length) return title;

  const sorted = [...acronyms].filter(
    (a) => typeof a.name === 'string' && typeof a.acronym === 'string' && a.name.length > 0
  );
  sorted.sort((a, b) => b.name.length - a.name.length);

  let result = title;
  for (const { name, acronym } of sorted) {
    result = result.replaceAll(name, acronym);
  }
  return result;
}
