import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ArticleCard } from '../../components/ArticleCard';
import { withContactStrip } from '../../components/ContactStrip';
import { SearchBox } from '../../components/site/SearchBox';
import { SearchTracker } from '../../components/SearchTracker';
import { matchCompanies, normalizeQuery, searchStories } from '@/lib/search';
import { ALL_COMPANIES } from '@/lib/companies';
import { SITE_CATEGORIES } from '@/lib/topics';
import { gaAttrs } from '@/lib/ga-attrs';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { BRAND } from '@/lib/seo';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ q?: string }> };

export const metadata: Metadata = {
  title: 'Search',
  // Result pages are classic index bloat, and this site has a live sitemap and
  // news sitemap to protect.
  robots: { index: false, follow: true },
};

function slugifyCompany(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = normalizeQuery(q);

  // Each search is a database scan; a script hammering it gets a polite page
  // instead of more queries.
  const limited = query ? !(await rateLimit('search', clientIp(await headers()), 30, 60)).ok : false;
  const results = query && !limited ? await searchStories(query, { take: 40 }) : [];
  const companies = query && !limited ? matchCompanies(query, ALL_COMPANIES) : [];
  const total = results.length + companies.length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {query && !limited ? <SearchTracker query={query} resultCount={total} /> : null}
      <h1 className="mb-3 font-headline text-2xl leading-snug text-gray-950 dark:text-white">
        {query ? 'Search results for “' + query + '”' : 'Search ' + BRAND}
      </h1>
      <p className="mb-10 text-sm text-gray-600 dark:text-gray-400">Stories and companies across {BRAND}.</p>

      <SearchBox id="page-search" defaultValue={query} className="mb-10 max-w-xl" />

      {!query ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">Type a company, a topic or a headline to begin.</p>
      ) : limited ? (
        <p role="status" className="text-sm text-gray-700 dark:text-gray-300">
          You are searching faster than we can keep up. Please wait a minute and try again.
        </p>
      ) : total === 0 ? (
        <div className="border border-dashed border-black/15 px-4 py-16 text-center dark:border-white/12">
          <h2 className="font-headline text-xl text-gray-950 dark:text-white">Nothing matches &ldquo;{query}&rdquo;</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-gray-600 dark:text-gray-400">
            Try a shorter phrase or a company name, or browse a section:
          </p>
          <ul className="mt-6 flex flex-wrap justify-center gap-2">
            {SITE_CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/news/category/${c.slug}`}
                  {...gaAttrs('category_select', { category: c.label, source_surface: 'search_empty' })}
                  className="inline-flex min-h-11 items-center rounded-full bg-gray-100 px-4 text-sm font-medium text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          {companies.length > 0 ? (
            <section aria-labelledby="company-results" className="mb-12">
              <h2 id="company-results" className="mb-4 font-display text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-500">
                Companies
              </h2>
              <ul className="flex flex-wrap gap-2">
                {companies.map((name, i) => (
                  <li key={name}>
                    <Link
                      href={`/company/${slugifyCompany(name)}`}
                      {...gaAttrs('company_select', { content_id: name, source_surface: 'search', position: i + 1, search_term: query })}
                      className="inline-flex min-h-11 items-center rounded-full border border-black/15 px-4 text-sm font-medium text-gray-800 hover:border-teal-600 hover:text-teal-800 dark:border-white/15 dark:text-gray-200 dark:hover:text-teal-400"
                    >
                      {name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {results.length > 0 ? (
            <section aria-labelledby="story-results">
              <h2 id="story-results" className="mb-8 text-sm text-gray-600 dark:text-gray-400">
                {results.length} {results.length === 1 ? 'story' : 'stories'} matching &ldquo;{query}&rdquo;
              </h2>
              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {withContactStrip(
                  results.map((r, i) => (
                    <ArticleCard key={r.props.url} article={r.props} context={{ surface: 'search', position: i + 1 }} />
                  )),
                  'search',
                )}
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
