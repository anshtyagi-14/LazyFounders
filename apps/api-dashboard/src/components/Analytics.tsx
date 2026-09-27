import Script from 'next/script';
import { preconnect } from 'react-dom';
import { AnalyticsClicks } from './AnalyticsClicks';

/**
 * Google Analytics 4 for the public site.
 *
 * The measurement ID is a public identifier, so it ships as a default rather
 * than a build arg — set NEXT_PUBLIC_GA_ID to point a deployment at another
 * property, or to an empty string to switch analytics off entirely.
 */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID ?? 'G-M7LXPXL8R7';

export function Analytics() {
  // Keep local and preview traffic out of the production property.
  if (!GA_MEASUREMENT_ID || process.env.NODE_ENV !== 'production') return null;

  const init = [
    'window.dataLayer = window.dataLayer || [];',
    'function gtag(){dataLayer.push(arguments);}',
    "gtag('js', new Date());",
    `gtag('config', '${GA_MEASUREMENT_ID}');`,
  ].join('\n');

  // gtag's hits go to google-analytics.com; opening that connection up front
  // takes the handshake off the first pageview beacon.
  preconnect('https://www.googletagmanager.com');
  preconnect('https://www.google-analytics.com');

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {init}
      </Script>
      <AnalyticsClicks />
    </>
  );
}
