import 'server-only';
import { prisma } from '@/lib/prisma';
import { ALL_COMPANIES } from '@/lib/companies';

export function slugifyCompany(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

export interface CompanyEntry {
  slug: string;
  /** Curated spelling when there is one, otherwise the most used spelling in stories. */
  name: string;
  /** Every spelling stories use for this slug ("OpenAI", "Openai", ...), for the hub's filter. */
  names: string[];
  /** Published stories mentioning the company (upper bound: a story can list two spellings). */
  storyCount: number;
  lastModified: Date | null;
}

const TTL_MS = 10 * 60 * 1000;
let cache: { value: Map<string, CompanyEntry>; expires: number } | null = null;

/**
 * Company name spellings in published stories, grouped by URL slug. Story pages
 * link every company through its slug, so the hub has to find stories by any
 * spelling that produces that slug, not just the curated one.
 */
export async function companyIndex(): Promise<Map<string, CompanyEntry>> {
  if (cache && cache.expires > Date.now()) return cache.value;

  const rows = await prisma.$queryRaw<{ name: string; n: number; last: Date | null }[]>`
    SELECT c AS name, count(*)::int AS n, max(a.updated_at) AS last
    FROM articles a, unnest(a.companies) AS c
    WHERE a.published_version_id IS NOT NULL AND a.status NOT IN ('ARCHIVED', 'REJECTED') AND length(trim(c)) > 0
    GROUP BY c
  `;
  const curated = new Map(ALL_COMPANIES.map((n) => [slugifyCompany(n), n]));

  const bySlug = new Map<string, CompanyEntry & { top: number }>();
  for (const r of rows) {
    const slug = slugifyCompany(r.name);
    if (!slug) continue;
    const e = bySlug.get(slug);
    if (!e) {
      bySlug.set(slug, { slug, name: r.name, names: [r.name], storyCount: r.n, lastModified: r.last, top: r.n });
      continue;
    }
    e.names.push(r.name);
    e.storyCount += r.n;
    if (r.n > e.top) {
      e.top = r.n;
      e.name = r.name;
    }
    if (r.last && (!e.lastModified || r.last > e.lastModified)) e.lastModified = r.last;
  }

  const value = new Map<string, CompanyEntry>();
  for (const [slug, { top: _top, ...e }] of bySlug) value.set(slug, { ...e, name: curated.get(slug) ?? e.name });
  cache = { value, expires: Date.now() + TTL_MS };
  return value;
}
