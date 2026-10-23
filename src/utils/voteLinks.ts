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
 * Canonical: `/bills/{term}/{type}/{number}/{vote}/{bioguide}`.
 *
 * @param voteId - Recorded vote id (`119-HR-2616-184`)
 * @param bioguideId - Member id
 * @param base - Deployment base
 * @returns Canonical card path
 */
export function voteMemberPath(voteId: string, bioguideId: string, base = '/'): string {
  const ref = parseVoteId(voteId);
  if (!ref) return withBaseUrl(`/bills/${voteId}/${bioguideId}`, base);
  return withBaseUrl(
    `/bills/${ref.term}/${ref.billType}/${ref.billNumber}/${ref.voteNumber}/${bioguideId}`,
    base,
  );
}

/**
 * Read a bill-path card URL back: `/bills/119/hr/2616/184/S001188`.
 *
 * @param pathname - Location pathname
 * @returns Path parts, or null when this is not a card URL
 */
export function parseVoteMemberPath(
  pathname: string,
): { term: string; billType: string; billNumber: string; voteId: string; bioguideId: string } | null {
  const match = /\/bills\/(\d+)\/([a-z]+)\/(\d+)\/(\d+)\/([A-Za-z0-9]+)\/?$/.exec(pathname);
  return match
    ? {
        term: match[1],
        billType: match[2],
        billNumber: match[3],
        voteId: match[4],
        bioguideId: match[5],
      }
    : null;
}

/**
 * Read a member×bill path back: `/members/R000579/119/hr-2616` names the bill
 * a shared link opens on that member's page. A fourth segment is the in-place
 * card — see {@link parseMemberVotePath}.
 */
export function parseMemberBillPath(pathname: string): { bioguideId: string; term: string; segment: string } | null {
  const match = /\/members\/([A-Za-z0-9]+)\/(\d+)\/([a-z]+-\d+)\/?$/.exec(pathname);
  return match ? { bioguideId: match[1], term: match[2], segment: match[3] } : null;
}

/**
 * The in-place card over a member's record: `/members/{bio}/{term}/{type}-{n}/{vote}`.
 * Share/og still use {@link voteMemberPath}; this URL is the client route.
 *
 * @param voteId - Recorded vote id (`119-HR-2616-184`)
 * @param bioguideId - Member id
 * @param base - Deployment base
 * @returns Member-context card path
 */
export function memberVotePath(voteId: string, bioguideId: string, base = '/'): string {
  const ref = parseVoteId(voteId);
  if (!ref) return memberPath(bioguideId, base);
  return withBaseUrl(
    `/members/${bioguideId}/${ref.term}/${billSegment(ref.billType, ref.billNumber)}/${ref.voteNumber}`,
    base,
  );
}

/**
 * Read a member-context card URL back: `/members/R000579/119/hr-2616/184`.
 *
 * @param pathname - Location pathname
 * @returns Path parts, or null when this is not a member card URL
 */
export function parseMemberVotePath(
  pathname: string,
): { bioguideId: string; term: string; segment: string; voteNumber: string } | null {
  const match = /\/members\/([A-Za-z0-9]+)\/(\d+)\/([a-z]+-\d+)\/(\d+)\/?$/.exec(pathname);
  return match
    ? { bioguideId: match[1], term: match[2], segment: match[3], voteNumber: match[4] }
    : null;
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
