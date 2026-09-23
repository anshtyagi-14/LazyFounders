/**
 * Trusted Source Registry CLI.
 *   npm run sources:validate            validate every sources/**.yaml (no DB)
 *   npm run sources:sync                upsert YAML into the registry (idempotent)
 *   npm run sources:verify -- <key>     probe robots.txt, feeds/sitemaps and one article
 *   npm run sources:list                show registry status
 */
import { PrismaClient } from '@lazyfounders/database';
import { extractArticle } from '../content/extract';
import { detectLanguage } from '../content/language';
import { detectPaywall } from '../content/paywall';
import { parseFeed } from '../discovery/feed-parser';
import { EMPTY_RULES, isAllowedByPolicy, parseRobots } from '../net/robots';
import { SafeFetcher } from '../net/safe-fetch';
import { getAdapter } from '../registry/adapters';
import { DomainAllowlist } from '../registry/allowlist';
import { loadSourceConfigs } from '../registry/source-config';
import { syncSourceConfigs } from '../registry/sync';
import { fail, loadEnv, repoPath } from './common';

async function main() {
  loadEnv();
  const [cmd, key] = process.argv.slice(2);
  const dir = repoPath('sources');

  if (cmd === 'validate') {
    const configs = loadSourceConfigs(dir);
    const byCountry = new Map<string, number>();
    for (const c of configs) byCountry.set(c.config.country, (byCountry.get(c.config.country) ?? 0) + 1);
    console.log(`OK: ${configs.length} sources valid (${[...byCountry].map(([k, v]) => `${k}:${v}`).join(' ')})`);
    return;
  }

  const prisma = new PrismaClient();
  try {
    if (cmd === 'sync') {
      const report = await syncSourceConfigs(prisma, loadSourceConfigs(dir));
      console.log(JSON.stringify(report, null, 2));
    } else if (cmd === 'list') {
      const rows = await prisma.source.findMany({ where: { registryKey: { not: null } }, orderBy: [{ country: 'asc' }, { name: 'asc' }] });
      for (const s of rows) {
        console.log(
          [s.registryKey?.padEnd(22), s.country, (s.defaultLanguage ?? '').padEnd(3), s.trustStatus.padEnd(9), s.enabled ? 'active  ' : 'inactive', s.failureStatus.padEnd(8), s.lastSuccessfulScanAt?.toISOString() ?? '-'].join('  '),
        );
      }
    } else if (cmd === 'verify') {
      if (!key) fail('usage: sources verify <registry-key>');
      await verify(prisma, key);
    } else {
      fail('usage: sources <validate|sync|list|verify <key>>');
    }
  } finally {
    await prisma.$disconnect();
  }
}

/** Read-only onboarding probe. Works for PENDING sources (explicit operator action). */
async function verify(prisma: PrismaClient, key: string) {
  const s = await prisma.source.findUnique({ where: { registryKey: key } });
  if (!s) fail(`Unknown source "${key}". Run sources:sync first.`);
  const allowlist = DomainAllowlist.fromPrisma(prisma, 0);
  const fetcher = new SafeFetcher({ hostPolicy: allowlist.forSource(s.id, { includeUnapproved: true }), maxBytes: 20 * 1024 * 1024 });
  const report: Record<string, unknown> = { source: key, trustStatus: s.trustStatus, domain: s.domain };

  let robots = { status: 'none' as 'none' | 'parsed' | 'unreachable', rules: EMPTY_RULES };
  try {
    const r = await fetcher.fetch({ url: `${s.baseUrl}/robots.txt`, maxBytes: 512 * 1024 });
    robots = { status: 'parsed', rules: parseRobots(r.body.toString('utf8'), process.env.CRAWLER_USER_AGENT ?? 'LazyFoundersBot') };
  } catch (err) {
    robots = { status: (err as { code?: string }).code === 'http_error' ? 'none' : 'unreachable', rules: EMPTY_RULES };
  }
  report.robots = { status: robots.status, crawlDelay: robots.rules.crawlDelaySeconds, sitemapsDeclared: robots.rules.sitemaps.slice(0, 10) };

  const feeds: unknown[] = [];
  let sample: string | null = null;
  for (const url of [...s.customSitemapUrls, ...s.feedUrls]) {
    try {
      const res = await fetcher.fetch({ url });
      const feed = parseFeed(res.body);
      const dates = feed.entries.map((e) => (e.lastmod ?? e.publishedAt)?.getTime() ?? 0).filter(Boolean);
      const adapter = getAdapter(s.adapterKey);
      const articles = feed.entries.filter((e) => {
        try {
          return adapter.isArticleUrl?.(new URL(e.loc)) ?? true;
        } catch {
          return false;
        }
      });
      sample ??= articles[0]?.loc ?? null;
      feeds.push({
        url,
        ok: true,
        kind: feed.kind,
        entries: feed.entries.length,
        articleEntries: articles.length,
        children: feed.children.length,
        newest: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
        etag: Boolean(res.etag),
        lastModified: Boolean(res.lastModified),
        robotsAllowed: isAllowedByPolicy(robots, url, s.robotsRequired),
      });
    } catch (err) {
      feeds.push({ url, ok: false, error: (err as Error).message });
    }
  }
  report.feeds = feeds;

  if (sample) {
    try {
      const allowed = isAllowedByPolicy(robots, sample, s.robotsRequired);
      if (!allowed) report.sampleArticle = { url: sample, robotsAllowed: false };
      else {
        const res = await fetcher.fetch({ url: sample });
        const html = res.body.toString('utf8');
        const x = extractArticle(html, res.finalUrl, getAdapter(s.adapterKey));
        const lang = detectLanguage(x.bodyText, { htmlLang: x.htmlLang, declared: x.declaredLanguage, sourceDefault: s.defaultLanguage });
        report.sampleArticle = {
          url: sample,
          finalUrl: res.finalUrl,
          method: x.method,
          headline: x.headline,
          chars: x.bodyText.length,
          publishedAt: x.publishedAt,
          language: lang,
          needsRender: x.needsRender,
          paywall: detectPaywall(html, x.bodyText, { isAccessibleForFree: x.isAccessibleForFree, selectors: getAdapter(s.adapterKey).paywallSelectors }),
          canonical: x.canonicalUrl,
        };
      }
    } catch (err) {
      report.sampleArticle = { url: sample, error: (err as Error).message };
    }
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => fail((err as Error).stack ?? String(err)));
