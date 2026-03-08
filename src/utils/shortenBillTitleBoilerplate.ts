/**
 * Shortens bill titles by stripping or replacing common leading boilerplate.
 * Applied after cleanDisapprovalTitle and applyAcronyms in getBestBillTitle.
 */

/** "A bill to X" -> "To X" */
const A_BILL_TO_REGEX = /^A bill to /i;

/** "An act to provide for reconciliation pursuant to title II of H. Con. Res. N" -> "Reconciliation pursuant to H. Con. Res. N" */
const RECONCILIATION_ACT_REGEX = /^An act to provide for reconciliation pursuant to title II of (H\. Con\. Res\. \d+)\.?\s*/i;

/** "Making [consolidated] appropriations for the fiscal year ending September 30, YYYY[, and for other purposes.]" -> "FYYYYY Appropriations" */
const MAKING_APPROPRIATIONS_FY_REGEX =
  /^Making (?:consolidated )?appropriations for the fiscal year ending September 30, (\d{4}),?\s*(?:and for other purposes\.?)?\.?\s*$/i;

/**
 * Shortens common leading boilerplate in bill titles. Applies in order;
 * first match wins.
 *
 * @param title - Title after cleanDisapprovalTitle and applyAcronyms
 * @returns Shortened title or original if no pattern matched
 */
export function shortenBillTitleBoilerplate(title: string): string {
  if (!title || typeof title !== 'string') return title;
  let result = title.trim();

  const reconciliationMatch = result.match(RECONCILIATION_ACT_REGEX);
  if (reconciliationMatch) {
    result = `Reconciliation pursuant to ${reconciliationMatch[1]}. ${result.slice(reconciliationMatch[0].length).trim()}`.trim();
    if (result.endsWith('..')) result = result.slice(0, -1);
    return result;
  }

  const fyMatch = result.match(MAKING_APPROPRIATIONS_FY_REGEX);
  if (fyMatch) {
    return `FY${fyMatch[1]} Appropriations`;
  }

  if (A_BILL_TO_REGEX.test(result)) {
    return result.replace(A_BILL_TO_REGEX, 'To ');
  }

  return result;
}
