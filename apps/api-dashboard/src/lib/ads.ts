/**
 * Google AdSense for the public site.
 *
 * The publisher ID is a public identifier, so it ships as a default rather than
 * a build arg — set NEXT_PUBLIC_ADSENSE_CLIENT to point a deployment at another
 * account, or to an empty string to switch ads off entirely.
 */
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? 'ca-pub-8832071806795205';

/**
 * Display ad unit IDs (AdSense → Ads → By ad unit), one per placement. A slot
 * left empty renders nothing, so a placement goes live when its ID is filled in.
 */
export const AD_SLOTS = {
  /** Article pages, right-hand aside under the story lists. */
  articleSidebar: '9374411186',
  /** Home page, horizontal strip above the footer. */
  homeStrip: '9779493454',
  /** Home page Top Picks, under the small stories beside the lead. */
  topPicksRail: '1114535372',
} as const;

/** Keep local and preview traffic away from the ad account. */
export const adsEnabled = Boolean(ADSENSE_CLIENT) && process.env.NODE_ENV === 'production';
