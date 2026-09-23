import type { Metadata, Viewport } from 'next';
import { Archivo, Newsreader, Outfit } from 'next/font/google';
import './globals.css';
import { Footer } from '../components/Footer';
import { SiteHeader } from '../components/site/SiteHeader';
import { JsonLd } from '../components/JsonLd';
import { Analytics } from '../components/Analytics';
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

export const dynamic = "force-dynamic";

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
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      { url: '/favicon-64.png', type: 'image/png', sizes: '64x64' },
      { url: '/logo192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: [{ url: '/logo192.png', sizes: '192x192' }],
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
    'ai-content-declaration': 'AI-assisted reporting, human-reviewed, fully cited',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark light',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#05070A' },
  ],
};

/** Brand entity + site entity, emitted once for every page in the app. */
const siteSchema = {
  '@context': 'https://schema.org',
  '@graph': [organizationSchema(), websiteSchema()],
};

const themeScript = `
(function () {
  try {
    var saved = localStorage.getItem('lazyfounders-theme');
    var dark = saved === 'dark' || (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (_) {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  }
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={SITE_LANG} className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="alternate" type="application/rss+xml" title={`${BRAND} — latest stories`} href="/feed.xml" />
        <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
        <JsonLd data={siteSchema} />
      </head>
      <body className={`${outfit.variable} ${archivo.variable} ${newsreader.variable} ${outfit.className} min-h-screen flex flex-col`}>
        <SiteHeader />
        {/* A plain wrapper: pages own their own <main>, and nesting <main> is invalid. */}
        <div className="flex-1">
          {children}
        </div>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
