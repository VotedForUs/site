/**
 * Fields for the in-place vote dialog on a member record.
 *
 * The share URL is always the canonical `/bills/…/{bio}` path (og:image).
 * Prev/next and close stay on the member client route.
 */
import { buildLegislatorVoteDisplay } from './legislatorVoteDisplay.js';
import {
  memberBillPath,
  memberVotePath,
  parseVoteId,
  voteMemberPath,
} from './voteLinks.js';

/** Inputs needed to fill one member-context card. */
export type MemberVoteCardInput = {
  voteId: string;
  bioguideId: string;
  voteCast: string;
  recordType?: string;
  voteTitle: string;
  billTitle: string;
  nameTitle: string;
  party: string;
  stateName: string;
  chamber: 'sen' | 'rep';
  state: string;
  district?: number;
  prevVoteId?: string | null;
  nextVoteId?: string | null;
  shareOrigin: string;
  base?: string;
};

/** Values written into the dialog shell and {@link VotedCard} slots. */
export type MemberVoteCardFields = {
  voteVerb: string;
  emoji: string;
  actionLabel: string;
  voteTitle: string;
  billTitle: string;
  schemaActionOption: string;
  schemaDescription: string;
  shareUrl: string;
  prevHref: string | null;
  nextHref: string | null;
  closeHref: string;
};

/**
 * Derive dialog and card fields for one member×vote.
 *
 * @param input - Vote, member identity, and adjacent vote ids
 * @returns Strings and hrefs for {@link applyMemberVoteCard}
 */
export function memberVoteCardFields(input: MemberVoteCardInput): MemberVoteCardFields {
  const display = buildLegislatorVoteDisplay({
    voteCast: input.voteCast,
    nameTitle: input.nameTitle,
    party: input.party,
    stateName: input.stateName,
    chamber: input.chamber,
    state: input.state,
    district: input.district,
    recordType: input.recordType,
  });
  const origin = input.shareOrigin.replace(/\/$/, '');
  const base = input.base ?? '/';
  const ref = parseVoteId(input.voteId);
  return {
    voteVerb: display.voteVerb,
    emoji: display.emoji,
    actionLabel: display.actionLabel,
    voteTitle: input.voteTitle,
    billTitle: input.billTitle,
    schemaActionOption: display.proc ? 'Yea' : display.actionLabel,
    schemaDescription: display.proc ? display.actionLabel : input.voteTitle,
    shareUrl: `${origin}${voteMemberPath(input.voteId, input.bioguideId)}`,
    prevHref: input.prevVoteId ? memberVotePath(input.prevVoteId, input.bioguideId, base) : null,
    nextHref: input.nextVoteId ? memberVotePath(input.nextVoteId, input.bioguideId, base) : null,
    closeHref: ref
      ? memberBillPath(input.bioguideId, ref.term, ref.billType, ref.billNumber, base)
      : '',
  };
}

/**
 * Write {@link MemberVoteCardFields} into a dialog that already has the card markup.
 *
 * @param root - `vfu-vote-card` or an ancestor that contains it
 * @param fields - Output of {@link memberVoteCardFields}
 */
export function applyMemberVoteCard(root: ParentNode, fields: MemberVoteCardFields): void {
  setText(root, '[data-field="vote-verb"]', fields.voteVerb);
  setText(root, '[data-field="action-label"]', fields.actionLabel);
  setText(root, '[data-field="vote-title"]', fields.voteTitle);
  const bill = root.querySelector<HTMLElement>('[data-field="bill-title"]');
  if (bill) {
    bill.textContent = fields.billTitle;
    bill.style.setProperty('--title-chars', String(fields.billTitle.length));
  }
  const emoji = root.querySelector<HTMLElement>('[data-field="emoji"]');
  if (emoji) {
    emoji.textContent = fields.emoji;
    emoji.hidden = !fields.emoji;
  }
  setMeta(root, '[data-field="action-option"]', fields.schemaActionOption);
  setMeta(root, '[data-field="description"]', fields.schemaDescription);

  const share = root.querySelector<HTMLInputElement>('[data-share]');
  if (share) share.value = fields.shareUrl;

  const host = root instanceof Element && root.matches('vfu-vote-card')
    ? root
    : root.querySelector('vfu-vote-card');
  host?.setAttribute('share-url', fields.shareUrl);
  host?.setAttribute('close-href', fields.closeHref);
  host?.setAttribute('vote-id', parseVoteIdFromShare(fields.shareUrl));

  setNavHref(root, '[data-prev]', fields.prevHref);
  setNavHref(root, '[data-next]', fields.nextHref);
}

/**
 * Pull the vote id out of a canonical share URL's last two segments.
 *
 * @param shareUrl - `https://votedfor.us/bills/119/hr/2616/184/R000579`
 * @returns Recorded vote id, or empty
 */
function parseVoteIdFromShare(shareUrl: string): string {
  const match = /\/bills\/(\d+)\/([a-z]+)\/(\d+)\/(\d+)\//i.exec(shareUrl);
  return match ? `${match[1]}-${match[2].toUpperCase()}-${match[3]}-${match[4]}` : '';
}

/**
 * Set text content when the slot exists.
 *
 * @param root - Search root
 * @param selector - Slot selector
 * @param value - Text to write
 */
function setText(root: ParentNode, selector: string, value: string): void {
  const el = root.querySelector(selector);
  if (el) el.textContent = value;
}

/**
 * Set a meta `content` attribute when the node exists.
 *
 * @param root - Search root
 * @param selector - Meta selector
 * @param value - Content value
 */
function setMeta(root: ParentNode, selector: string, value: string): void {
  const el = root.querySelector(selector);
  if (el) el.setAttribute('content', value);
}

/**
 * Show or hide a prev/next control.
 *
 * @param root - Search root
 * @param selector - Anchor selector
 * @param href - Destination, or null to hide
 */
function setNavHref(root: ParentNode, selector: string, href: string | null): void {
  const el = root.querySelector<HTMLAnchorElement>(selector);
  if (!el) return;
  if (href) {
    el.href = href;
    el.hidden = false;
  } else {
    el.removeAttribute('href');
    el.hidden = true;
  }
}
