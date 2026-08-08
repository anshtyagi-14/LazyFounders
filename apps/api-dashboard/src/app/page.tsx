import React from "react";
export const dynamic = 'force-dynamic';
import { prisma } from "@/lib/prisma";
import { FeaturedCard, ArticleProps } from "../components/FeaturedCard";
import { ArticleCard } from "../components/ArticleCard";

// Helper function to map DB record to ArticleProps
function mapDbToArticleProps(dbArticle: any): ArticleProps {
  const scrapeResult = dbArticle.intelligenceResult?.categorization?.scrapeResult;
  
  // Format the date
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

  // Format the author name
  const authorName = 'LazyFounders';
  const authorInitials = 'LF';

  // Handle Image URL
  let imageUrl = dbArticle.headerImage;
  const displayImage = imageUrl || '/placeholder.jpg';

  return {
    url: `/news/article/${dbArticle.slug}`,
    imageUrl: displayImage,
    category: dbArticle.intelligenceResult?.categorization?.primaryCategory || 'Technology',
    title: dbArticle.seoTitle,
    description: dbArticle.metaDescription,
    authorInitials,
    authorName,
    readTime: scrapeResult?.readingTimeMin ? Math.round(scrapeResult.readingTimeMin) : 5,
    publishedDate
  };
}

export default async function NewsDashboard() {
  // Fetch up to 28 most recent articles
  const dbArticles = await prisma.originalContent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 28,
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

  const articles = dbArticles.map(mapDbToArticleProps);
  const featuredArticles = articles.slice(0, 4);
  const latestArticles = articles.slice(4, 28);
  const isEmpty = articles.length === 0;

  return (
    <>
      <div className="App min-h-screen flex flex-col bg-white dark:bg-gray-950">
        <nav
          className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-[#05070A] border-b border-slate-100 dark:border-gray-800"
          data-testid="navbar"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative flex items-center justify-between h-16">
              <a className="flex items-center space-x-2" href="/" data-testid="logo-link">
                <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  blogy
                </span>
              </a>
            </div>
          </div>
        </nav>
        <div className="flex-1">
          <div className="bg-white dark:bg-gray-950" data-testid="homepage">
            <section
              className="pt-20 pb-12 bg-white dark:bg-gray-950"
              data-testid="hero-section"
            >
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="mb-8">
                  <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-slate-900 dark:text-white mb-4">
                    Stay <span className="text-teal-500">in the loop</span>
                  </h1>
                  <div className="inline-flex items-center space-x-2 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 px-4 py-2 rounded-full">
                    <span className="text-sm font-medium">
                      ⚡ Fresh stories on startups, funding, AI &amp; product
                    </span>
                  </div>
                </div>
                
                <div className="mb-4">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-1 h-8 bg-teal-500 rounded-full shrink-0"></div>
                    <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                      <span className="text-slate-400 dark:text-gray-500 font-semibold mr-1">
                        |
                      </span>
                      Featured
                    </h2>
                  </div>
                  
                  {isEmpty ? (
                    <div className="flex flex-col items-center justify-center py-20 px-4 border border-dashed border-gray-300 dark:border-gray-800 rounded-2xl bg-gray-50 dark:bg-gray-900/50">
                      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-search text-gray-400 mb-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"></path><path d="M14 3v5h5M16 13H8M16 17H8M10 9H8"></path></svg>
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Articles Found</h3>
                      <p className="text-gray-500 dark:text-gray-400 text-center max-w-md">Our discovery engine hasn't found any articles yet. Please check back later or start a new crawl.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
                      {featuredArticles.map((article, idx) => (
                        <FeaturedCard key={idx} article={article} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
            
            <div
              className="border-b border-gray-200 dark:border-gray-800 sticky top-16 bg-white dark:bg-gray-950 z-40"
              data-testid="category-nav"
            >
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide py-4">
                  <a
                    className="flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition-all bg-teal-500 text-white shadow-lg shadow-teal-500/30"
                    data-testid="category-all"
                    href="/news"
                  >
                    <span className="text-sm font-medium">All Posts</span>
                  </a>
                  {Array.from(new Set(articles.map(a => a.category))).map((cat, idx) => (
                    <a
                      key={idx}
                      className="flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition-all bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                      href={`/news/category/${cat.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    >
                      <span className="text-sm font-medium">{cat}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <main
              id="latest-stories"
              className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 scroll-mt-24"
            >
              <div className="mb-8">
                <h2 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
                  Latest Stories
                </h2>
                <p className="text-xl text-slate-600 dark:text-gray-400 max-w-3xl">
                  Discover the latest trends in technology, venture, and
                  product—curated for builders who want signal, not hype.
                </p>
              </div>

              {!isEmpty && latestArticles.length > 0 && (
                <div
                  className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-10"
                  data-testid="blog-grid"
                >
                  {latestArticles.map((article, idx) => (
                    <ArticleCard key={idx} article={article} />
                  ))}
                </div>
              )}
            </main>
            
          </div>
        </div>
      </div>
    </>
  );
}
