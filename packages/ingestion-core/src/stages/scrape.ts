import type { Prisma } from '@lazyfounders/database';
import { detectPaywall } from '../content/paywall';
import { extractArticle, type ExtractedArticle } from '../content/extract';
import { BlockedError, DeferredError, TerminalError } from '../errors';
import type { StageHandler } from '../jobs/execute';
import { emitEvent } from '../jobs/outbox';
import { STAGES } from '../jobs/stages';
import { effectivePerMinute } from '../net/rate-limit';
import { canonicalizeUrl, hostOf, sha256, urlFingerprint } from '../net/url-canonical';
import { getAdapter } from '../registry/adapters';
import { fetcherForSource, type PipelineDeps } from './context';

export interface ScrapePayload {
  sourceId: string;
  urlStateId: string;
  url: string;
  canonicalUrl: string;
  fingerprint: string;
  version: string;
  title?: string | null;
  publishedAt?: string | null;
  /** Publisher-provided full text from the feed (sources with contentSource feed/page_then_feed). */
  feedContent?: { html: string; author: string | null } | null;
}

interface Fetched {
  body: Buffer;
  html: string;
  finalUrl: string;
  redirects: string[];
  status: number;
  contentType: string | null;
  via: 'page' | 'feed';
}

const escapeHtml = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Wrap publisher-provided feed full text in a minimal document for the normal extraction chain. */
function fromFeed(p: ScrapePayload, source: { name: string; defaultLanguage: string | null }): Fetched {
  const title = p.title ?? '';
  const html = `<!doctype html><html lang="${escapeHtml(source.defaultLanguage ?? 'und')}"><head><title>${escapeHtml(title)}</title>
<link rel="canonical" href="${escapeHtml(p.canonicalUrl)}">
${p.publishedAt ? `<meta property="article:published_time" content="${escapeHtml(p.publishedAt)}">` : ''}
${p.feedContent?.author ? `<meta name="author" content="${escapeHtml(p.feedContent.author)}">` : ''}
<meta property="og:site_name" content="${escapeHtml(source.name)}"></head>
<body><article><h1>${escapeHtml(title)}</h1>${p.feedContent?.html ?? ''}</article></body></html>`;
  return { body: Buffer.from(html, 'utf8'), html, finalUrl: p.url, redirects: [], status: 200, contentType: 'text/html', via: 'feed' };
}

/**
 * article.scrape: robots -> rate limit -> safe fetch -> immutable snapshot -> extraction
 * chain (adapter, JSON-LD, OpenGraph, Readability, headless only if configured).
 * Blocked, paywalled and robots-excluded pages are recorded and stopped - never retried
 * aggressively and never bypassed.
 */
export function scrapeHandler(deps: PipelineDeps): StageHandler<ScrapePayload> {
  return async (env) => {
    const p = env.payload;
    const existing = await deps.prisma.sourceArticle.findUnique({ where: { scrapeKey: env.idempotencyKey } });
    if (existing) {
      // Replay after a crash between commit and job completion: just make sure the next event exists.
      await deps.prisma.$transaction((tx) => emitNormalize(tx, env.correlationId, existing.id, env.idempotencyKey));
      return;
    }

    const source = await deps.prisma.source.findUnique({ where: { id: p.sourceId } });
    if (!source || source.trustStatus !== 'APPROVED') throw new TerminalError('Source is not approved', 'source_not_approved', { sourceId: p.sourceId });

    const fetcher = fetcherForSource(deps, source.id);
    const policy = (source.crawlPolicy ?? {}) as { paywall?: string; contentSource?: string };
    const contentSource = policy.contentSource ?? 'page';

    const fetchPage = async (): Promise<Fetched> => {
      const robots = await deps.robots.check(p.url, fetcher, source.robotsRequired);
      if (!robots.allowed) {
        await deps.prisma.urlState.update({ where: { id: p.urlStateId }, data: { status: 'blocked' } });
        throw new BlockedError(`robots.txt disallows ${new URL(p.url).pathname}`, 'robots_disallowed');
      }
      const perMinute = effectivePerMinute(source.rateLimitPerMinute, robots.crawlDelaySeconds);
      if (!(await deps.rateLimiter.tryAcquire(`domain:${source.domain}`, perMinute))) {
        throw new DeferredError(`Rate limit for ${source.domain}`, Math.ceil(60_000 / perMinute) + Math.floor(Math.random() * 1000));
      }
      const r = await fetcher.fetch({ url: p.url });
      const ctype = r.contentType ?? '';
      if (ctype && !/html|xml/i.test(ctype)) throw new TerminalError(`Not an HTML page (${ctype})`, 'not_html');
      return { body: r.body, html: r.body.toString('utf8'), finalUrl: r.finalUrl, redirects: r.redirects, status: r.status, contentType: r.contentType, via: 'page' };
    };

    let res: Fetched;
    if (contentSource === 'feed') {
      if (!p.feedContent?.html) throw new TerminalError('Source uses feed content but the feed item had none', 'no_feed_content');
      res = fromFeed(p, source);
    } else {
      try {
        res = await fetchPage();
      } catch (err) {
        // Page not accessible to crawlers: use the publisher's own syndicated full text if it exists.
        if (contentSource === 'page_then_feed' && err instanceof BlockedError && p.feedContent?.html) res = fromFeed(p, source);
        else throw err;
      }
    }
    let html = res.html;
    const adapter = getAdapter(source.adapterKey);

    let extracted: ExtractedArticle;
    if (res.via === 'page' && source.renderPolicy === 'required' && deps.renderer) {
      html = await render(deps, fetcher.assertAllowed.bind(fetcher), res.finalUrl);
      extracted = extractArticle(html, res.finalUrl, adapter);
    } else {
      extracted = extractArticle(html, res.finalUrl, adapter);
      if (res.via === 'page' && extracted.needsRender && source.renderPolicy === 'fallback' && deps.renderer) {
        html = await render(deps, fetcher.assertAllowed.bind(fetcher), res.finalUrl);
        extracted = extractArticle(html, res.finalUrl, adapter);
      }
    }

    const snapshotSha = sha256(res.body);
    const storageKey = await deps.snapshots.put(snapshotSha, res.body, res.contentType);

    const paywall = detectPaywall(html, extracted.bodyText, {
      isAccessibleForFree: extracted.isAccessibleForFree,
      selectors: adapter.paywallSelectors,
      sourcePaywall: res.via === 'feed' ? undefined : policy.paywall,
    });

    // One canonical identity per article: the page's canonical link when it stays on the
    // same approved source, otherwise the final (post-redirect) URL.
    const finalCanonical = canonicalizeUrl(res.finalUrl);
    let canonical = finalCanonical;
    if (extracted.canonicalUrl) {
      const match = await deps.allowlist.match(hostOf(extracted.canonicalUrl));
      if (match?.sourceId === source.id) canonical = canonicalizeUrl(extracted.canonicalUrl);
    }
    const canonicalFingerprint = urlFingerprint(canonical);
    const aliases = new Map<string, { url: string; kind: string }>([
      [urlFingerprint(p.url), { url: p.url, kind: 'original' }],
      ...res.redirects.map((u) => [urlFingerprint(u), { url: u, kind: 'redirect' }] as const),
      [urlFingerprint(res.finalUrl), { url: res.finalUrl, kind: 'redirect' }],
      [canonicalFingerprint, { url: canonical, kind: 'canonical' }],
    ]);

    await deps.prisma.$transaction(async (tx) => {
      const snapshot = await tx.rawSnapshot.upsert({
        where: { sha256: snapshotSha },
        create: { sha256: snapshotSha, storageKey, contentType: res.contentType, bytes: res.body.length, url: res.finalUrl, httpStatus: res.status },
        update: {},
      });
      for (const [fingerprint, a] of aliases) {
        await tx.urlAlias.upsert({ where: { fingerprint }, create: { fingerprint, canonicalFingerprint, url: a.url, kind: a.kind }, update: {} });
      }
      const sa = await tx.sourceArticle.create({
        data: {
          sourceId: source.id,
          urlStateId: p.urlStateId,
          snapshotId: snapshot.id,
          correlationId: env.correlationId,
          scrapeKey: env.idempotencyKey,
          state: paywall.paywalled ? 'REJECTED' : 'SCRAPED',
          stateReason: paywall.paywalled ? `paywall:${paywall.reason}` : null,
          originalUrl: p.url,
          finalUrl: res.finalUrl,
          canonicalUrl: canonical,
          canonicalFingerprint,
          publisher: extracted.publisherName ?? source.name,
          country: source.country,
          headline: extracted.headline ?? p.title ?? null,
          subheadline: extracted.subheadline,
          author: extracted.author,
          publishedAt: extracted.publishedAt ?? (p.publishedAt ? new Date(p.publishedAt) : null),
          modifiedAt: extracted.modifiedAt,
          bodyText: paywall.paywalled ? null : extracted.bodyText,
          sanitizedHtml: paywall.paywalled ? null : extracted.bodyHtml,
          leadImage: source.imagePolicy === 'none' ? null : extracted.leadImage,
          imageCredit: extracted.imageCredit ?? (extracted.leadImage ? source.name : null),
          categories: extracted.categories.slice(0, 20),
          tags: extracted.tags.slice(0, 30),
          structuredMeta: {
            ...extracted.structured,
            htmlLang: extracted.htmlLang,
            declaredLanguage: extracted.declaredLanguage,
            extractionMethod: extracted.method,
            contentVia: res.via,
          } as Prisma.InputJsonValue,
          outboundLinks: extracted.outboundLinks as unknown as Prisma.InputJsonValue,
          extractionMethod: res.via === 'feed' ? `feed:${extracted.method}` : extracted.method,
          paywalled: paywall.paywalled,
          fetchedAt: new Date(),
        },
      });
      await tx.urlState.update({ where: { id: p.urlStateId }, data: { status: paywall.paywalled ? 'paywalled' : 'active', canonicalUrl: canonical } });
      if (!paywall.paywalled) await emitNormalize(tx, env.correlationId, sa.id, env.idempotencyKey);
    });

    deps.logger.info(
      { correlationId: env.correlationId, sourceId: source.id, url: p.url, method: extracted.method, chars: extracted.bodyText.length, paywalled: paywall.paywalled },
      'article scraped',
    );
  };
}

async function render(deps: PipelineDeps, assertAllowed: (url: string) => Promise<unknown>, url: string): Promise<string> {
  return deps.renderer!.render(url, {
    assertAllowed: async (u) => {
      await assertAllowed(u);
    },
    timeoutMs: 30_000,
  });
}

function emitNormalize(tx: Prisma.TransactionClient, correlationId: string, sourceArticleId: string, scrapeKey: string) {
  return emitEvent(tx, {
    stage: STAGES.NORMALIZE,
    idempotencyKey: `article.normalize:${sourceArticleId}`,
    correlationId,
    subjectType: 'source_article',
    subjectId: sourceArticleId,
    payload: { sourceArticleId, scrapeKey },
  });
}
