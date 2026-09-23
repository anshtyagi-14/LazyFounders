import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/articles';

export const dynamic = 'force-dynamic';

/** Internal tooling and machine endpoints: never for any crawler. */
const PRIVATE_PATHS = ['/admin', '/dashboard', '/developers', '/tools', '/api/', '/uploads/'];

/**
 * Syndicated source stories carry a canonical pointing at the original publisher, so they
 * must stay out of the index — but crawlers should still follow their outbound links.
 */
const NOINDEX_PATHS = ['/news/source/'];

/**
 * GEO: the crawlers behind ChatGPT Search, Claude, Perplexity, Gemini and Copilot are
 * explicitly welcomed on the public corpus. Being cited by an answer engine is the point
 * of this publication, so they get the same access as Googlebot — no more, no less.
 */
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot',
  'Applebot-Extended',
  'Bingbot',
  'meta-externalagent',
  'Amazonbot',
  'cohere-ai',
  'DuckAssistBot',
];

export default function robots(): MetadataRoute.Robots {
  const allow = ['/', '/news/', '/company/', '/og', '/feed.xml'];
  const disallow = [...PRIVATE_PATHS, ...NOINDEX_PATHS];

  return {
    rules: [
      { userAgent: '*', allow, disallow },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow, disallow })),
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/news-sitemap.xml`],
    host: SITE_URL,
  };
}
