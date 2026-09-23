import React from 'react';
import type { Metadata } from 'next';
import { ArticleCard } from '../../components/ArticleCard';
import { SearchBox } from '../../components/site/SearchBox';
import { SectionHeading } from '../../components/news/SectionHeading';
import { normalizeQuery, searchStories } from '@/lib/search';
import { BRAND } from '@/lib/seo';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ q?: string }> };

export const metadata: Metadata = {
  title: 'Search',
  // Result pages are classic index bloat, and this site has a live sitemap and
  // news sitemap to protect.
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = normalizeQuery(q);
  const results = query ? await searchStories(query, { take: 40 }) : [];

  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <SectionHeading
        label="Search"
        blurb={'Stories, companies and topics across ' + BRAND + '.'}
      />

      <SearchBox defaultValue={query} className="mb-10 max-w-xl" />

      {!query ? (
        <p className="text-sm text-gray-500">Type a company, a topic or a headline to begin.</p>
      ) : results.length === 0 ? (
        <div className="border border-dashed border-black/15 px-4 py-16 text-center dark:border-white/12">
          <h2 className="font-headline text-xl text-gray-950 dark:text-white">
            Nothing matches &ldquo;{query}&rdquo;
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-gray-500">
            Try a shorter phrase, a company name, or browse a topic from the menu.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-8 text-sm text-gray-500">
            {results.length} {results.length === 1 ? 'story' : 'stories'} matching &ldquo;{query}&rdquo;
          </p>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {results.map((r) => (
              <ArticleCard key={r.props.url} article={r.props} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
