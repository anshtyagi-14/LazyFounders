import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ArticleCard } from "../../../../components/ArticleCard";
import { JsonLd } from "../../../../components/JsonLd";
import { listCategories, listPublishedArticles, slugifyCategory, toArticleProps } from "@/lib/articles";
import { BRAND, collectionPageSchema, ogImageUrl, pageMetadata } from "@/lib/seo";

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ category: string }> };

/** Resolve the slug back to the stored category label and its published stories. */
async function loadCategory(params: Props["params"]) {
  const resolvedParams = await params;
  const urlCategory = decodeURIComponent(resolvedParams.category);
  const [categories, published] = await Promise.all([
    listCategories(),
    listPublishedArticles({ category: urlCategory, take: 60 }),
  ]);
  const name = categories.find((c) => slugifyCategory(c) === urlCategory) || urlCategory.replace(/-/g, ' ');
  return { urlCategory, categories, published, name };
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { urlCategory, published, name } = await loadCategory(params);
  const label = titleCase(name);
  const lead = published[0]?.headline;
  return pageMetadata({
    title: `${label} news — funding, launches and analysis`,
    description: published.length
      ? `${published.length} ${label} ${published.length === 1 ? 'story' : 'stories'} on ${BRAND}${lead ? `, including “${lead}”` : ''}. Updated continuously with cited reporting.`
      : `${label} coverage on ${BRAND}. New stories are published as our newsroom pipeline verifies them.`,
    path: `/news/category/${urlCategory}`,
    image: published[0]?.featuredImage?.url ?? ogImageUrl({ title: `${label} news`, kicker: 'Category', meta: `${published.length} stories` }),
    keywords: [label, `${label} news`, `${label} startups`, `${label} funding`],
    // An empty category is thin content: keep it crawlable but out of the index.
    index: published.length > 0,
  });
}

export default async function CategoryPage({ params }: Props) {
  const { urlCategory, categories, published, name } = await loadCategory(params);
  const categoryArticles = published.map(toArticleProps);
  const actualCategoryName = name;

  const isEmpty = categoryArticles.length === 0;

  const schema = collectionPageSchema({
    path: `/news/category/${urlCategory}`,
    name: `${titleCase(actualCategoryName)} news`,
    description: `Latest ${actualCategoryName} reporting from ${BRAND}.`,
    crumbs: [
      { name: "Home", path: "/" },
      { name: titleCase(actualCategoryName), path: `/news/category/${urlCategory}` },
    ],
    entries: published.map((a) => ({ path: `/news/article/${a.slug}`, name: a.headline })),
  });

  return (
    <div className="App min-h-screen flex flex-col bg-white dark:bg-gray-950">
      <JsonLd data={schema} />
      <div className="flex-1">
        <div className="border-b border-gray-200 dark:border-gray-800 sticky top-[var(--header-h)] bg-white dark:bg-gray-950 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide py-4">
              <Link
                className="flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition-all bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                href="/"
              >
                <span className="text-sm font-medium">All Posts</span>
              </Link>
              {categories.map((cat, idx) => {
                const isActive = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-') === urlCategory;
                return (
                  <Link
                    key={idx}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition-all ${
                      isActive 
                        ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/30'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                    href={`/news/category/${cat.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  >
                    <span className="text-sm font-medium">{cat}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2 capitalize">
              {actualCategoryName} Stories
            </h1>
            <p className="text-xl text-slate-600 dark:text-gray-400 max-w-3xl">
              {/* A direct, snippet-sized answer to "what is on this page?" for answer engines. */}
              {actualCategoryName} news on {BRAND}: {categoryArticles.length}{" "}
              {categoryArticles.length === 1 ? "story" : "stories"} covering funding rounds,
              product launches and analysis, each one written from cited primary sources.
            </p>
          </div>

          {isEmpty ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 border border-dashed border-gray-300 dark:border-gray-800 rounded-2xl bg-gray-50 dark:bg-gray-900/50">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-search text-gray-400 mb-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"></path><path d="M14 3v5h5M16 13H8M16 17H8M10 9H8"></path></svg>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Articles Found</h3>
              <p className="text-gray-500 dark:text-gray-400 text-center max-w-md">There are currently no articles in this category.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-10">
              {categoryArticles.map((article, idx) => (
                <ArticleCard key={idx} article={article} />
              ))}
            </div>
          )}
        </main>
      </div>

    </div>
  );
}
