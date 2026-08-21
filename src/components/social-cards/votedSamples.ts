import { buildLegislatorVoteDisplay } from '../../utils/legislatorVoteDisplay.js';
import type { VotedCardProps, VotedCardSource } from '../../types/votedCard.js';

/**
 * Attaches precomputed display fields to a sample source object.
 *
 * @param source - Raw identity / vote / bill fields for a sample.
 * @returns Full {@link VotedCardProps} for Storybook and the design playground.
 */
function votedCardSample(source: VotedCardSource): VotedCardProps {
  const display = buildLegislatorVoteDisplay(source);
  return {
    ...source,
    displayName: display.displayName,
    memberSubtitle: display.memberSubtitle,
    voteVerb: display.voteVerb,
    emoji: display.emoji,
    actionLabel: display.actionLabel,
  };
}

/**
 * Static layout samples for Storybook / `/social-card-design?case=…`.
 *
 * Keys are **story labels** (short, long-both, …), not shared IDs with
 * {@link votedResolverStoryFixtures} — resolver fixtures use different real
 * `(voteId, bioguideId)` pairs for some of the same key names.
 *
 * Iteration rule: any change must look correct at `long-both` before we ship it.
 */
export const votedSamples = {
  // Sanity check. Bill 119-S-960; legislator B001310.
  short: votedCardSample({
    nameTitle: 'Sen. Mike Braun (IN)',
    party: 'Republican',
    stateName: 'Indiana',
    chamber: 'sen',
    state: 'IN',
    imageUrl: '/images/legislators/B001310.jpg',
    voteCast: 'Yea',
    voteTitle: 'On Passage',
    legislationIdentifier: 'S. 960',
    legislationType: 'act',
    billTitle: 'Justice for Murder Victims Act',
  }),

  // Typical real vote. Bill 119-S-550; legislator S000033.
  medium: votedCardSample({
    nameTitle: 'Sen. Bernie Sanders (VT)',
    party: 'Independent',
    stateName: 'Vermont',
    chamber: 'sen',
    state: 'VT',
    imageUrl: '/images/legislators/S000033.jpg',
    voteCast: 'Nay',
    voteTitle: 'On the Motion to Proceed',
    legislationIdentifier: 'S. 550',
    legislationType: 'act',
    billTitle:
      'A bill to provide for the equitable settlement of certain Indian land disputes regarding land in Illinois, and for other purposes.',
  }),

  // Long bill title only. Raw `title` field of 119-HRES-916 (~1,390 chars).
  'long-bill': votedCardSample({
    nameTitle: 'Sen. Mike Braun (IN)',
    party: 'Republican',
    stateName: 'Indiana',
    chamber: 'sen',
    state: 'IN',
    imageUrl: '/images/legislators/B001310.jpg',
    voteCast: 'Yea',
    voteTitle: 'On consideration of the resolution',
    legislationIdentifier: 'H. Res. 916',
    legislationType: 'simple resolution',
    billTitle: `Providing for consideration of the bill (H.R. 4312) to protect the name, image, and likeness rights of student athletes and to promote fair competition with respect to intercollegiate athletics, and for other purposes; providing for consideration of the bill (H.R. 1005) to prohibit elementary and secondary schools from accepting funds from or entering into contracts with the Government of the People's Republic of China and the Chinese Communist Party, and for other purposes; providing for consideration of the bill (H.R. 1049) to ensure that parents are aware of foreign influence in their child's public school, and for other purposes; providing for consideration of the bill (H.R. 1069) to prohibit the availability of Federal education funds for elementary and secondary schools that receive direct or indirect support from the Government of the People's Republic of China; providing for consideration of the bill (H.R. 2965) to require the Administrator of the Small Business Administration to ensure that the small business regulatory budget for a small business concern in a fiscal year is not greater than zero, and for other purposes; and providing for consideration of the bill (H.R. 4305) to direct the Chief Counsel for Advocacy of the Small Business Administration to establish a Red Tape Hotline to receive notifications of burdensome agency rules, and for other purposes.`,
  }),

  // Longest real `nameTitle` in the dataset (42 chars), short title.
  'long-leg': votedCardSample({
    nameTitle: 'Rep. Gregorio Kilili Camacho Sablan (MP-0)',
    party: 'Democrat',
    stateName: 'Northern Mariana Islands',
    chamber: 'rep',
    state: 'MP',
    district: 0,
    imageUrl: '/images/legislators/S001177.jpg',
    voteCast: 'Yea',
    voteTitle: 'On Passage',
    legislationIdentifier: 'S. 960',
    legislationType: 'act',
    billTitle: 'Justice for Murder Victims Act',
  }),

  // Default: absolute worst case in real data.
  // Raw `title` field of 119-HRES-354 (~1,955 chars - longest title in current data).
  'long-both': votedCardSample({
    nameTitle: 'Rep. Gregorio Kilili Camacho Sablan (MP-0)',
    party: 'Democrat',
    stateName: 'Northern Mariana Islands',
    chamber: 'rep',
    state: 'MP',
    district: 0,
    imageUrl: '/images/legislators/S001177.jpg',
    voteCast: 'Yea',
    voteTitle: 'On consideration of the resolution',
    legislationIdentifier: 'H. Res. 354',
    legislationType: 'simple resolution',
    billTitle: `Providing for consideration of the joint resolution (H.J. Res. 60) providing for congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by the National Park Service relating to "Glen Canyon National Recreation Area: Motor Vehicles"; providing for consideration of the joint resolution (H.J. Res. 78) providing for congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by the United States Fish and Wildlife Service relating to "Endangered and Threatened Wildlife and Plants; Endangered Species Status for the San Francisco Bay-Delta Distinct Population Segment of the Longfin Smelt"; providing for consideration of the joint resolution (H.J. Res. 87) providing congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by the Environmental Protection Agency relating to "California State Motor Vehicle and Engine Pollution Control Standards; Heavy-Duty Vehicle and Engine Emission Warranty and Maintenance Provisions; Advanced Clean Trucks; Zero Emission Airport Shuttle; Zero-Emission Power Train Certification; Waiver of Preemption; Notice of Decision"; providing for consideration of the joint resolution (H.J. Res. 88) providing congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by the Environmental Protection Agency relating to "California State Motor Vehicle and Engine Pollution Control Standards; Advanced Clean Cars II; Waiver of Preemption; Notice of Decision"; providing for consideration of the joint resolution (H.J. Res. 89) providing congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by the Environmental Protection Agency relating to "California State Motor Vehicle and Engine and Nonroad Engine Pollution Control Standards; The 'Omnibus' Low NOX Regulation; Waiver of Preemption; Notice of Decision"; and for other purposes.`,
  }),

  // Senate-side procedural pass. Bill 119-S-284.
  'procedural-uc': votedCardSample({
    nameTitle: 'Sen. Bernie Sanders (VT)',
    party: 'Independent',
    stateName: 'Vermont',
    chamber: 'sen',
    state: 'VT',
    imageUrl: '/images/legislators/S000033.jpg',
    voteCast: 'UC',
    voteTitle: 'Pass with Unanimous Consent',
    legislationIdentifier: 'S. 284',
    legislationType: 'act',
    billTitle: 'Congressional Award Program Reauthorization Act',
  }),

  // House voice vote. Bill 119-HCONRES-73.
  'procedural-voice': votedCardSample({
    nameTitle: 'Rep. Robert Aderholt (AL-4)',
    party: 'Republican',
    stateName: 'Alabama',
    chamber: 'rep',
    state: 'AL',
    district: 4,
    imageUrl: '/images/legislators/A000055.jpg',
    voteCast: 'vv',
    voteTitle: 'Voice Vote',
    legislationIdentifier: 'H. Con. Res. 73',
    legislationType: 'concurrent resolution',
    billTitle:
      "Authorizing the use of the Capitol Grounds for the National Peace Officers' Memorial Service and the National Honor Guard and Pipe Band Exhibition.",
  }),

  // House Rep, recorded Aye. Bill 119-HR-1442 (real title via getBestBillTitle).
  'house-aye': votedCardSample({
    nameTitle: 'Rep. Mike Johnson (LA-4)',
    party: 'Republican',
    stateName: 'Louisiana',
    chamber: 'rep',
    state: 'LA',
    district: 4,
    imageUrl: '/images/legislators/J000299.jpg',
    voteCast: 'Aye',
    voteTitle: 'On Motion to Suspend the Rules and Pass',
    legislationIdentifier: 'H.R. 1442',
    legislationType: 'act',
    billTitle: 'Youth Poisoning Protection Act',
  }),

  // House Rep, recorded No. Bill 119-HR-3486 (real title via getBestBillTitle).
  'house-no': votedCardSample({
    nameTitle: 'Rep. Hakeem Jeffries (NY-8)',
    party: 'Democrat',
    stateName: 'New York',
    chamber: 'rep',
    state: 'NY',
    district: 8,
    imageUrl: '/images/legislators/J000294.jpg',
    voteCast: 'No',
    voteTitle: 'On Passage',
    legislationIdentifier: 'H.R. 3486',
    legislationType: 'act',
    billTitle: 'Stop Illegal Entry Act of 2025',
  }),
} as const satisfies Record<string, VotedCardProps>;

export type VotedSampleKey = keyof typeof votedSamples;
