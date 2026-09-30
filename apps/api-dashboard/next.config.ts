import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import path from "path";

const monorepoRoot = path.resolve(__dirname, "../..");

// Env lives in the monorepo root .env (shared with the other services);
// Next.js only reads .env files from the app directory by default, and caches
// that result — forceReload so the root files are actually read.
loadEnvConfig(monorepoRoot, process.env.NODE_ENV !== "production", console, true);

const isDev = process.env.NODE_ENV !== "production";

// A static policy rather than a per-request nonce: a nonce forces every page to
// render dynamically, which would throw away the ISR caching on the public
// pages. Inline scripts (theme bootstrap, JSON-LD, gtag init) therefore need
// 'unsafe-inline'; everything else is pinned to this origin, Google Analytics,
// AdSense (whose units render in iframes, hence frame-src) and the Mantis
// "Talk to founder" widget (a loader script plus an iframed panel).
// Article images are hotlinked from publishers, hence img-src https:.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.adtrafficquality.google https://adservice.google.com https://www.google.com https://mantisai.in`,
  "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.adtrafficquality.google https://*.doubleclick.net https://www.google.com",
  "frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://*.googlesyndication.com https://*.adtrafficquality.google https://www.google.com https://mantisai.in",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  // The app sits behind an ALB that sets no response headers of its own, so
  // this is the only place the site gets any.
  poweredByHeader: false,
  // deploy/deploy.sh builds into its own directory with its own tsconfig, so the
  // pre-flight check never reads the .next/dev files a running `next dev` is rewriting.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: {
    tsconfigPath: process.env.NEXT_TSCONFIG_PATH || "tsconfig.json",
  },
  turbopack: {
    root: monorepoRoot,
  },
  images: {
    // Story images come from whichever publisher the pipeline ingested, so the
    // host list is open-ended; https only, and private IPs stay blocked.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    // WebP only: AVIF saves a little more but costs far more CPU to encode, and a
    // news feed keeps asking for images nobody has requested yet.
    formats: ["image/webp"],
    qualities: [75],
    // Publisher images at a given URL do not change; a day keeps the optimizer's
    // CPU and upstream fetches down without pinning a bad image for long.
    minimumCacheTTL: 86400,
    maximumRedirects: 3,
  },
  async redirects() {
    return [
      // The news sitemap moved under /sitemaps/ with the rest of the index.
      { source: "/news-sitemap.xml", destination: "/sitemaps/news.xml", permanent: true },
      // Every story now lives at /news/<slug>; the old per-kind prefixes forward there.
      { source: "/news/article/:slug", destination: "/news/:slug", permanent: true },
      { source: "/news/source/:slug", destination: "/news/:slug", permanent: true },
      // Sitemap files from before the per-category split, possibly still in Search Console.
      { source: "/sitemaps/static.xml", destination: "/sitemaps/pages.xml", permanent: true },
      { source: "/sitemaps/:file(articles-\\d+\\.xml)", destination: "/sitemap.xml", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Sent unconditionally: browsers ignore it over plain HTTP, and the
          // ALB answers :80 as well as :443.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
