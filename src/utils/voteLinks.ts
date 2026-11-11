/**
 * Every URL that names a bill, a vote or a member, built in one place.
 *
 * Nothing else in the site should assemble these by hand.
 *
 * Only identities are paths: a bill, a vote, a member. A combination of two —
 * one member's cast on one vote, one member's votes on one bill — is the
 * identity's own page with a query string, because the site is static files
 * and a query string is the only deep link every static host serves. The one
 * exception is the share stub ({@link voteSharePath}), a real file written by
 * `scripts/build-share-stubs.ts` so a link preview has tags to read.
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
 * One member's cast on one vote, opened in place over the roll:
 * `/bills/{term}/{type}/{number}/{vote}?member={bioguide}`.
 *
 * This is the URL the card pushes and the one that survives a reload — the
 * roll page is a real document and `vfu-vote-roll` reads the query.
 *
 * @param voteId - Recorded vote id (`119-HR-2616-184`)
 * @param bioguideId - Member id
 * @param base - Deployment base
 * @returns Roll path with the member named in the query
 */
export function voteCardPath(voteId: string, bioguideId: string, base = '/'): string {
  const roll = votePath(voteId, base) ?? withBaseUrl(`/bills/${voteId}`, base);
  return `${roll}?member=${encodeURIComponent(bioguideId)}`;
}

/**
 * The member a roll URL opens the card on, from its query string.
 *
 * @param href - A path, a query string, or both (`/bills/…/184?member=S001188`)
 * @returns Bioguide id, or null when no member is named
 */
export function parseVoteCardMember(href: string): string | null {
  const member = queryOf(href).get('member');
  return member && /^[A-Za-z0-9]+$/.test(member) ? member : null;
}

/**
 * The share stub for one member's cast on one vote:
 * `/bills/{term}/{type}/{number}/{vote}/{bioguide}`.
 *
 * A stub is a tiny document holding the link-preview tags and a hand-off to
 * {@link voteCardPath}. It only exists where the stub script wrote one, so
 * nothing links here unless stubs are being built for every cast — see
 * {@link voteShareUrl}.
 *
 * @param voteId - Recorded vote id (`119-HR-2616-184`)
 * @param bioguideId - Member id
 * @param base - Deployment base
 * @returns Stub path
 */
export function voteSharePath(voteId: string, bioguideId: string, base = '/'): string {
  const ref = parseVoteId(voteId);
  if (!ref) return withBaseUrl(`/bills/${voteId}/${bioguideId}`, base);
  return withBaseUrl(
    `/bills/${ref.term}/${ref.billType}/${ref.billNumber}/${ref.voteNumber}/${bioguideId}`,
    base,
  );
}

/**
 * Read a share-stub path back: `/bills/119/hr/2616/184/S001188`.
 *
 * @param pathname - Location pathname
 * @returns Path parts, or null when this is not a stub URL
 */
export function parseVoteSharePath(
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
 * The absolute URL the card offers for sharing.
 *
 * Where a stub was built for the cast it is the stub, whose tags give the link a
 * preview. Without, it is the in-place card URL: it has no preview of its own,
 * but it always resolves, which a path with no file behind it would not.
 *
 * @param voteId - Recorded vote id
 * @param bioguideId - Member id
 * @param options.origin - Site origin (`https://votedfor.us`)
 * @param options.stubs - True when a stub was built for this cast
 * @param options.base - Deployment base
 * @returns Absolute share URL
 */
export function voteShareUrl(
  voteId: string,
  bioguideId: string,
  options: { origin: string; stubs: boolean; base?: string },
): string {
  const origin = options.origin.replace(/\/$/, '');
  const base = options.base ?? '/';
  return `${origin}${options.stubs ? voteSharePath(voteId, bioguideId, base) : voteCardPath(voteId, bioguideId, base)}`;
}

/**
 * The bill a recorded vote belongs to: `119-HR-2616-184` is on `119-HR-2616`.
 *
 * @param voteId - Recorded vote id
 * @returns Bill id, upper-cased the way bill files spell it; null when unreadable
 */
export function billIdOfVote(voteId: string): string | null {
  const ref = parseVoteId(voteId);
  return ref && `${ref.term}-${ref.billType.toUpperCase()}-${ref.billNumber}`;
}

/**
 * Whether a share stub was built for a vote's casts.
 *
 * The scope is what the build was told to write stubs for, as a string an
 * element can carry in an attribute: `*` for every cast, otherwise the bill
 * ids, space-separated (`119-HR-4405 119-S-5`). Empty means none.
 *
 * @param scope - Stub scope from `src/shareConfig.ts`
 * @param voteId - Recorded vote id
 * @returns True when this vote's casts each have a stub
 */
export function stubsCover(scope: string, voteId: string): boolean {
  if (scope.trim() === '*') return true;
  const billId = billIdOfVote(voteId);
  return billId !== null && scope.split(/\s+/).includes(billId);
}

export function memberPath(bioguideId: string, base = '/'): string {
  return withBaseUrl(`/members/${bioguideId}`, base);
}

/**
 * One member's record on one bill: `/members/{bio}?bill={term}-{type}-{n}`.
 * The member page is the document; `vfu-member-record` reads the query.
 */
export function memberBillPath(
  bioguideId: string,
  term: string | number,
  billType: string,
  billNumber: string | number,
  base = '/',
): string {
  return `${memberPath(bioguideId, base)}?bill=${term}-${billSegment(billType, billNumber)}`;
}

/**
 * Read a member×bill URL back: `/members/R000579?bill=119-hr-2616` names the
 * bill a shared link opens on that member's page. A `vote` beside it is the
 * in-place card — see {@link parseMemberVotePath}.
 *
 * @param href - Pathname plus query string
 * @returns Parts, or null when the URL names no bill on a member page
 */
export function parseMemberBillPath(href: string): { bioguideId: string; term: string; segment: string } | null {
  const parsed = parseMemberQuery(href);
  return parsed && parsed.voteNumber == null
    ? { bioguideId: parsed.bioguideId, term: parsed.term, segment: parsed.segment }
    : null;
}

/**
 * The in-place card over a member's record:
 * `/members/{bio}?bill={term}-{type}-{n}&vote={vote}`.
 *
 * @param voteId - Recorded vote id (`119-HR-2616-184`)
 * @param bioguideId - Member id
 * @param base - Deployment base
 * @returns Member-context card URL
 */
export function memberVotePath(voteId: string, bioguideId: string, base = '/'): string {
  const ref = parseVoteId(voteId);
  if (!ref) return memberPath(bioguideId, base);
  return `${memberBillPath(bioguideId, ref.term, ref.billType, ref.billNumber, base)}&vote=${ref.voteNumber}`;
}

/**
 * Read a member-context card URL back: `/members/R000579?bill=119-hr-2616&vote=184`.
 *
 * @param href - Pathname plus query string
 * @returns Parts, or null when this is not a member card URL
 */
export function parseMemberVotePath(
  href: string,
): { bioguideId: string; term: string; segment: string; voteNumber: string } | null {
  const parsed = parseMemberQuery(href);
  return parsed && parsed.voteNumber != null
    ? { bioguideId: parsed.bioguideId, term: parsed.term, segment: parsed.segment, voteNumber: parsed.voteNumber }
    : null;
}

/** The query string of a path, a bare query, or a whole URL. */
function queryOf(href: string): URLSearchParams {
  const start = href.indexOf('?');
  const end = href.indexOf('#');
  return new URLSearchParams(start < 0 ? '' : href.slice(start + 1, end < 0 ? undefined : end));
}

/** `/members/{bio}?bill={term}-{type}-{n}[&vote={n}]`, taken apart. */
function parseMemberQuery(
  href: string,
): { bioguideId: string; term: string; segment: string; voteNumber: string | null } | null {
  const member = /\/members\/([A-Za-z0-9]+)\/?(?:[?#]|$)/.exec(href);
  if (!member) return null;
  const query = queryOf(href);
  const bill = /^(\d+)-([a-z]+-\d+)$/.exec(query.get('bill') ?? '');
  if (!bill) return null;
  const vote = query.get('vote');
  return {
    bioguideId: member[1],
    term: bill[1],
    segment: bill[2],
    voteNumber: vote && /^\d+$/.test(vote) ? vote : null,
  };
}
