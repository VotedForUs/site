/**
 * Display helpers for compact vote-roll rows (medium / small density).
 */

/**
 * State roll group key: segment before the first hyphen (e.g. `CA` from `CA-s1`, `PA` from `PA-12`).
 *
 * @param stateDistrict - State or state-district label from row data
 * @returns Uppercase-style key as in source (trimmed); full string if no hyphen
 */
export function stateRollGroupKey(stateDistrict: string): string {
  const s = stateDistrict.trim();
  const i = s.indexOf('-');
  return i === -1 ? s : s.slice(0, i);
}

/**
 * Short party label for compact rows (D / R / I or a short fallback).
 *
 * @param party - Full party string from legislator data
 * @returns Abbreviation (usually one letter)
 */
export function partyAbbrev(party: string): string {
  const p = party.trim().toLowerCase();
  if (!p) {
    return '';
  }
  if (p.includes('democrat')) {
    return 'D';
  }
  if (p.includes('republican')) {
    return 'R';
  }
  return 'I';
}
