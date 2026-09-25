import type { MetadataRoute } from 'next';
import { BRAND, SITE_DESCRIPTION, SITE_LANG, SITE_TAGLINE } from '@/lib/seo';

// Constant. There is nothing here to rebuild per request.

/** Replaces the stale Create React App public/manifest.json. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND} — ${SITE_TAGLINE}`,
    short_name: BRAND,
    description: SITE_DESCRIPTION,
    lang: SITE_LANG,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#05070A',
    theme_color: '#05070A',
    categories: ['news', 'business', 'technology'],
    icons: [
      { src: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      { src: '/favicon-64.png', sizes: '64x64', type: 'image/png' },
      { src: '/logo192.png', type: 'image/png', sizes: '192x192', purpose: 'any' },
      { src: '/logo512.png', type: 'image/png', sizes: '512x512', purpose: 'any' },
      { src: '/logo512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
    ],
  };
}
