import type { PrismaClient } from '@lazyfounders/database';

export interface AllowedDomain {
  domain: string;
  kind: string;
  sourceId: string;
  approved: boolean;
}

/**
 * Approved-domain allowlist backed by SourceDomain. A host is allowed when it equals,
 * or is a subdomain of, a domain whose source is APPROVED and enabled. Cached briefly
 * so every fetch does not hit the database.
 */
export class DomainAllowlist {
  private cache: { at: number; domains: AllowedDomain[] } | null = null;

  constructor(private readonly load: () => Promise<AllowedDomain[]>, private readonly ttlMs = 60_000) {}

  static fromPrisma(prisma: PrismaClient, ttlMs?: number): DomainAllowlist {
    return new DomainAllowlist(async () => {
      const rows = await prisma.sourceDomain.findMany({ include: { source: { select: { trustStatus: true, enabled: true } } } });
      return rows.map((r) => ({
        domain: r.domain,
        kind: r.kind,
        sourceId: r.sourceId,
        approved: r.source.trustStatus === 'APPROVED' && r.source.enabled,
      }));
    }, ttlMs);
  }

  static fromList(domains: AllowedDomain[]): DomainAllowlist {
    return new DomainAllowlist(async () => domains, Number.MAX_SAFE_INTEGER);
  }

  private async domains(): Promise<AllowedDomain[]> {
    if (!this.cache || Date.now() - this.cache.at > this.ttlMs) this.cache = { at: Date.now(), domains: await this.load() };
    return this.cache.domains;
  }

  invalidate(): void {
    this.cache = null;
  }

  async match(host: string, opts: { includeUnapproved?: boolean } = {}): Promise<AllowedDomain | null> {
    const h = host.toLowerCase().replace(/^www\./, '');
    const candidates = (await this.domains()).filter(
      (d) => (opts.includeUnapproved || d.approved) && (h === d.domain || h.endsWith('.' + d.domain)),
    );
    // Most specific domain wins.
    return candidates.sort((a, b) => b.domain.length - a.domain.length)[0] ?? null;
  }

  async isAllowed(host: string): Promise<boolean> {
    return (await this.match(host)) !== null;
  }

  /** Host policy restricted to one source (used when fetching on behalf of that source). */
  forSource(sourceId: string, opts: { includeUnapproved?: boolean } = {}): (host: string) => Promise<boolean> {
    return async (host) => (await this.match(host, opts))?.sourceId === sourceId;
  }
}
