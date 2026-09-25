import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArticleCard } from "../../../components/ArticleCard";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { JsonLd } from "../../../components/JsonLd";
import { SafeImage } from "../../../components/SafeImage";
import { countPublishedArticles, listPublishedArticles } from "@/lib/articles";
import { authorInitials, authorPath, getAuthor, type PublicAuthor } from "@/lib/authors";
import { ownToFeedItem } from "@/lib/feed";
import { BRAND, SITE_LANG, absoluteUrl, breadcrumbSchema, itemListSchema, pageMetadata, personSchema, WEBSITE_ID } from "@/lib/seo";

// A byline page moves only when that author publishes.
export const revalidate = 300;

const PER_PAGE = 24;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

/** `?page=` is reader input: anything that is not a positive integer is page 1. */
function readPage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 1 ? n : 1;
}

/** Page 1 is the bare URL, so it never competes with itself as ?page=1. */
function pagePath(slug: string, page: number): string {
  const base = authorPath(slug);
  return page > 1 ? `${base}?page=${page}` : base;
}

async function loadAuthor(params: Props["params"], searchParams: Props["searchParams"]) {
  const [resolvedParams, resolvedSearch] = await Promise.all([params, searchParams]);
  const author = await getAuthor(decodeURIComponent(resolvedParams.slug).toLowerCase());
  if (!author) notFound();
  const page = readPage(resolvedSearch.page);
  const [articles, total] = await Promise.all([
    listPublishedArticles({ authorId: author.id, take: PER_PAGE, skip: (page - 1) * PER_PAGE }),
    countPublishedArticles({ authorId: author.id }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  return { author, items: articles.map(ownToFeedItem), total, page, pageCount };
}

function crumbs(author: PublicAuthor) {
  return [
    { name: "Home", path: "/" },
    { name: author.name, path: authorPath(author.slug) },
  ];
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { author, total, page, pageCount } = await loadAuthor(params, searchParams);
  const suffix = page > 1 ? ` — page ${page} of ${pageCount}` : "";
  return pageMetadata({
    title: `${author.name}, ${author.jobTitle} at ${BRAND}${suffix}`,
    description: author.bio,
    path: pagePath(author.slug, page),
    image: author.avatarUrl,
    imageAlt: author.name,
    keywords: [author.name, `${author.name} ${BRAND}`],
    index: total > 0,
  });
}

export default async function AuthorPage({ params, searchParams }: Props) {
  const { author, items, total, page, pageCount } = await loadAuthor(params, searchParams);
  if (page > pageCount && total > 0) notFound();

  const url = absoluteUrl(pagePath(author.slug, page));
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${url}#webpage`,
        url,
        name: `${author.name} — ${BRAND}`,
        inLanguage: SITE_LANG,
        isPartOf: { "@id": WEBSITE_ID },
        mainEntity: personSchema(author),
        breadcrumb: breadcrumbSchema(crumbs(author)),
        hasPart: itemListSchema(items.map((i) => ({ path: i.props.url, name: i.props.title }))),
      },
    ],
  };
  const linkedIn = author.sameAs.find((u) => /linkedin\.com/i.test(u));

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <JsonLd data={schema} />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Breadcrumbs crumbs={crumbs(author)} className="mb-6" />

        <header className="mb-10 flex flex-col gap-6 border-b border-gray-200 pb-10 sm:flex-row sm:items-start dark:border-gray-800">
          <div
            aria-hidden="true"
            className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-100 text-3xl font-bold text-teal-700 ring-2 ring-slate-200 dark:bg-teal-950/50 dark:text-teal-400 dark:ring-white/10"
          >
            {author.avatarUrl ? (
              <SafeImage src={author.avatarUrl} alt="" width={96} height={96} className="h-full w-full object-cover" />
            ) : (
              authorInitials(author.name)
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-headline text-4xl font-semibold text-slate-900 dark:text-white">
              {author.name}
              {page > 1 ? <span className="text-slate-500 dark:text-gray-400"> — page {page}</span> : null}
            </h1>
            <p className="mt-1 text-base font-medium text-teal-700 dark:text-teal-400">
              {author.jobTitle}, {BRAND}
            </p>
            <p className="mt-4 max-w-3xl text-lg text-slate-600 dark:text-gray-400">{author.bio}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {linkedIn ? (
                <a href={linkedIn} target="_blank" rel="noopener noreferrer me" className="font-semibold text-teal-700 hover:underline dark:text-teal-400">
                  LinkedIn ↗
                </a>
              ) : null}
              <span className="text-slate-500 dark:text-gray-400">
                {total} {total === 1 ? "story" : "stories"}
              </span>
              <Link href="/ai-policy" className="text-slate-500 hover:underline dark:text-gray-400">
                How we use AI
              </Link>
            </div>
          </div>
        </header>

        {total === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No published stories yet.</p>
        ) : (
          <>
            <h2 className="mb-6 font-headline text-2xl font-semibold text-slate-900 dark:text-white">Stories by {author.name}</h2>
            <div className="mb-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item, idx) => (
                <ArticleCard
                  key={item.id}
                  article={item.props}
                  context={{ surface: "author_page", position: (page - 1) * PER_PAGE + idx + 1 }}
                />
              ))}
            </div>

            {pageCount > 1 ? (
              <nav
                aria-label={`Stories by ${author.name}, pages`}
                className="flex flex-wrap items-center justify-center gap-2 border-t border-gray-200 pt-8 dark:border-gray-800"
              >
                {page > 1 ? (
                  <Link
                    href={pagePath(author.slug, page - 1)}
                    rel="prev"
                    className="inline-flex min-h-11 items-center rounded-full bg-gray-100 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    ← Newer
                  </Link>
                ) : null}
                <span className="px-3 text-sm text-gray-600 dark:text-gray-400">
                  Page {page} of {pageCount}
                </span>
                {page < pageCount ? (
                  <Link
                    href={pagePath(author.slug, page + 1)}
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
