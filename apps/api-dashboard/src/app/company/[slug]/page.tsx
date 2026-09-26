import React from 'react';
import type { Metadata } from 'next';
import { listPublishedArticles } from '@/lib/articles';
import Link from 'next/link';
import { SafeImage } from '../../../components/SafeImage';
import { BrandBadge } from '../../../components/BrandBadge';
import { JsonLd } from '../../../components/JsonLd';
import { withContactStrip } from '../../../components/ContactStrip';
import { BRAND, collectionPageSchema, pageMetadata } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { ALL_COMPANIES } from '@/lib/companies';
import { companyIndex, type CompanyEntry } from '@/lib/company-index';

// A company hub moves only when a new story mentions it.
export const revalidate = 300;




function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

type Props = { params: Promise<{ slug: string }> };

/** Empty on purpose: no build-time pages, but on-demand ISR (see the article page). */
export async function generateStaticParams() {
  return [];
}

interface CompanyArticle {
  id: string;
  slug: string;
  headerImage: string | null;
  seoTitle: string;
  metaDescription: string;
  createdAt: Date;
}

/** Resolve the slug to a company name and the published stories that mention it. */
async function loadCompany(params: Props['params']) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug || '';

  const curated = ALL_COMPANIES.find((c) => slugify(c) === slug);
  const entry = (await companyIndex().catch(() => new Map<string, CompanyEntry>())).get(slug);
  // A slug that is neither a curated company nor mentioned by any story is a
  // wrong URL, not an empty hub.
  if (!curated && !entry) notFound();
  const matchedCompany = curated ?? entry!.name;
  const spellings = [...new Set([...(entry?.names ?? []), matchedCompany, matchedCompany.toLowerCase()])];

  let articles: CompanyArticle[] = [];
  try {
    const published = await listPublishedArticles({ companies: spellings, take: 50 });
    articles = published.map((a) => ({
      id: a.id,
      slug: a.slug,
      headerImage: a.featuredImage?.url ?? null,
      seoTitle: a.headline,
      metaDescription: a.metaDescription,
      createdAt: a.publishedAt,
    }));
  } catch (error) {
    console.error(`Error fetching articles for company ${matchedCompany}:`, error);
  }

  return { slug, matchedCompany, articles };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, matchedCompany, articles } = await loadCompany(params);
  const count = articles.length;
  return pageMetadata({
    title: `${matchedCompany} news, funding and coverage`,
    description: count
      ? `${count} ${count === 1 ? 'story' : 'stories'} covering ${matchedCompany} on ${BRAND} — funding rounds, launches and analysis, each written from cited primary sources.`
      : `${matchedCompany} coverage on ${BRAND}. Stories appear here as soon as our newsroom pipeline picks them up.`,
    path: `/company/${slug}`,
    image: articles.find((a) => a.headerImage)?.headerImage,
    keywords: [matchedCompany, `${matchedCompany} news`, `${matchedCompany} funding`],
  });
}

export default async function CompanyNewsPage({ params }: Props) {
  const { slug, matchedCompany, articles } = await loadCompany(params);

  // The company is the subject of this page — naming it as an entity is what lets an
  // answer engine connect "news about <company>" to this URL.
  const schema = collectionPageSchema({
    path: `/company/${slug}`,
    name: `${matchedCompany} — news and coverage`,
    description: `Published ${BRAND} stories covering ${matchedCompany}.`,
    crumbs: [
      { name: 'Home', path: '/' },
      { name: matchedCompany, path: `/company/${slug}` },
    ],
    entries: articles.map((a) => ({ path: `/news/article/${a.slug}`, name: a.seoTitle })),
    about: { '@type': 'Organization', name: matchedCompany },
  });

  return (
    <div className="min-h-screen bg-white text-slate-800 font-sans pb-20 dark:bg-[#05070A] dark:text-slate-200">
      <JsonLd data={schema} />
      {/* Header */}
      <div className="border-b border-black/10 bg-white/80 backdrop-blur-md sticky top-[var(--header-h)] z-40 dark:border-white/5 dark:bg-[#0a0d14]/80">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Link href="/" className="text-teal-500 hover:text-teal-400 text-sm font-medium flex items-center gap-2 mb-4 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Home
          </Link>
          <h1 className="text-4xl font-extrabold text-slate-950 tracking-tight flex items-center gap-4 dark:text-white">
            <span className="bg-teal-500/20 text-teal-400 p-3 rounded-xl border border-teal-500/30">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </span>
            {matchedCompany} Intelligence
          </h1>
          <p className="text-slate-600 mt-3 text-lg dark:text-slate-400">Latest news, articles, and AI insights covering {matchedCompany}.</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 mt-12">
        {articles.length === 0 ? (
          <div className="bg-slate-50 border border-black/10 rounded-3xl p-12 text-center flex flex-col items-center justify-center dark:bg-[#0c1017] dark:border-white/5">
            <div className="bg-black/5 p-4 rounded-full mb-4 dark:bg-white/5">
              <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5L18.5 7H20" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-950 mb-2 dark:text-white">No active intelligence found</h3>
            <p className="text-slate-500 max-w-md">Our AI scrapers haven&apos;t picked up any recent articles or news covering {matchedCompany} yet. Check back soon!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {withContactStrip(articles.map((article) => (
              <Link href={`/news/article/${article.slug}`} key={article.id} className="group">
                <div className="bg-white border border-black/10 rounded-2xl overflow-hidden hover:border-teal-500/30 transition-all duration-300 h-full flex flex-col shadow-lg hover:shadow-teal-500/10 hover:-translate-y-1 dark:bg-[#0c1017] dark:border-white/5">
                  
                  {/* Article Image Placeholder */}
                  <div className="h-48 bg-slate-100 w-full relative overflow-hidden border-b border-black/10 dark:bg-slate-900 dark:border-white/5">
                    {article.headerImage ? (
                      <>
                        <SafeImage src={article.headerImage} alt={article.seoTitle} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-300" />
                        <BrandBadge />
                      </>
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-teal-900/40 to-slate-900 flex items-center justify-center">
                        <svg className="w-10 h-10 text-teal-500/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5L18.5 7H20" />
                        </svg>
                      </div>
                    )}
                    <div className="absolute top-4 left-4">
                       <span className="bg-black/60 backdrop-blur-md text-teal-400 text-xs font-bold px-3 py-1.5 rounded-full border border-teal-500/20 uppercase tracking-wider">
                         AI Optimized
                       </span>
                    </div>
                  </div>
                  
                  {/* Article Content */}
                  <div className="p-6 flex flex-col flex-grow">
                    <h2 className="text-lg font-bold text-slate-900 group-hover:text-teal-700 transition-colors leading-tight mb-3 line-clamp-3 dark:text-slate-200 dark:group-hover:text-teal-400">
                      {article.seoTitle}
                    </h2>
                    <p className="text-slate-500 text-sm line-clamp-3 mb-6">
                      {article.metaDescription}
                    </p>
                    
                    <div className="mt-auto flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-medium">
                        {new Date(article.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span className="text-teal-500 group-hover:translate-x-1 transition-transform">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            )), "company_page")}
          </div>
        )}
      </div>
    </div>
  );
}
