/**
 * Prefix that identifies congressional disapproval (CRA) resolution titles.
 * HJRes: "Providing for congressional disapproval..." or "Providing congressional disapproval...".
 * SJRes: "A joint resolution providing for congressional disapproval..." or "A joint resolution disapproving the rule submitted by the...".
 * @see https://api.congress.gov
 */
export const DISAPPROVAL_PREFIX = 'Providing for congressional disapproval under chapter 8 of title 5';

/** Matches HJRes and SJRes disapproval titles (optional "A joint resolution " prefix). */
const DISAPPROVAL_PREFIX_REGEX =
  /^(?:A joint resolution )?Providing (?:for )?congressional disapproval under chapter 8 of title 5/i;

/** Matches SJRes short form: "A joint resolution disapproving the rule submitted by the..." */
const DISAPPROVING_PREFIX_REGEX = /^(?:A joint resolution )?disapproving the rule submitted by the /i;

/**
 * Matches "the rule submitted by the {name} relating to [the] \"{action}\"".
 * Name: after "the rule submitted by the ", before " relating to".
 * Action: inside double quotes (optional "the " before the opening quote).
 * Handles trailing period and extra spaces.
 */
const DISAPPROVAL_REGEX =
  /the\s+rule\s+submitted\s+by\s+the\s+(.+?)\s+relating\s+to\s+(?:the\s+)?"([^"]+)"\.?\s*/i;

/**
 * If title is a congressional disapproval title (CRA), return a shortened form:
 * "Disapproval of {name} rule on the {action}".
 * Otherwise return the original title.
 *
 * Real-world: "Providing (for )? congressional disapproval"; United States Code between prefix and rule;
 * optional "the " before the quoted action; trailing period; extra spaces.
 */
export function cleanDisapprovalTitle(title: string): string {
  if (!title || typeof title !== 'string') return title;
  const prefixMatches = DISAPPROVAL_PREFIX_REGEX.test(title) || DISAPPROVING_PREFIX_REGEX.test(title);
  if (!prefixMatches) return title;

  const match = title.match(DISAPPROVAL_REGEX);
  if (!match || match[1] == null || match[2] == null) {
    return title;
  }
  const name = match[1].trim();
  const action = match[2].trim();
  if (!name || !action) {
    return title;
  }
  return `Disapproval of ${name} rule on the ${action}`;
}
