/**
 * Every URL that names a bill, a vote or a member, built in one place.
 *
 * Nothing else in the site should assemble these by hand: the canonical
 * legislator×vote path moves in a later phase, and it has to be a change to
 * one function rather than a sweep.
 *
 * A recorded vote id carries its own bill — `119-HR-2616-184` is vote 184 on
 * H.R. 2616 of the 119th — so every path below can be derived from it.
 */
import { withBaseUrl } from './withBaseUrl.js';

export type VoteRef = {
  term: string;
  billType: string;
  billNumber: string;
  voteNumber: string;
};

/** Split a recorded vote id into the bill it belongs to and its vote number. */
export function parseVoteId(voteId: string): VoteRef | null {
  const match = /^(\d+)-([A-Za-z]+)-(\d+)-(\d+)$/.exec(voteId.trim());
  if (!match) return null;
  return { term: match[1], billType: match[2].toLowerCase(), billNumber: match[3], voteNumber: match[4] };
}

/** The `{type}-{number}` segment that names a bill inside a member's path. */
export function billSegment(billType: string, billNumber: string | number): string {
  return `${billType.toLowerCase()}-${billNumber}`;
}

/** Split that segment back into its two halves. */
export function parseBillSegment(segment: string): { billType: string; billNumber: string } | null {
  const match = /^([A-Za-z]+)-(\d+)$/.exec(segment.trim());
  return match ? { billType: match[1].toLowerCase(), billNumber: match[2] } : null;
}

export function billPath(term: string | number, billType: string, billNumber: string | number, base = '/'): string {
  return withBaseUrl(`/bills/${term}/${billType.toLowerCase()}/${billNumber}`, base);
}

/** The bill page a vote belongs to. */
export function billPathForVote(voteId: string, base = '/'): string | null {
  const ref = parseVoteId(voteId);
  return ref && billPath(ref.term, ref.billType, ref.billNumber, base);
}

/** One recorded vote, with its roll. */
export function votePath(voteId: string, base = '/'): string | null {
  const ref = parseVoteId(voteId);
  return ref && withBaseUrl(`/bills/${ref.term}/${ref.billType}/${ref.billNumber}/${ref.voteNumber}`, base);
}

/**
 * One member's cast on one vote — the share target and the card's own URL.
 *
 * This is the path that moves under `/bills/…` when the canonical URL change
 * lands; every caller goes with it because none of them builds it themselves.
 */
export function voteMemberPath(voteId: string, bioguideId: string, base = '/'): string {
  return withBaseUrl(`/v/${voteId}/${bioguideId}`, base);
}

/**
 * Read a member×bill path back: `/members/R000579/119/hr-2616` names the bill
 * a shared link opens on that member's page. The vote under it belongs to the
 * card, not here, so a fourth segment is not one of these.
 */
export function parseMemberBillPath(pathname: string): { bioguideId: string; term: string; segment: string } | null {
  const match = /\/members\/([A-Za-z0-9]+)\/(\d+)\/([a-z]+-\d+)\/?$/.exec(pathname);
  return match ? { bioguideId: match[1], term: match[2], segment: match[3] } : null;
}

export function memberPath(bioguideId: string, base = '/'): string {
  return withBaseUrl(`/members/${bioguideId}`, base);
}

/** One member's record on one bill: their casts on that bill's votes. */
export function memberBillPath(
  bioguideId: string,
  term: string | number,
  billType: string,
  billNumber: string | number,
  base = '/',
): string {
  return withBaseUrl(`/members/${bioguideId}/${term}/${billSegment(billType, billNumber)}`, base);
}
