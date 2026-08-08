import React from "react";
export const dynamic = 'force-dynamic';
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { SafeImage } from "../../../../components/SafeImage";

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const decodedSlug = decodeURIComponent(resolvedParams.slug);

  const dbArticle = await prisma.originalContent.findUnique({
    where: { slug: decodedSlug },
    include: {
      intelligenceResult: {
        include: {
          categorization: {
            include: {
              scrapeResult: true,
              urlState: {
                include: {
                  source: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!dbArticle) {
    notFound();
  }

  // Fetch Latest Stories for Sidebar
  const latestDbArticles = await prisma.originalContent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 4,
    include: {
      intelligenceResult: {
        include: {
          categorization: {
            include: {
              scrapeResult: true
            }
          }
        }
      }
    }
  });

  // Fetch all articles to generate the categories sidebar
  const allDbArticles = await prisma.originalContent.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      intelligenceResult: {
        include: {
          categorization: true
        }
      }
    }
  });
  const categories = Array.from(new Set(allDbArticles.map(a => a.intelligenceResult?.categorization?.primaryCategory || 'Technology')));

  const scrapeResult = dbArticle.intelligenceResult?.categorization?.scrapeResult;
  const urlState = dbArticle.intelligenceResult?.categorization?.urlState;
  const source = urlState?.source;
  
  // Source URL & name for Content Courtesy
  const sourceUrl = scrapeResult?.canonicalUrl || urlState?.url || null;
  const sourceName = source?.name || (sourceUrl ? new URL(sourceUrl).hostname.replace('www.', '') : 'Original Source');

  let publishedDate = 'Unknown Date';
  if (scrapeResult?.publishedDate) {
    publishedDate = new Date(scrapeResult.publishedDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } else {
    publishedDate = new Date(dbArticle.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  const authorName = 'LazyFounders';
  let authorInitials = 'LF';

  let displayImage = dbArticle.headerImage || '/placeholder.jpg';

  const category = dbArticle.intelligenceResult?.categorization?.primaryCategory || 'Technology';
  const readTime = scrapeResult?.readingTimeMin ? Math.round(scrapeResult.readingTimeMin) : 5;

  // Clean the body: strip placeholder images and "Featured Image:" labels
  let cleanBody = dbArticle.bodyHtml
    .replace(/\*\*Featured Image\*\*:\s*/gi, '')
    .replace(/\*\*Featured Image:\*\*\s*/gi, '')
    .replace(/Featured Image:\s*/gi, '')
    .replace(/!\[alt text\]\(placeholder[^)]*\)/gi, '')
    .replace(/!\[[^\]]*\]\(placeholder[^)]*\)/gi, '')
    .replace(/^\s*\n/gm, '\n'); // clean up empty lines left over

  // Inject HTML wrappers for styling since the LLM now outputs pure Markdown headers
  cleanBody = cleanBody.replace(
    /###\s+30 SEC SUMMARY\s*\n([\s\S]*?)(?=\n### |$)/i,
    '<div class="summary-box"><h3>30 SEC SUMMARY</h3>\n$1\n</div>\n\n'
  );
  cleanBody = cleanBody.replace(
    /###\s+TABLE OF CONTENTS\s*\n([\s\S]*?)(?=\n### |$)/i,
    '<div class="table-of-contents"><h3>TABLE OF CONTENTS</h3>\n$1\n</div>\n\n'
  );
  cleanBody = cleanBody.replace(
    /###\s+KEY HIGHLIGHTS\s*\n([\s\S]*?)(?=\n### |$)/i,
    '<div class="key-highlights"><h3>KEY HIGHLIGHTS</h3>\n$1\n</div>\n\n'
  );

  return (
    <div className="App min-h-screen flex flex-col bg-white dark:bg-[#05070A]">
      <nav
        className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-[#05070A] border-b border-slate-100 dark:border-gray-800"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative flex items-center justify-between h-16">
            <a className="flex items-center space-x-2" href="/">
              <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                blogy
              </span>
            </a>
          </div>
        </div>
      </nav>

      <main className="text-slate-900 dark:text-white pt-24 min-h-screen flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <a
            className="inline-flex items-center gap-2 text-teal-600 dark:text-teal-400 text-sm font-medium mb-8 hover:text-teal-500 dark:hover:text-teal-300 transition-colors"
            href="/"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-arrow-left w-4 h-4"
            >
              <path d="m12 19-7-7 7-7"></path>
              <path d="M19 12H5"></path>
            </svg>
            Back to all stories
          </a>

          <div className="flex flex-col lg:flex-row gap-10 lg:gap-14">
            <div className="min-w-0 flex-1 lg:max-w-[760px]">
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <span
                  className="inline-flex items-center gap-1.5 bg-teal-500/10 text-teal-700 border border-teal-500/30 dark:bg-teal-500/15 dark:text-teal-400 dark:border-teal-500/35 px-3 py-1.5 rounded-full text-xs font-semibold"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="lucide lucide-rocket w-3.5 h-3.5"
                  >
                    <path
                      d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"
                    ></path>
                    <path
                      d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"
                    ></path>
                    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path>
                    <path
                      d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"
                    ></path>
                  </svg>
                  {category}
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-white leading-[1.1] tracking-tight mb-6">
                {dbArticle.seoTitle}
              </h1>

              <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 leading-relaxed mb-8">
                {dbArticle.metaDescription}
              </p>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 mb-8 border-b border-slate-200 dark:border-white/10">
                <div className="flex items-center gap-3">
                  <div
                    className="rounded-full overflow-hidden bg-teal-100 dark:bg-teal-950/50 ring-2 ring-slate-200 dark:ring-white/10 shrink-0 flex items-center justify-center font-bold text-teal-600 dark:text-teal-400"
                    style={{ width: 48, height: 48 }}
                  >
                    {authorInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white leading-tight text-base">
                      {authorName}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <span>{publishedDate}</span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-clock w-4 h-4 text-slate-500"
                      >
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      {readTime} min read
                    </span>
                  </div>
                </div>
              </div>

              <figure className="rounded-2xl overflow-hidden mb-10 aspect-video bg-slate-100 ring-1 ring-slate-200 dark:bg-[#121820] dark:ring-white/10">
                <SafeImage
                  src={displayImage}
                  alt={dbArticle.seoTitle}
                  className="w-full h-full object-cover"
                />
              </figure>

              <div className="prose-custom max-w-none">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                >
                  {cleanBody}
                </ReactMarkdown>
              </div>

              {/* Content Courtesy */}
              <div className="content-courtesy mt-12">
                <p className="text-xs uppercase tracking-[0.15em] text-teal-600 dark:text-teal-400 font-bold mb-4">Content Courtesy</p>
                <div className="flex items-start gap-4">
                  <div className="courtesy-icon-wrap shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-500">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-slate-900 dark:text-white mb-1">
                      {sourceName} <span className="font-normal text-slate-500 dark:text-slate-300">— by {authorName}</span>
                    </p>
                    {sourceUrl && (
                      <a 
                        href={sourceUrl} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="courtesy-link inline-flex items-center gap-1.5 text-sm text-teal-600 dark:text-teal-400 hover:underline break-all"
                      >
                        Source: {sourceUrl}
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </a>
                    )}
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-500 leading-relaxed">
                      This article has been rewritten and curated by Blogy News from the original source above. All credit for the underlying reporting belongs to the original publisher. Read the full original piece via the link.
                    </p>
                  </div>
                </div>
              </div>

            </div>

            <aside className="lg:w-[340px] lg:shrink-0 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto space-y-6 lg:pb-12">
              <section className="rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white p-6 relative overflow-hidden shadow-xl shadow-teal-500/20">
                <div className="relative z-10">
                  <span className="inline-block px-2 py-1 bg-white/20 rounded text-[10px] font-bold tracking-wider uppercase mb-3 backdrop-blur-md">Sponsor</span>
                  <h3 className="text-xl font-bold mb-2 leading-tight">Fire your SEO agency. Use Blogy instead.</h3>
                  <p className="text-teal-50 text-sm mb-5 leading-relaxed">Automate your content creation and SEO growth with AI-powered programmatic SEO tailored for SaaS startups.</p>
                  <a href="https://blogy.in" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-white text-teal-600 rounded-lg font-semibold text-sm hover:bg-teal-50 transition-colors">Start Free Trial</a>
                </div>
              </section>

              <section className="rounded-2xl bg-white dark:bg-[#0d1117] ring-1 ring-slate-200 dark:ring-white/10 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">Latest News</p>
                <div className="space-y-3.5">
                  {latestDbArticles.map((latest, idx) => {
                    const lScrape = latest.intelligenceResult?.categorization?.scrapeResult;
                    const lReadTime = lScrape?.readingTimeMin ? Math.round(lScrape.readingTimeMin) : 5;
                    let lImageUrl = latest.headerImage;
                    const lExtImages = lScrape?.images as string[] | undefined;
                    if (!lImageUrl && lExtImages && lExtImages.length > 0) {
                      lImageUrl = lExtImages[0];
                    }
                    const lDisplayImage = lImageUrl || '/placeholder.jpg';

                    return (
                      <a key={idx} href={`/news/article/${latest.slug}`} className="group flex gap-3 items-start">
                        <SafeImage src={lDisplayImage} alt={latest.seoTitle} className="w-16 h-16 rounded-lg object-cover bg-slate-100 dark:bg-[#121820] shrink-0 ring-1 ring-slate-200 dark:ring-white/10" loading="lazy" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                            {latest.seoTitle}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-500 mt-1 flex items-center gap-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-clock w-3 h-3"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            {' '}{lReadTime} min read
                          </p>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-2xl bg-white dark:bg-[#0d1117] ring-1 ring-slate-200 dark:ring-white/10 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">Browse Categories</p>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat, idx) => (
                    <a key={idx} href={`/news/category/${cat.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-[#121820] text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-950/40 dark:hover:text-teal-400 transition-colors">
                      {cat}
                    </a>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </div>
      </main>

    </div>
  );
}
