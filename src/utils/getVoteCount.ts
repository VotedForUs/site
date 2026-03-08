/**
 * Total count of recorded votes across all actions for a bill.
 * Site-wide util so logic lives in one place.
 */
export function getVoteCount(bill: {
  data?: { actions?: { actions?: Array<{ recordedVotes?: unknown[] }> } };
}): number {
  const actions = bill.data?.actions?.actions ?? [];
  return actions.reduce((sum, a) => sum + (a.recordedVotes?.length ?? 0), 0);
}
