/**
 * A bill's actions, as a reader follows them: one line per thing that
 * happened, newest first, grouped by day.
 *
 * Congress.gov reports most floor actions twice — once from the chamber's own
 * feed and once from the Library of Congress — with the same date and nearly
 * the same words. The old table dropped every Library of Congress row to hide
 * the echo, which also dropped the rows only the Library reports: "Signed by
 * President", "Became Public Law". Here the two reports are merged instead, so
 * nothing is said twice and nothing is lost.
 */
export type TimelineActor = 'House' | 'Senate' | 'President';

/** The fields of a raw action this reads; everything else is ignored. */
export type TimelineAction = {
  actionDate?: string;
  actionTime?: string;
  text?: string;
  type?: string;
  sourceSystem?: { name?: string };
  recordedVotes?: Array<{ id?: string }>;
};

export type TimelineEntry = {
  date: string;
  /** `14:31:00`, when the chamber recorded one. */
  time?: string;
  /** Who acted. Null when the data does not say. */
  actor: TimelineActor | null;
  text: string;
  /** Ids of the recorded votes taken at this action. */
  voteIds: string[];
};

export type TimelineDay = { date: string; entries: TimelineEntry[] };

/**
 * Who acted. The chamber feed is trusted over the action's `type`, which the
 * API sets to "President" on some House floor votes.
 */
export function actorOf(action: TimelineAction): TimelineActor | null {
  const source = action.sourceSystem?.name ?? '';
  if (/house/i.test(source)) return 'House';
  if (/senate/i.test(source)) return 'Senate';
  const type = (action.type ?? '').toLowerCase();
  if (type === 'president' || type === 'becamelaw') return 'President';
  return null;
}

/** Two reports of one action differ in punctuation and spacing, not in words. */
function sameActionKey(action: TimelineAction): string {
  const text = (action.text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `${action.actionDate ?? ''}|${text}`;
}

/**
 * The timeline, in the order the data gives it (newest first), with repeated
 * reports of one action folded into the first of them.
 *
 * A fold keeps whatever either report knew: the chamber, the time, the votes.
 */
export function timelineOf(actions: TimelineAction[]): TimelineEntry[] {
  const entries = new Map<string, TimelineEntry>();
  for (const action of actions) {
    const text = (action.text ?? '').trim();
    if (!text || !action.actionDate) continue;
    const key = sameActionKey(action);
    const voteIds = (action.recordedVotes ?? []).map(vote => vote.id).filter((id): id is string => !!id);
    const actor = actorOf(action);
    const seen = entries.get(key);
    if (!seen) {
      entries.set(key, { date: action.actionDate.slice(0, 10), time: action.actionTime, actor, text, voteIds });
      continue;
    }
    // A chamber is more specific than "President", which is what the Library
    // of Congress echo of a floor action is typed as.
    if (actor && (!seen.actor || (seen.actor === 'President' && actor !== 'President'))) seen.actor = actor;
    seen.time ??= action.actionTime;
    for (const id of voteIds) if (!seen.voteIds.includes(id)) seen.voteIds.push(id);
  }
  return [...entries.values()];
}

/** Consecutive entries of one date, as one day. Order is kept. */
export function groupByDay(entries: TimelineEntry[]): TimelineDay[] {
  const days: TimelineDay[] = [];
  for (const entry of entries) {
    const last = days[days.length - 1];
    if (last && last.date === entry.date) last.entries.push(entry);
    else days.push({ date: entry.date, entries: [entry] });
  }
  return days;
}
