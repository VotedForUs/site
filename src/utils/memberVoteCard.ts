/**
 * Fields for the in-place vote dialog, and the function that writes them.
 *
 * The dialog opens in two places: over a member's record (their votes on one
 * bill) and over a vote's roll (every member's cast on it). The card face is
 * the same; what differs is where prev, next and close lead, and whether the
 * member's identity has to be written too — on a member's page it is already
 * in the markup, on a roll it changes with every row.
 */
import { buildLegislatorVoteDisplay } from './legislatorVoteDisplay.js';
import type { VotedCardProps } from '../types/votedCard.js';
import {
  memberBillPath,
  memberVotePath,
  parseVoteId,
  stubsCover,
  voteCardPath,
  votePath,
  voteShareUrl,
} from './voteLinks.js';

/** What both contexts need to describe one cast. */
type CastInput = {
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
  shareOrigin: string;
  /** What stubs the build wrote — `SHARE_STUB_SCOPE` from `src/shareConfig.ts`. */
  shareStubScope?: string;
  base?: string;
};

/** Inputs needed to fill one member-context card. */
export type MemberVoteCardInput = CastInput & {
  prevVoteId?: string | null;
  nextVoteId?: string | null;
};

/** Inputs needed to fill one roll-context card. */
export type RollVoteCardInput = CastInput & {
  prevBioguideId?: string | null;
  nextBioguideId?: string | null;
  /** Public path of the member's portrait, or null when none is held. */
  imageUrl: string | null;
};

/** The member on the card face. Written only where it changes per card. */
export type VoteCardIdentity = {
  bioguideId: string;
  displayName: string;
  memberSubtitle: string;
  party: string;
  imageUrl: string | null;
};

/** Values written into the dialog shell and {@link VotedCard} slots. */
export type MemberVoteCardFields = {
  voteId: string;
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
  identity?: VoteCardIdentity;
};

/** The parts of the card that do not depend on where it is open. */
function castFields(input: CastInput) {
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
  return {
    display,
    fields: {
      voteId: input.voteId,
      voteVerb: display.voteVerb,
      emoji: display.emoji,
      actionLabel: display.actionLabel,
      voteTitle: input.voteTitle,
      billTitle: input.billTitle,
      schemaActionOption: display.proc ? 'Yea' : display.actionLabel,
      schemaDescription: display.proc ? display.actionLabel : input.voteTitle,
      shareUrl: voteShareUrl(input.voteId, input.bioguideId, {
        origin: input.shareOrigin,
        stubs: stubsCover(input.shareStubScope ?? '', input.voteId),
        base: input.base ?? '/',
      }),
    },
  };
}

/**
 * Derive dialog and card fields for one member×vote, opened on the member's page.
 *
 * @param input - Vote, member identity, and adjacent vote ids
 * @returns Strings and hrefs for {@link applyVoteCard}
 */
export function memberVoteCardFields(input: MemberVoteCardInput): MemberVoteCardFields {
  const base = input.base ?? '/';
  const ref = parseVoteId(input.voteId);
  return {
    ...castFields(input).fields,
    prevHref: input.prevVoteId ? memberVotePath(input.prevVoteId, input.bioguideId, base) : null,
    nextHref: input.nextVoteId ? memberVotePath(input.nextVoteId, input.bioguideId, base) : null,
    closeHref: ref
      ? memberBillPath(input.bioguideId, ref.term, ref.billType, ref.billNumber, base)
      : '',
  };
}

/**
 * Derive dialog and card fields for one member×vote, opened on the vote's roll.
 * Prev and next step through the roll's members; close returns to the roll.
 *
 * @param input - Vote, member identity, and adjacent member ids
 * @returns Strings, hrefs and the member identity for {@link applyVoteCard}
 */
export function rollVoteCardFields(input: RollVoteCardInput): MemberVoteCardFields {
  const base = input.base ?? '/';
  const { display, fields } = castFields(input);
  return {
    ...fields,
    prevHref: input.prevBioguideId ? voteCardPath(input.voteId, input.prevBioguideId, base) : null,
    nextHref: input.nextBioguideId ? voteCardPath(input.voteId, input.nextBioguideId, base) : null,
    closeHref: votePath(input.voteId, base) ?? '',
    identity: {
      bioguideId: input.bioguideId,
      displayName: display.displayName,
      memberSubtitle: display.memberSubtitle,
      party: input.party,
      imageUrl: input.imageUrl,
    },
  };
}

/**
 * Card fields straight from finished {@link VotedCardProps} — the share-card
 * capture page, where the server has already resolved every string and the
 * card stands alone: no dialog, so nothing to step to, close or share.
 *
 * @param props - One cast's card props, as `toVotedCardProps` builds them
 * @returns Fields for {@link applyVoteCard}
 */
export function cardFieldsFromProps(props: VotedCardProps): MemberVoteCardFields {
  return {
    voteId: '',
    voteVerb: props.voteVerb,
    emoji: props.emoji,
    actionLabel: props.actionLabel,
    voteTitle: props.voteTitle,
    billTitle: props.billTitle,
    schemaActionOption: props.schemaActionOption ?? props.actionLabel,
    schemaDescription: props.schemaDescription ?? props.voteTitle,
    shareUrl: '',
    prevHref: null,
    nextHref: null,
    closeHref: '',
    identity: {
      bioguideId: props.bioguideId ?? '',
      displayName: props.displayName,
      memberSubtitle: props.memberSubtitle,
      party: props.party,
      imageUrl: props.imageUrl || null,
    },
  };
}

/**
 * Write {@link MemberVoteCardFields} into a dialog that already has the card markup.
 *
 * @param root - `vfu-vote-card` or an ancestor that contains it
 * @param fields - Output of {@link memberVoteCardFields} or {@link rollVoteCardFields}
 */
export function applyVoteCard(root: ParentNode, fields: MemberVoteCardFields): void {
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
  if (fields.identity) applyIdentity(root, fields.identity);

  const share = root.querySelector<HTMLInputElement>('[data-share]');
  if (share) share.value = fields.shareUrl;

  const host = root instanceof Element && root.matches('vfu-vote-card')
    ? root
    : root.querySelector('vfu-vote-card');
  host?.setAttribute('share-url', fields.shareUrl);
  host?.setAttribute('close-href', fields.closeHref);
  host?.setAttribute('vote-id', fields.voteId);
  if (fields.identity) host?.setAttribute('bioguide-id', fields.identity.bioguideId);

  setNavHref(root, '[data-prev]', fields.prevHref);
  setNavHref(root, '[data-next]', fields.nextHref);
}

/** The name the member page has always imported this under. */
export const applyMemberVoteCard = applyVoteCard;

/**
 * Write the member onto the card face: name, subtitle, portrait and the
 * schema.org Person fields that name them.
 *
 * @param root - Search root
 * @param identity - The member this card is about
 */
function applyIdentity(root: ParentNode, identity: VoteCardIdentity): void {
  setText(root, '[data-field="display-name"]', identity.displayName);
  setText(root, '[data-field="subtitle"]', identity.memberSubtitle);
  setText(root, '[data-field="party"]', identity.party);
  setMeta(root, '[data-field="identifier"]', identity.bioguideId);
  setMeta(root, '[data-field="job-title"]', identity.memberSubtitle);
  root.querySelector('[data-field="same-as"]')
    ?.setAttribute('href', `https://bioguide.congress.gov/search/bio/${identity.bioguideId}`);

  const image = root.querySelector<HTMLImageElement>('[data-field="image"]');
  const blank = root.querySelector<HTMLElement>('[data-field="image-fallback"]');
  if (image) {
    if (identity.imageUrl) {
      // Clear first: the previous member's portrait must not show while this one loads.
      image.removeAttribute('src');
      image.src = identity.imageUrl;
      image.alt = `Photo of ${identity.displayName}`;
    }
    image.hidden = !identity.imageUrl;
  }
  if (blank) blank.hidden = Boolean(identity.imageUrl);
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
