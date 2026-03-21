/**
 * Normalizes on-disk legislator JSON for Astro content collections.
 *
 * Input may be a legacy {@link LegislatorSmall}-shaped object or a full Congress.gov
 * member payload (`bioguideId`, nested `id`, `latest_term`, `terms`, `depiction`, etc.).
 * Output matches {@link legislatorSmallSchema} after parsing (see `content.config.ts`).
 *
 * @module normalizeLegislatorForCollection
 */
import type { LegislatorSmall } from '@votedforus/votes/types';

/** Parsed JSON object with unknown shape (API or small record). */
type Loose = Record<string, unknown>;

/**
 * Reads `bioguide` from a nested `id` object when present (Congress.gov member detail).
 *
 * @param leg - Raw legislator record
 * @returns Bioguide id string, or `undefined` if `id` is not an object with `bioguide`
 */
function nestedIdBioguide(leg: Loose): string | undefined {
  const id = leg['id'];
  if (id && typeof id === 'object' && id !== null && 'bioguide' in id) {
    const b = (id as { bioguide?: unknown }).bioguide;
    return typeof b === 'string' ? b : undefined;
  }
  return undefined;
}

/**
 * Coerces a value to a finite number for optional fields such as `district`.
 *
 * @param v - Unknown value from JSON
 * @returns Integer/number when coercible, otherwise `undefined`
 */
function toOptionalNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

/**
 * Picks the best `terms[]` row when `latest_term` is missing: prefers a term with no
 * `endYear` (current), otherwise the last term in the array.
 *
 * @param leg - Raw legislator record
 * @returns The chosen term object, or `undefined` if there are no terms
 */
function inferFromTermsArray(leg: Loose): Record<string, unknown> | undefined {
  const terms = leg['terms'];
  if (!Array.isArray(terms) || terms.length === 0) return undefined;
  for (let i = terms.length - 1; i >= 0; i--) {
    const t = terms[i] as Record<string, unknown>;
    if (t['endYear'] == null) return t;
  }
  return terms[terms.length - 1] as Record<string, unknown>;
}

/**
 * Maps chamber / member type strings to collection `type` values (`sen` | `rep`).
 *
 * @param chamber - e.g. `"Senate"`, `"House of Representatives"`
 * @param memberType - e.g. `"Senator"`, `"Representative"`
 * @returns `"sen"`, `"rep"`, or `undefined` if neither dimension is informative
 */
function chamberToLegType(chamber: unknown, memberType: unknown): string | undefined {
  if (typeof chamber === 'string' && chamber.toLowerCase().includes('senate')) return 'sen';
  if (typeof memberType === 'string' && memberType.toLowerCase().includes('senator')) return 'sen';
  if (typeof chamber === 'string' || typeof memberType === 'string') return 'rep';
  return undefined;
}

/**
 * Resolves a single display name string from varied API shapes.
 *
 * @param leg - Raw legislator record
 * @returns Display name, or empty string if none found
 */
function displayName(leg: Loose): string {
  const name = leg['name'];
  if (typeof name === 'string') return name;
  if (name && typeof name === 'object' && name !== null && 'official_full' in name) {
    const full = (name as { official_full?: unknown }).official_full;
    if (typeof full === 'string') return full;
  }
  if (typeof leg['directOrderName'] === 'string') return leg['directOrderName'];
  if (typeof leg['invertedOrderName'] === 'string') return leg['invertedOrderName'];
  return '';
}

/**
 * Resolves party label from `latest_term`, top-level `party`, or first `partyHistory` row.
 *
 * @param leg - Raw legislator record
 * @param latestTerm - `latest_term` object when present
 * @returns Party string, or `undefined`
 */
function partyFromLeg(leg: Loose, latestTerm: Record<string, unknown> | undefined): string | undefined {
  if (typeof latestTerm?.['party'] === 'string') return latestTerm['party'] as string;
  if (typeof leg['party'] === 'string') return leg['party'];
  const hist = leg['partyHistory'];
  if (Array.isArray(hist) && hist[0] && typeof hist[0] === 'object' && hist[0] !== null) {
    const row = hist[0] as { partyName?: unknown; partyAbbreviation?: unknown };
    if (typeof row.partyName === 'string') return row.partyName;
    if (typeof row.partyAbbreviation === 'string') return row.partyAbbreviation;
  }
  return undefined;
}

/**
 * Builds the `nameTitle` string used in lists and page titles (`Sen. …` / `Rep. …`).
 *
 * Uses existing `nameTitle` when set; otherwise derives from name, `latest_term` or `terms`,
 * and chamber type.
 *
 * @param leg - Raw legislator record
 * @returns Title string; falls back to bioguide-like id or `"Unknown"`
 */
function computeNameTitle(leg: Loose): string {
  if (typeof leg['nameTitle'] === 'string') return leg['nameTitle'];

  const fullName = displayName(leg);
  const lt = leg['latest_term'] as { type?: string; state?: string; district?: unknown } | undefined;
  const inferred = inferFromTermsArray(leg);
  const type =
    (typeof lt?.type === 'string' ? lt.type : undefined) ??
    (inferred
      ? chamberToLegType(inferred['chamber'], inferred['memberType'])
      : undefined);
  const state =
    (typeof lt?.state === 'string' ? lt.state : undefined) ??
    (typeof inferred?.['stateCode'] === 'string' ? (inferred['stateCode'] as string) : undefined) ??
    (typeof leg['state'] === 'string' ? leg['state'] : undefined) ??
    '';
  const district =
    toOptionalNumber(lt?.district) ??
    toOptionalNumber(inferred?.['district']) ??
    toOptionalNumber(leg['district']);

  if (!fullName) {
    return (
      (typeof leg['bioguideId'] === 'string' ? leg['bioguideId'] : undefined) ??
      (typeof leg['bioguide'] === 'string' ? leg['bioguide'] : undefined) ??
      nestedIdBioguide(leg) ??
      'Unknown'
    );
  }
  if (type === 'sen' || type === 'senate') {
    return `Sen. ${fullName} (${state})`;
  }
  return `Rep. ${fullName} (${state}-${district ?? ''})`;
}

/**
 * Maps raw legislator JSON into a {@link LegislatorSmall}-compatible object for Zod parsing.
 *
 * Spreads the original record then overrides normalized fields so collection entries retain
 * extra API keys until `legislatorSmallSchema` strips them at parse time.
 *
 * @param leg - Parsed JSON from `src/data/legislators/{id}.json`
 * @param fromFile - Filename stem when ids are missing (e.g. `A000055`)
 * @returns Object suitable for `legislatorSmallSchema.safeParse` (caller should set `id` to bioguide slug if desired)
 */
export function normalizeLegislatorForCollection(leg: Loose, fromFile: string): LegislatorSmall {
  const bioguide =
    (typeof leg['bioguide'] === 'string' ? leg['bioguide'] : undefined) ??
    (typeof leg['bioguideId'] === 'string' ? leg['bioguideId'] : undefined) ??
    nestedIdBioguide(leg) ??
    fromFile;

  const id =
    (typeof leg['bioguideId'] === 'string' ? leg['bioguideId'] : undefined) ??
    (typeof leg['bioguide'] === 'string' ? leg['bioguide'] : undefined) ??
    (typeof leg['id'] === 'string' ? leg['id'] : undefined) ??
    fromFile;

  const latestTerm = leg['latest_term'] as Record<string, unknown> | undefined;
  const inferredTerm = latestTerm ? undefined : inferFromTermsArray(leg);
  const termRow = latestTerm ?? inferredTerm;

  const nameObj = leg['name'] as { official_full?: string; last?: string } | undefined;
  const depiction = leg['depiction'] as { imageUrl?: string; attribution?: string } | undefined;

  const districtFromTerm = termRow ? toOptionalNumber(termRow['district']) : undefined;
  const district =
    toOptionalNumber(leg['district']) ??
    districtFromTerm;

  const type =
    (typeof leg['type'] === 'string' ? leg['type'] : undefined) ??
    (termRow && typeof termRow['type'] === 'string' ? (termRow['type'] as string) : undefined) ??
    (termRow ? chamberToLegType(termRow['chamber'], termRow['memberType']) : undefined);

  const state =
    (typeof latestTerm?.['state'] === 'string' ? (latestTerm['state'] as string) : undefined) ??
    (inferredTerm && typeof inferredTerm['stateCode'] === 'string'
      ? (inferredTerm['stateCode'] as string)
      : undefined) ??
    (typeof leg['state'] === 'string' ? leg['state'] : undefined);

  return {
    ...leg,
    id,
    bioguide,
    nameTitle: computeNameTitle(leg),
    type,
    state,
    party: partyFromLeg(leg, latestTerm),
    district,
    name:
      typeof leg['name'] === 'string'
        ? leg['name']
        : nameObj?.official_full,
    lastName:
      typeof leg['lastName'] === 'string' ? leg['lastName'] : nameObj?.last,
    imageUrl:
      (typeof leg['imageUrl'] === 'string' ? leg['imageUrl'] : undefined) ?? depiction?.imageUrl,
    attribution:
      (typeof leg['attribution'] === 'string' ? leg['attribution'] : undefined) ?? depiction?.attribution,
    stateRank:
      (typeof leg['stateRank'] === 'string' ? leg['stateRank'] : undefined) ??
      (typeof latestTerm?.['state_rank'] === 'string' ? (latestTerm['state_rank'] as string) : undefined),
    lis_member_id:
      typeof leg['lis_member_id'] === 'string' ? leg['lis_member_id'] : undefined,
  };
}
