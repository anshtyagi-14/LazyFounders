import type { PrismaClient } from '@lazyfounders/database';
import type { LoadedSourceConfig } from './source-config';

export interface SyncReport {
  created: string[];
  updated: string[];
  unchanged: string[];
}

/**
 * Upsert YAML configs into the Source registry (idempotent).
 *
 * Ownership rules:
 *  - YAML owns static configuration (domains, feeds, limits, policies).
 *  - Editors own trust and activation after creation: a sync never re-approves or
 *    re-activates a source an editor changed, but a YAML `SUSPENDED` always wins.
 */
export async function syncSourceConfigs(prisma: PrismaClient, configs: LoadedSourceConfig[]): Promise<SyncReport> {
  const report: SyncReport = { created: [], updated: [], unchanged: [] };

  for (const { config: c, hash } of configs) {
    const staticFields = {
      name: c.name,
      baseUrl: `https://${c.domains.primary}`,
      country: c.country,
      defaultLanguage: c.defaultLanguage,
      priority: c.priority,
      feedUrls: c.discovery.feeds,
      customSitemapUrls: c.discovery.sitemaps,
      discoveryMethods: c.discovery.methods,
      crawlIntervalMinutes: c.discovery.crawlIntervalMinutes,
      maxArticlesPerScan: c.discovery.maxArticlesPerScan,
      recencyWindowHours: c.discovery.recencyWindowHours,
      customFilterRules: { include: c.discovery.includePatterns, exclude: c.discovery.excludePatterns },
      rateLimitPerMinute: c.fetch.rateLimitPerMinute,
      renderPolicy: c.fetch.renderPolicy,
      robotsRequired: c.fetch.robotsRequired,
      adapterKey: c.adapter,
      translationPolicy: c.translation,
      publishingPolicy: c.publishing,
      imagePolicy: c.imagePolicy,
      crawlPolicy: { paywall: c.paywall, contentSource: c.fetch.contentSource },
      configHash: hash,
    };

    await prisma.$transaction(async (tx) => {
      const existing =
        (await tx.source.findUnique({ where: { registryKey: c.key } })) ??
        (await tx.source.findUnique({ where: { domain: c.domains.primary } }));

      let sourceId: string;
      if (!existing) {
        const created = await tx.source.create({
          data: { ...staticFields, registryKey: c.key, domain: c.domains.primary, trustStatus: c.trustStatus, enabled: c.active },
        });
        sourceId = created.id;
        report.created.push(c.key);
      } else {
        sourceId = existing.id;
        if (existing.configHash === hash && existing.registryKey === c.key) {
          report.unchanged.push(c.key);
          return;
        }
        await tx.source.update({
          where: { id: existing.id },
          data: {
            ...staticFields,
            registryKey: c.key,
            ...(c.trustStatus === 'SUSPENDED' ? { trustStatus: 'SUSPENDED', enabled: false } : {}),
          },
        });
        report.updated.push(c.key);
      }

      const wanted = [
        { domain: c.domains.primary, kind: 'primary' },
        ...c.domains.aliases.map((domain) => ({ domain, kind: 'alias' })),
        ...c.domains.assets.map((domain) => ({ domain, kind: 'asset' })),
      ];
      await tx.sourceDomain.deleteMany({ where: { sourceId, domain: { notIn: wanted.map((w) => w.domain) } } });
      for (const w of wanted) {
        await tx.sourceDomain.upsert({
          where: { domain: w.domain },
          create: { sourceId, domain: w.domain, kind: w.kind },
          update: { sourceId, kind: w.kind },
        });
      }
    });
  }
  return report;
}
