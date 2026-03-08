/**
 * Build breadcrumb list from the current pathname.
 * Single source of truth: no need to repeat crumb arrays in every page.
 */

import { BILL_TYPES } from '@votedforus/votes/types';

export interface BreadcrumbItem {
  label: string;
  href: string;
}

function billTypeLabel(seg: string): string {
  const lower = seg.toLowerCase();
  return BILL_TYPES.includes(lower as (typeof BILL_TYPES)[number]) ? seg.toUpperCase() : seg;
}

/**
 * Parse short vote id (e.g. "119-SJRES-104-1") into congress, billType, billNumber, voteNum.
 * Returns undefined if not enough parts.
 */
function parseVoteId(voteId: string): { congress: string; billType: string; billNumber: string; voteNum: string } | undefined {
  const parts = voteId.split('-');
  if (parts.length < 4) return undefined;
  const voteNum = parts.pop()!;
  const billNumber = parts.pop()!;
  const billType = parts.pop() ?? ''; // e.g. SJRES, HR
  const congress = parts.pop() ?? '';
  return { congress, billType, billNumber, voteNum };
}

/**
 * Returns breadcrumb items for a given pathname.
 * /v/[voteId]/[bioguideId] gets the same structure as /bills/[term]/[billType]/[billNumber]/[voteId]/[bioguideId] (labels and full URL hrefs).
 * @param pathname - e.g. "/bills/119/hr/1" or "/v/119-HR-1-1/B000944"
 * @param options.pageTitle - Used as the label for the last (current) crumb when provided
 */
export function getBreadcrumbsFromPath(
  pathname: string,
  options?: { pageTitle?: string }
): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    return [{ label: 'Home', href: '/' }];
  }

  // Short URL /v/voteId/bioguideId: same breadcrumb structure as full bill vote page, with full URLs
  if (segments[0] === 'v' && segments.length >= 2) {
    const parsed = parseVoteId(segments[1]!);
    if (parsed) {
      const { congress, billType, billNumber, voteNum } = parsed;
      const typeLower = billType.toLowerCase();
      const base = `/bills/${congress}/${typeLower}/${billNumber}`;
      const crumbs: BreadcrumbItem[] = [
        { label: 'Home', href: '/' },
        { label: 'Bills', href: '/bills' },
        { label: `${congress}th Congress`, href: `/bills/${congress}` },
        { label: billTypeLabel(typeLower), href: `/bills/${congress}/${typeLower}` },
        { label: `${billTypeLabel(typeLower)} ${billNumber}`, href: base },
        { label: `Vote ${voteNum}`, href: `${base}/${voteNum}` },
      ];
      if (segments[2]) {
        crumbs.push({
          label: options?.pageTitle ?? segments[2],
          href: `${base}/${voteNum}/${segments[2]}`,
        });
      }
      return crumbs;
    }
  }

  const crumbs: BreadcrumbItem[] = [{ label: 'Home', href: '/' }];
  const pageTitle = options?.pageTitle;

  for (let i = 0; i < segments.length; i++) {
    const href = '/' + segments.slice(0, i + 1).join('/');
    const isLast = i === segments.length - 1;
    let label: string;

    if (isLast && pageTitle) {
      label = pageTitle;
    } else {
      label = labelForSegment(segments, i);
    }
    crumbs.push({ label, href });
  }

  return crumbs;
}

function labelForSegment(segments: string[], index: number): string {
  const seg = segments[index];

  if (index === 0) {
    if (seg === 'bills') return 'Bills';
    if (seg === 'legislators') return 'Legislators';
    if (seg === 'about') return 'About';
    return seg.charAt(0).toUpperCase() + seg.slice(1);
  }

  if (segments[0] === 'bills') {
    if (index === 1 && /^\d+$/.test(seg)) return `${seg}th Congress`;
    if (index === 2) return billTypeLabel(seg);
    if (index === 3) return `${billTypeLabel(segments[2] ?? '')} ${seg}`;
    if (index === 4) return `Vote ${seg}`;
    if (index === 5) return seg; // bioguideid on vote page
  }

  if (segments[0] === 'legislators' && index === 1) {
    if (seg === 'senate') return 'Senate';
    if (seg === 'house') return 'House';
    return seg; // bioguideId fallback when no pageTitle
  }

  return seg;
}
