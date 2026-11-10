/**
 * Default SEO configuration for VotedFor.Us.
 */
export const seoConfig = {
  baseURL: 'https://votedfor.us',
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
