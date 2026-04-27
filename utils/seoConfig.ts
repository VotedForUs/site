/**
 * Default SEO configuration for VotedFor.Us.
 */
export const seoConfig = {
  baseURL: 'https://votedfor.us',
  description:
    'US Legislator votes. Just the votes. Data from Congress.gov.',
  type: 'website' as const,
  image: {
    url: '/favicon.svg',
    alt: 'VotedFor.Us',
    width: 500,
    height: 500,
  },
  siteName: 'VotedFor.Us',
  twitter: {
    card: 'summary' as const,
  },
};
