import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod/v4';

/**
 * Trusted Source Registry configuration. One YAML file per publisher under
 * sources/<country-iso>/<key>.yaml. Nothing country- or language-specific lives in code:
 * adding a publisher is a new YAML file (plus an optional adapter for odd page layouts).
 */
const Hostname = z
  .string()
  .regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'lowercase hostname without scheme, e.g. yourstory.com');

export const SourceConfigSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    name: z.string().min(1),
    country: z.string().regex(/^[A-Z]{2}$/, 'ISO-3166 alpha-2'),
    defaultLanguage: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)?$/, 'BCP-47, e.g. en, ja, pt-BR'),
    trustStatus: z.enum(['PENDING', 'APPROVED', 'SUSPENDED']).default('PENDING'),
    active: z.boolean().default(false),
    priority: z.number().int().min(1).max(10).default(5),
    domains: z.object({
      primary: Hostname,
      aliases: z.array(Hostname).default([]),
      assets: z.array(Hostname).default([]),
    }),
    discovery: z.object({
      methods: z.array(z.enum(['sitemap', 'news_sitemap', 'rss', 'atom'])).min(1),
      sitemaps: z.array(z.url()).default([]),
      feeds: z.array(z.url()).default([]),
      crawlIntervalMinutes: z.number().int().min(5).max(24 * 60).default(60),
      maxArticlesPerScan: z.number().int().min(1).max(500).default(50),
      recencyWindowHours: z.number().int().min(1).max(24 * 30).default(72),
      includePatterns: z.array(z.string()).default([]),
      excludePatterns: z.array(z.string()).default([]),
    }),
    fetch: z
      .object({
        rateLimitPerMinute: z.number().int().min(1).max(600).default(20),
        renderPolicy: z.enum(['never', 'fallback', 'required']).default('never'),
        robotsRequired: z.boolean().default(true),
        /**
         * Where article text comes from: the article page (default), the publisher's own
         * full-text feed (RSS content:encoded / Atom content), or the page with the feed as
         * fallback when the page is not accessible to crawlers. Never a bypass technique.
         */
        contentSource: z.enum(['page', 'feed', 'page_then_feed']).default('page'),
      })
      .default({ rateLimitPerMinute: 20, renderPolicy: 'never', robotsRequired: true, contentSource: 'page' }),
    adapter: z.string().nullable().default(null),
    translation: z
      .object({
        mode: z.enum(['never', 'if_different', 'always']).default('if_different'),
        targetLanguage: z.string().nullable().default(null),
      })
      .default({ mode: 'if_different', targetLanguage: null }),
    publishing: z
      .object({
        mode: z.enum(['MANUAL', 'AUTO']).default('MANUAL'),
        minConfidence: z.number().min(0).max(1).default(0.85),
      })
      .default({ mode: 'MANUAL', minConfidence: 0.85 }),
    imagePolicy: z.enum(['none', 'link_with_credit', 'rehost']).default('link_with_credit'),
    paywall: z.enum(['none', 'metered', 'hard']).default('none'),
    notes: z.string().optional(),
  })
  .superRefine((cfg, ctx) => {
    const needsSitemap = cfg.discovery.methods.some((m) => m === 'sitemap' || m === 'news_sitemap');
    const needsFeed = cfg.discovery.methods.some((m) => m === 'rss' || m === 'atom');
    if (needsSitemap && cfg.discovery.sitemaps.length === 0) ctx.addIssue({ code: 'custom', message: 'sitemap method requires discovery.sitemaps' });
    if (needsFeed && cfg.discovery.feeds.length === 0) ctx.addIssue({ code: 'custom', message: 'rss/atom method requires discovery.feeds' });
    const allowed = [cfg.domains.primary, ...cfg.domains.aliases];
    for (const u of [...cfg.discovery.sitemaps, ...cfg.discovery.feeds]) {
      const host = new URL(u).hostname.replace(/^www\./, '');
      if (!allowed.some((d) => host === d || host.endsWith('.' + d))) {
        ctx.addIssue({ code: 'custom', message: `${u} is not on an approved domain of ${cfg.key}` });
      }
    }
    for (const p of [...cfg.discovery.includePatterns, ...cfg.discovery.excludePatterns]) {
      try {
        new RegExp(p);
      } catch {
        ctx.addIssue({ code: 'custom', message: `invalid regex: ${p}` });
      }
    }
    if (cfg.trustStatus !== 'APPROVED' && cfg.active) ctx.addIssue({ code: 'custom', message: 'only APPROVED sources may be active' });
    if (cfg.paywall === 'hard' && cfg.publishing.mode === 'AUTO') ctx.addIssue({ code: 'custom', message: 'hard-paywalled sources cannot auto-publish' });
    if (cfg.fetch.contentSource !== 'page' && !cfg.discovery.methods.some((m) => m === 'rss' || m === 'atom')) {
      ctx.addIssue({ code: 'custom', message: 'contentSource feed requires an rss or atom feed' });
    }
  });

export type SourceConfig = z.infer<typeof SourceConfigSchema>;

export interface LoadedSourceConfig {
  file: string;
  config: SourceConfig;
  hash: string;
}

export class SourceConfigError extends Error {
  constructor(readonly file: string, readonly issues: string[]) {
    super(`Invalid source config ${file}:\n - ${issues.join('\n - ')}`);
  }
}

export function parseSourceConfig(text: string, file = '<inline>'): LoadedSourceConfig {
  const raw = parseYaml(text);
  const res = SourceConfigSchema.safeParse(raw);
  if (!res.success) {
    throw new SourceConfigError(file, res.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
  }
  const hash = createHash('sha256').update(JSON.stringify(res.data)).digest('hex');
  return { file, config: res.data, hash };
}

/** Load every *.yaml under dir recursively. Throws on the first invalid file or duplicate key/domain. */
export function loadSourceConfigs(dir: string): LoadedSourceConfig[] {
  const out: LoadedSourceConfig[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.ya?ml$/.test(name)) out.push(parseSourceConfig(readFileSync(p, 'utf8'), p));
    }
  };
  walk(dir);

  const keys = new Map<string, string>();
  const domains = new Map<string, string>();
  for (const { file, config } of out) {
    if (keys.has(config.key)) throw new SourceConfigError(file, [`duplicate key "${config.key}" (also in ${keys.get(config.key)})`]);
    keys.set(config.key, file);
    for (const d of [config.domains.primary, ...config.domains.aliases, ...config.domains.assets]) {
      if (domains.has(d)) throw new SourceConfigError(file, [`domain ${d} already claimed by ${domains.get(d)}`]);
      domains.set(d, config.key);
    }
  }
  return out;
}
