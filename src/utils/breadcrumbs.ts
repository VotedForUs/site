/**
 * Build breadcrumb list from the current pathname.
 * Single source of truth: no need to repeat crumb arrays in every page.
 */

import { BILL_TYPES } from '@votedforus/votes/types';
import { parseBillSegment } from './voteLinks.js';
import { formatLegislationIdentifier } from './billLegislationFormat.js';

export interface BreadcrumbItem {
  label: string;
  href: string;
}

function billTypeLabel(seg: string): string {
  const lower = seg.toLowerCase();
  return BILL_TYPES.includes(lower as (typeof BILL_TYPES)[number]) ? seg.toUpperCase() : seg;
}

/**
 * Returns breadcrumb items for a given pathname.
 *
 * @param pathname - e.g. `/bills/119/hr/1` or `/members/S000033/119/s-306/1`
 * @param options.pageTitle - Used as the label for the last (current) crumb when provided
 * @param options.labels - Labels for segments only the page can name, keyed by
 * the segment itself (a bioguide id, say, which is not a name until a page
 * looks it up)
 * @param options.base - Deployment base (`import.meta.env.BASE_URL`). Its
 * segments are not crumbs: a preview at `/site-previews/pr-preview/pr-7/` has
 * the same trail as the site at `/`, with every link under the base.
 */
export function getBreadcrumbsFromPath(
  pathname: string,
  options?: { pageTitle?: string; labels?: Record<string, string>; base?: string }
): BreadcrumbItem[] {
  const base = (options?.base ?? '/').replace(/\/+$/, '');
  const within = base && (pathname === base || pathname.startsWith(`${base}/`)) ? pathname.slice(base.length) : pathname;
  const segments = within.split('/').filter(Boolean);
  const home = { label: 'Home', href: `${base}/` };
  if (segments.length === 0) {
    return [home];
  }

  const crumbs: BreadcrumbItem[] = [home];
  const pageTitle = options?.pageTitle;

  for (let i = 0; i < segments.length; i++) {
    const href = `${base}/` + segments.slice(0, i + 1).join('/');
    const isLast = i === segments.length - 1;
    let label: string;

    if (isLast && pageTitle) {
      label = pageTitle;
    } else {
      label = options?.labels?.[segments[i]] ?? labelForSegment(segments, i);
    }
    crumbs.push({ label, href });
  }

  return crumbs;
}

/**
 * Default crumb label for one path segment.
 *
 * @param segments - Path parts after the leading slash
 * @param index - Segment being labelled
 * @returns Display label
 */
function labelForSegment(segments: string[], index: number): string {
  const seg = segments[index];

  if (index === 0) {
    if (seg === 'bills') return 'Bills';
    if (seg === 'members') return 'Members';
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

  if (segments[0] === 'members') {
    if (index === 1) {
      if (seg === 'senate') return 'Senate';
      if (seg === 'house') return 'House';
      return seg; // bioguideId, unless the page passed a name for it
    }
    // /members/{bioguide}/{term}/{billId}
    if (index === 2 && /^\d+$/.test(seg)) return `${seg}th Congress`;
    if (index === 3) {
      const bill = parseBillSegment(seg);
      return bill ? formatLegislationIdentifier(bill.billType, bill.billNumber) : seg;
    }
    if (index === 4) return `Vote ${seg}`;
  }

  return seg;
}
