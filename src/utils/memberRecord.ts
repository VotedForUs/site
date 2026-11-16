/**
 * Turning one member's votes into the bills they have voted on.
 *
 * The member routes hand `MemberRecord.astro` resolved props; this is the
 * resolving, kept pure so it can be tested without a collection or a page.
 */
import type { MemberBill } from '../components/MemberRecord.astro';
import { memberCastsForDisplay } from './memberCastsForDisplay.js';

/** One row of the `legislatorVotes` collection, as far as this needs it. */
export type MemberVoteEntry = {
  bioguideId: string;
  voteId: string;
  vote: string;
  billId: string;
  billType: string;
  billNumber: string | number;
  congress: string | number;
  billTitle: string;
  actionDate: string;
};

/**
 * The bills a member has voted on, newest first.
 *
 * A bill is dated by the member's most recent vote on it, and tagged with the
 * cast from that same vote: the list answers "when did they last act on this,
 * and what did they do", not "what happened to the bill".
 */
export function groupMemberBills(entries: MemberVoteEntry[]): MemberBill[] {
  const byBill = new Map<string, MemberBill>();

  for (const entry of entries) {
    const existing = byBill.get(entry.billId);
    if (!existing) {
      byBill.set(entry.billId, {
        billId: entry.billId,
        term: entry.congress,
        billType: entry.billType,
        billNumber: entry.billNumber,
        title: entry.billTitle,
        date: entry.actionDate,
        cast: entry.vote,
        votes: 1,
      });
      continue;
    }
    existing.votes += 1;
    if (entry.actionDate >= existing.date) {
      existing.date = entry.actionDate;
      existing.cast = entry.vote;
    }
  }

  return [...byBill.values()].sort((a, b) =>
    a.date === b.date ? a.billId.localeCompare(b.billId) : (a.date < b.date ? 1 : -1));
}

/** One recorded vote, as far as picking a member's votes needs it. */
export type BillVote = {
  billId: string;
  actionDate?: string;
  date?: string;
  votes?: Record<string, string>;
  recordType?: string;
  membersAtAction?: string[];
};

/**
 * Bioguide ids that appear in the legislator-vote index.
 *
 * Finder rows and `/members/[id]` use the same set: a page exists only when
 * there is at least one display cast (roll-call map or consent membership).
 *
 * @param entries - `legislatorVotes` rows, or anything with a bioguide id
 * @returns Unique ids that have a cast
 */
export function bioguideIdsWithCasts(entries: Iterable<{ bioguideId: string }>): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.bioguideId) ids.add(entry.bioguideId);
  }
  return ids;
}

/**
 * The votes on one bill that a member actually cast on, newest first.
 *
 * Their casts are the chamber filter: a senator is not in a House roll's map,
 * so a senator never sees a House roll, and the five members who served in
 * both chambers this Congress keep the votes from each. UC/voice use
 * {@link memberCastsForDisplay}, so consent membership counts. Nothing here
 * reads a member's current chamber, which is what would get those five wrong.
 *
 * @param votes - Recorded votes on any bill
 * @param bioguideId - Member to keep
 * @param billId - Bill to keep
 * @returns That member's votes on that bill, newest first
 */
export function memberVotesOnBill<T extends BillVote>(votes: T[], bioguideId: string, billId: string): T[] {
  return votes
    .filter(vote => vote.billId === billId && Boolean(memberCastsForDisplay(vote)[bioguideId]))
    .sort((a, b) => ((a.actionDate ?? a.date ?? '') < (b.actionDate ?? b.date ?? '') ? 1 : -1));
}
