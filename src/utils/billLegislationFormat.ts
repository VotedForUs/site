/**
 * Human-readable bill identifiers and legislation type labels for display and schema.org markup.
 */

/** Normalized bill type codes from Congress.gov / site bill JSON. */
const BILL_TYPE_LABELS: Readonly<Record<string, { identifierPrefix: string; legislationType: string }>> = {
  S: { identifierPrefix: 'S.', legislationType: 'act' },
  HR: { identifierPrefix: 'H.R.', legislationType: 'act' },
  HRES: { identifierPrefix: 'H. Res.', legislationType: 'simple resolution' },
  SRES: { identifierPrefix: 'S. Res.', legislationType: 'simple resolution' },
  HJRES: { identifierPrefix: 'H.J. Res.', legislationType: 'joint resolution' },
  SJRES: { identifierPrefix: 'S.J. Res.', legislationType: 'joint resolution' },
  HCONRES: { identifierPrefix: 'H. Con. Res.', legislationType: 'concurrent resolution' },
  SCONRES: { identifierPrefix: 'S. Con. Res.', legislationType: 'concurrent resolution' },
};

/**
 * Normalizes a bill type string to the lookup key used in {@link BILL_TYPE_LABELS}.
 *
 * @param billType - Raw bill type (e.g. `s`, `HRES`, `hr`).
 * @returns Uppercase type without separators.
 */
export function normalizeBillTypeKey(billType: string): string {
  return billType.replace(/[.\s_-]/g, '').toUpperCase();
}

/**
 * Formats a bill type and number as a legislation identifier (e.g. `H. Res. 354`).
 *
 * @param billType - Bill type code.
 * @param billNumber - Bill number string.
 * @returns Plain-text legislation identifier.
 */
export function formatLegislationIdentifier(billType: string, billNumber: string): string {
  const key = normalizeBillTypeKey(billType);
  const label = BILL_TYPE_LABELS[key];
  const prefix = label?.identifierPrefix ?? billType.toUpperCase();
  return `${prefix} ${billNumber}`.trim();
}

/**
 * Returns a human-readable legislation type label (e.g. `simple resolution`).
 *
 * @param billType - Bill type code.
 * @returns Legislation type label, or `bill` when the type is unknown.
 */
export function formatLegislationTypeLabel(billType: string): string {
  const key = normalizeBillTypeKey(billType);
  return BILL_TYPE_LABELS[key]?.legislationType ?? 'bill';
}
