/**
 * Default SEO configuration for VotedFor.Us.
 *
 * `SITE_URL` moves the origin every absolute URL is built from — canonical
 * links, share links, `og:image`. A PR preview sets it to its own host, so a
 * link shared from a preview previews the preview, not production.
 */
export const SITE_ORIGIN: string = process.env.SITE_URL?.replace(/\/+$/, '') || 'https://votedfor.us';

export const seoConfig = {
  baseURL: SITE_ORIGIN,
  description:
    'US Legislator votes. Just the votes. Data from Congress.gov.',
  type: 'website' as const,
  // Drawn by `npm run social-cards` from src/dev/social-card-capture.astro.
  // A PNG, because link previews do not render SVG.
  image: {
    url: '/social-card-default.png',
    alt: 'VotedFor.Us — US legislator votes. Just the votes.',
    width: 1200,
    height: 630,
  },
  siteName: 'VotedFor.Us',
  twitter: {
    card: 'summary_large_image' as const,
  },
};
