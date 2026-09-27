import type { Metadata, Viewport } from 'next';
import { Archivo, Newsreader, Outfit } from 'next/font/google';
import './globals.css';
import { Footer } from '../components/Footer';
import { ContactBanner } from '../components/ContactBanner';
import { WhatsAppFloat } from '../components/WhatsAppFloat';
import { SiteHeader } from '../components/site/SiteHeader';
import { JsonLd } from '../components/JsonLd';
import { Analytics } from '../components/Analytics';
import { WebVitals } from '../components/WebVitals';
import {
  BRAND,
  SITE_DESCRIPTION,
  SITE_LANG,
  SITE_LOCALE,
  SITE_OG_IMAGE,
  SITE_TAGLINE,
  SITE_URL,
  TWITTER_HANDLE,
  organizationSchema,
  websiteSchema,
} from '@/lib/seo';

// Three roles, each doing one job: Archivo carries the masthead and every
// uppercase label, Newsreader sets headlines so the page reads as a publication
// rather than a dashboard, and Outfit stays on interface text and bylines.
const outfit = Outfit({ subsets: ['latin'], display: 'swap', variable: '--font-outfit' });
const archivo = Archivo({ subsets: ['latin'], display: 'swap', weight: ['600', '700', '800'], variable: '--font-archivo' });
const newsreader = Newsreader({ subsets: ['latin'], display: 'swap', weight: ['400', '500', '600'], variable: '--font-newsreader' });

export const metadata: Metadata = {
  // metadataBase makes every relative OG/canonical URL below resolve to an absolute one.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND} — ${SITE_TAGLINE}`,
    template: `%s | ${BRAND}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: BRAND,
  generator: 'Next.js',
  referrer: 'origin-when-cross-origin',
  authors: [{ name: BRAND, url: SITE_URL }],
  publisher: BRAND,
  category: 'news',
  alternates: {
    canonical: '/',
    types: { 'application/rss+xml': `${SITE_URL}/feed.xml` },
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: BRAND,
    title: `${BRAND} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    locale: SITE_LOCALE,
    images: [{ url: SITE_OG_IMAGE, width: 1200, height: 630, alt: `${BRAND} — ${SITE_TAGLINE}` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [SITE_OG_IMAGE],
    ...(TWITTER_HANDLE ? { site: TWITTER_HANDLE, creator: TWITTER_HANDLE } : {}),
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
      { url: '/favicon-64.png', type: 'image/png', sizes: '64x64' },
      { url: '/logo192.png', type: 'image/png', sizes: '192x192' },
    ],
    // iOS ignores transparency, so the touch icon is the mark on a solid square.
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    shortcut: ['/favicon.ico'],
  },
  manifest: '/manifest.webmanifest',
  formatDetection: { telephone: false, address: false, email: false },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  other: {
    // GEO: a short, machine-readable statement of what this publication is.
    'ai-content-declaration': 'AI-drafted from cited sources, checked by automated validation; see /ai-policy',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: '#ffffff',
};

/** Brand entity + site entity, emitted once for every page in the app. */
const siteSchema = {
  '@context': 'https://schema.org',
  '@graph': [organizationSchema(), websiteSchema()],
};

const themeScript = `
(function () {
  try {
    // Light unless the reader chose dark with the toggle. The OS setting is
    // deliberately ignored so the theme never changes between pages.
    var dark = localStorage.getItem('lazyfounders-theme') === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (_) {
    document.documentElement.style.colorScheme = 'light';
  }
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // No className on <html>: the theme script owns the `dark` class. A class in
  // JSX gets re-applied whenever React re-renders the root, which flipped
  // light readers to dark on navigation.
  return (
    <html lang={SITE_LANG} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="alternate" type="application/rss+xml" title={`${BRAND} — latest stories`} href="/feed.xml" />
        <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
        <JsonLd data={siteSchema} />
      </head>
      <body className={`${outfit.variable} ${archivo.variable} ${newsreader.variable} ${outfit.className} min-h-screen flex flex-col`}>
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-teal-500 focus:px-4 focus:py-3 focus:font-semibold focus:text-black"
        >
          Skip to content
        </a>
        <SiteHeader />
        {/* A plain wrapper: pages own their own <main>, and nesting <main> is invalid.
            It is the skip link's target, so it takes focus without joining the tab order. */}
        <div id="content" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </div>
        <ContactBanner />
        <Footer />
        <WhatsAppFloat />
        <Analytics />
        <WebVitals />
      </body>
    </html>
  );
}
