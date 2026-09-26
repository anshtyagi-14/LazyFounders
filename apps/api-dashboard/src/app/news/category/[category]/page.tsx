import React from "react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { ArticleCard } from "../../../../components/ArticleCard";
import { Breadcrumbs } from "../../../../components/Breadcrumbs";
import { JsonLd } from "../../../../components/JsonLd";
import { withContactStrip } from "../../../../components/ContactStrip";
import { listCategoryFeed } from "@/lib/feed";
import { SITE_CATEGORIES, resolveCategorySlug, type SiteCategory } from "@/lib/topics";
import { gaAttrs } from "@/lib/ga-attrs";
import { BRAND, collectionPageSchema, pageMetadata } from "@/lib/seo";

// A category page changes whenever the beat does, which is slower than the front page.
export const revalidate = 120;

const PER_PAGE = 24;

type Props = {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ page?: string }>;
};

/** `?page=` is reader input: anything that is not a positive integer is page 1. */
function readPage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 1 ? n : 1;
}

/** Page 1 is the bare URL, so it never competes with itself as ?page=1. */
function pagePath(slug: string, page: number): string {
  const base = `/news/category/${slug}`;
  return page > 1 ? `${base}?page=${page}` : base;
}

/**
 * Resolve the URL to a site category. An old or alias slug (/news/category/startups,
 * /news/category/fintech) 308s to the category it folds into, so links and
 * rankings built on the old long tail consolidate instead of 404ing.
 */
async function loadCategory(params: Props["params"], searchParams: Props["searchParams"]) {
  const [resolvedParams, resolvedSearch] = await Promise.all([params, searchParams]);
  const requested = decodeURIComponent(resolvedParams.category).toLowerCase();
  const category = resolveCategorySlug(requested);
  if (!category) notFound();
  if (category.slug !== requested) permanentRedirect(`/news/category/${category.slug}`);

  const page = readPage(resolvedSearch.page);
  const { items, total } = await listCategoryFeed(category.slug, { page, perPage: PER_PAGE });
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  return { category, items, total, page, pageCount };
}

function crumbs(category: SiteCategory) {
  return [
    { name: "Home", path: "/" },
    { name: category.label, path: `/news/category/${category.slug}` },
  ];
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { category, items, total, page, pageCount } = await loadCategory(params, searchParams);
  const suffix = page > 1 ? ` — page ${page} of ${pageCount}` : "";
  const lead = items.find((i) => i.hasImage);

  return pageMetadata({
    title: `${category.label} news${suffix}`,
    description: category.description,
    // Each page in the series is its own canonical URL. Google retired rel=next/prev
    // as an indexing signal in 2019; what it reads now is real links between the
    // pages and a self-canonical on each one.
    path: pagePath(category.slug, page),
    image: lead?.props.imageUrl,
    keywords: [category.label, `${category.label} news`, `${category.label} startups`],
  });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category, items, total, page, pageCount } = await loadCategory(params, searchParams);

  // A page number past the end is not a thin page to index, it is a wrong URL.
  if (page > pageCount && total > 0) notFound();

  const schema = collectionPageSchema({
    path: pagePath(category.slug, page),
    name: `${category.label} news`,
    description: category.description,
    crumbs: crumbs(category),
    entries: items.map((i) => ({ path: i.props.url, name: i.props.title })),
  });

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <JsonLd data={schema} />
      <nav aria-label="Categories" className="border-b border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <ul className="flex items-center gap-2 overflow-x-auto py-3 scrollbar-hide">
            {SITE_CATEGORIES.map((c) => {
              const active = c.slug === category.slug;
              return (
                <li key={c.slug}>
                  <Link
                    href={`/news/category/${c.slug}`}
                    aria-current={active ? "page" : undefined}
                    {...gaAttrs("category_select", { category: c.label, source_surface: "category_bar" })}
                    className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors ${
                      active
                        ? "bg-teal-500 text-black"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    }`}
                  >
                    {c.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Breadcrumbs crumbs={crumbs(category)} className="mb-4" />
        <div className="mb-8">
          <h1 className="mb-2 font-headline text-4xl font-semibold text-slate-900 dark:text-white">
            {category.label}
            {page > 1 ? <span className="text-slate-500 dark:text-gray-400"> — page {page}</span> : null}
          </h1>
          <p className="max-w-3xl text-lg text-slate-600 dark:text-gray-400">{category.description}</p>
        </div>

        {total === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-20 dark:border-gray-800 dark:bg-gray-900/50">
            <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">No stories yet</h2>
            <p className="max-w-md text-center text-gray-600 dark:text-gray-400">
              {BRAND} has not published {category.label} coverage yet. The front page has everything published so far.
            </p>
            <Link href="/" className="mt-6 text-sm font-semibold text-teal-700 hover:underline dark:text-teal-400">
              Go to the front page
            </Link>
          </div>
        ) : (
          <>
            <h2 className="sr-only">Latest {category.label} stories</h2>
            <div className="mb-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {withContactStrip(
                items.map((item, idx) => (
                  <ArticleCard
                    key={item.id}
                    article={item.props}
                    context={{ surface: `category_${category.slug}`, position: (page - 1) * PER_PAGE + idx + 1 }}
                  />
                )),
                `category_${category.slug}`,
              )}
            </div>

            {pageCount > 1 ? (
              <nav
                aria-label={`${category.label} pages`}
                className="flex flex-wrap items-center justify-center gap-2 border-t border-gray-200 pt-8 dark:border-gray-800"
              >
                {page > 1 ? (
                  <Link
                    href={pagePath(category.slug, page - 1)}
                    rel="prev"
                    className="inline-flex min-h-11 items-center rounded-full bg-gray-100 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    ← Newer
                  </Link>
                ) : null}

                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <Link
                    key={n}
                    href={pagePath(category.slug, n)}
                    aria-current={n === page ? "page" : undefined}
                    aria-label={`Page ${n}`}
                    className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm font-medium transition-colors ${
                      n === page
                        ? "bg-teal-500 text-black"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    }`}
                  >
                    {n}
                  </Link>
                ))}

                {page < pageCount ? (
                  <Link
                    href={pagePath(category.slug, page + 1)}
                    rel="next"
                    className="inline-flex min-h-11 items-center rounded-full bg-gray-100 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Older →
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
