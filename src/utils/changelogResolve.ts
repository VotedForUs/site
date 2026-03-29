import type { CollectionEntry } from 'astro:content';

import type { ChangelogBillRef } from '../types.zod';

/** Normalize bill id keys like `119-hr-1` and `119-HR-1` for map lookup. */
export function normalizeBillIdKey(id: string): string {
  const m = id.match(/^(\d+)-([A-Za-z]+)-(.+)$/);
  if (!m) return id;
  return `${m[1]}-${m[2].toUpperCase()}-${m[3]}`;
}

/**
 * Changelog JSON may list bills as plain id strings or as `{ id, title?, ... }` objects.
 *
 * @param ref - String id or rich row from changelog JSON.
 * @returns Canonical id string and optional title from the row when present.
 */
export function parseChangelogBillRef(ref: ChangelogBillRef): {
  id: string;
  inlineTitle?: string;
} {
  if (typeof ref === 'string') {
    return { id: ref };
  }
  return { id: ref.id, inlineTitle: ref.title };
}

export function buildLegislatorLookup(
  entries: CollectionEntry<'legislators'>[],
): Map<string, CollectionEntry<'legislators'>> {
  const m = new Map<string, CollectionEntry<'legislators'>>();
  for (const e of entries) {
    m.set(e.id, e);
    const bg = typeof e.data.bioguide === 'string' ? e.data.bioguide : undefined;
    if (bg) m.set(bg, e);
  }
  return m;
}

export function buildBillLookup(
  entries: CollectionEntry<'bills'>[],
): Map<string, CollectionEntry<'bills'>> {
  const m = new Map<string, CollectionEntry<'bills'>>();
  for (const e of entries) {
    m.set(e.id, e);
    m.set(normalizeBillIdKey(e.id), e);
    const t = e.data.type;
    const c = e.data.congress;
    const n = e.data.number;
    if (t != null && c != null && n != null) {
      m.set(`${c}-${String(t).toUpperCase()}-${n}`, e);
    }
  }
  return m;
}

export type ResolvedLegislatorLine = {
  label: string;
  href: string | undefined;
  party: string;
  state: string;
};

export function resolveLegislatorLine(
  bioguideId: string,
  lookup: Map<string, CollectionEntry<'legislators'>>,
  base: string,
): ResolvedLegislatorLine {
  const entry = lookup.get(bioguideId);
  if (!entry) {
    return { label: bioguideId, href: undefined, party: '', state: '' };
  }
  const d = entry.data;
  const slug = entry.id;
  return {
    label: d.nameTitle ?? d.name ?? bioguideId,
    href: `${base}legislators/${slug}`,
    party: d.party ?? '',
    state: d.state ?? '',
  };
}

export type ResolvedBillLine = {
  label: string;
  href: string;
  meta: string;
};

export function resolveBillLine(
  billRef: ChangelogBillRef,
  lookup: Map<string, CollectionEntry<'bills'>>,
  base: string,
): ResolvedBillLine {
  const { id: billId, inlineTitle } = parseChangelogBillRef(billRef);
  const key = normalizeBillIdKey(billId);
  const entry = lookup.get(billId) ?? lookup.get(key);
  const parsed = billId.match(/^(\d+)-([A-Za-z]+)-(.+)$/);
  const congress = parsed?.[1] ?? '?';
  const billType = (parsed?.[2] ?? '?').toUpperCase();
  const number = parsed?.[3] ?? billId;
  const href = `${base}bills/${congress}/${billType.toLowerCase()}/${number}`;
  const title =
    (entry?.data as { title?: string } | undefined)?.title ?? inlineTitle ?? billId;
  const meta = `${billType} ${number} · ${congress}th Congress`;
  return { label: title, href, meta };
}
