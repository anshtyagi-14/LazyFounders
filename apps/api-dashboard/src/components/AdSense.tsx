import { ADSENSE_CLIENT, adsEnabled } from '@/lib/ads';

/**
 * The AdSense loader, rendered once in the root <head>. A plain tag rather than
 * next/script: AdSense flags the data-nscript attribute next/script adds, and
 * the tag also serves as the site-ownership check in the AdSense console.
 */
export function AdSenseScript() {
  if (!adsEnabled) return null;
  return (
    <script
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
      crossOrigin="anonymous"
    />
  );
}
