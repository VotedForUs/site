import {
  formatLegislationIdentifier,
  formatLegislationTypeLabel,
} from './billLegislationFormat.js';
import {
  buildLegislatorVoteDisplay,
  type LegislatorVoteDisplay,
} from './legislatorVoteDisplay.js';
import { stateNameFromCode } from './stateNames.js';
import type { VotedCardProps } from '../types/votedCard.js';

/** Raw legislator vote row from the `legislatorVotes` collection. */
export type LegislatorVoteRecord = {
  bioguideId: string;
  voteId: string;
  vote: string;
  billId: string;
  billType: string;
  billNumber: string;
  billTitle: string;
  actionDate: string;
  rollNumber: number;
  chamber: string;
  question?: string;
  recordType?: string;
};

/** Normalized legislator fields used by vote views. */
export type LegislatorVoteLegislator = {
  nameTitle: string;
  party: string;
  state: string;
  stateName: string;
  chamber: 'sen' | 'rep';
  district?: number;
  imageUrl: string;
};

/** Layered view of one legislator's vote on one roll call. */
export type LegislatorVoteView = {
  ids: {
    voteId: string;
    bioguideId: string;
    billId: string;
  };
  vote: {
    cast: string;
    title: string;
    rollNumber: number;
    actionDate: string;
    chamber: string;
    question?: string;
    recordType?: string;
  };
  bill: {
    title: string;
    type: string;
    number: string;
    legislationIdentifier: string;
    legislationType: string;
  };
  legislator: LegislatorVoteLegislator;
  page: {
    title: string;
    socialCardPath: string;
  };
  display: LegislatorVoteDisplay;
};

export type ResolveLegislatorVoteFailureReason = 'vote-not-found' | 'legislator-not-found';

export type ResolveLegislatorVoteResult =
  | { ok: true; view: LegislatorVoteView }
  | { ok: false; reason: ResolveLegislatorVoteFailureReason };

/** Minimal legislator collection shape for building a vote view. */
export type LegislatorVoteLegislatorSource = {
  nameTitle: string;
  party?: string;
  state?: string;
  district?: number;
  type?: string;
  imageUrl?: string;
};

/** Data accessors used by {@link resolveLegislatorVoteViewWithSources}. */
export type LegislatorVoteViewSources = {
  getLegislatorVote: (id: string) => Promise<LegislatorVoteRecord | undefined>;
  getLegislator: (bioguideId: string) => Promise<LegislatorVoteLegislatorSource | undefined>;
};

/**
 * Maps a legislator collection `type` to card chamber values.
 *
 * @param type - Legislator type from collection data.
 * @returns `sen`, `rep`, or `rep` as the default.
 */
export function legislatorChamberFromType(type?: string): 'sen' | 'rep' {
  return type === 'sen' ? 'sen' : 'rep';
}

/**
 * Builds a {@link LegislatorVoteView} from collection-backed vote and legislator data.
 *
 * @param voteId - Recorded vote id.
 * @param bioguideId - Legislator bioguide id.
 * @param vote - Legislator vote row.
 * @param legislator - Legislator collection data.
 * @returns Layered vote view for pages, cards, and layout metadata.
 */
export function buildLegislatorVoteView(
  voteId: string,
  bioguideId: string,
  vote: LegislatorVoteRecord,
  legislator: LegislatorVoteLegislatorSource,
): LegislatorVoteView {
  const chamber = legislatorChamberFromType(legislator.type);
  const state = legislator.state ?? '';
  const stateName = stateNameFromCode(state);
  const party = legislator.party ?? '';
  const nameTitle = legislator.nameTitle ?? bioguideId;
  const voteTitle = vote.question ?? `Roll call ${vote.rollNumber}`;

  const legislatorView: LegislatorVoteLegislator = {
    nameTitle,
    party,
    state,
    stateName,
    chamber,
    district: legislator.district,
    imageUrl: legislator.imageUrl ?? '',
  };

  return {
    ids: {
      voteId,
      bioguideId,
      billId: vote.billId,
    },
    vote: {
      cast: vote.vote,
      title: voteTitle,
      rollNumber: vote.rollNumber,
      actionDate: vote.actionDate,
      chamber: vote.chamber,
      question: vote.question,
      recordType: vote.recordType,
    },
    bill: {
      title: vote.billTitle,
      type: vote.billType,
      number: vote.billNumber,
      legislationIdentifier: formatLegislationIdentifier(vote.billType, vote.billNumber),
      legislationType: formatLegislationTypeLabel(vote.billType),
    },
    legislator: legislatorView,
    page: {
      title: `${nameTitle} - ${vote.billType} ${vote.billNumber}`,
      socialCardPath: `/social-cards/v/${voteId}/${bioguideId}.png`,
    },
    display: buildLegislatorVoteDisplay({
      voteCast: vote.vote,
      recordType: vote.recordType,
      nameTitle,
      party,
      stateName,
      chamber,
      state,
      district: legislator.district,
    }),
  };
}

/**
 * Resolves a legislator vote view using injected data sources.
 *
 * @param params - Vote and legislator ids.
 * @param sources - Async accessors for vote and legislator rows.
 * @returns Discriminated union with the view or a failure reason.
 */
export async function resolveLegislatorVoteViewWithSources(
  params: { voteId: string; bioguideId: string },
  sources: LegislatorVoteViewSources,
): Promise<ResolveLegislatorVoteResult> {
  const { voteId, bioguideId } = params;
  const vote = await sources.getLegislatorVote(`${bioguideId}-${voteId}`);
  if (!vote) {
    return { ok: false, reason: 'vote-not-found' };
  }

  const legislator = await sources.getLegislator(bioguideId);
  if (!legislator) {
    return { ok: false, reason: 'legislator-not-found' };
  }

  return {
    ok: true,
    view: buildLegislatorVoteView(voteId, bioguideId, vote, legislator),
  };
}


/**
 * Maps a {@link LegislatorVoteView} to social card {@link VotedCardProps}.
 *
 * @param view - Layered legislator vote view.
 * @returns Props for {@link VotedCard}, including precomputed display fields.
 */
export function toVotedCardProps(view: LegislatorVoteView): VotedCardProps {
  return {
    nameTitle: view.legislator.nameTitle,
    party: view.legislator.party,
    stateName: view.legislator.stateName,
    chamber: view.legislator.chamber,
    state: view.legislator.state,
    district: view.legislator.district,
    imageUrl: view.legislator.imageUrl,
    voteCast: view.vote.cast,
    voteTitle: view.vote.title,
    legislationIdentifier: view.bill.legislationIdentifier,
    legislationType: view.bill.legislationType,
    billTitle: view.bill.title,
    displayName: view.display.displayName,
    memberSubtitle: view.display.memberSubtitle,
    voteVerb: view.display.voteVerb,
    emoji: view.display.emoji,
    actionLabel: view.display.actionLabel,
  };
}

/** Props for the page-level one-line {@link Voted} component. */
export type PageVotedProps = {
  nameTitle: string;
  voteCast: string;
  voteTitle: string;
  billTitle: string;
  recordType?: string;
};

/**
 * Maps a {@link LegislatorVoteView} to page-level `Voted` component props.
 *
 * @param view - Layered legislator vote view.
 * @returns Props for the page `Voted` component.
 */
export function toPageVotedProps(view: LegislatorVoteView): PageVotedProps {
  return {
    nameTitle: view.legislator.nameTitle,
    voteCast: view.vote.cast,
    voteTitle: view.vote.title,
    billTitle: view.bill.title,
    recordType: view.vote.recordType,
  };
}
