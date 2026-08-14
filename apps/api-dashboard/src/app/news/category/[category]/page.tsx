import React from "react";
import { prisma } from "../../../../lib/prisma";
import { ArticleCard } from "../../../../components/ArticleCard";
import type { ArticleProps } from "../../../../components/FeaturedCard";

export const dynamic = 'force-dynamic';

function mapDbToArticleProps(dbArticle: any): ArticleProps {
  const scrapeResult = dbArticle.intelligenceResult?.categorization?.scrapeResult;
  
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

  const authorName = scrapeResult?.author || 'Unknown Author';
  
  let authorInitials = 'AN';
  if (authorName !== 'Unknown Author') {
    const parts = authorName.split(' ');
    if (parts.length >= 2) {
      authorInitials = (parts[0][0] + parts[1][0]).toUpperCase();
    } else {
      authorInitials = authorName.substring(0, 2).toUpperCase();
    }
  }

  // Handle Image URL
  let imageUrl = dbArticle.headerImage;

  // Fallback to original scraped image if S3 watermarked image is missing
  if (!imageUrl && scrapeResult) {
    if (scrapeResult.openGraph && (scrapeResult.openGraph as any)['og:image']) {
      imageUrl = (scrapeResult.openGraph as any)['og:image'];
    } else if (scrapeResult.images) {
      let parsedImages = scrapeResult.images;
      if (typeof parsedImages === 'string') {
        try { parsedImages = JSON.parse(parsedImages); } catch (e) {}
      }
      if (Array.isArray(parsedImages) && parsedImages.length > 0) {
        imageUrl = parsedImages[0].src || parsedImages[0];
      }
    }
  }

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

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const resolvedParams = await params;
  const decodedCategory = decodeURIComponent(resolvedParams.category).replace(/-/g, ' ');
  
  // Fetch all articles to generate the sticky nav categories
  const allDbArticles = await prisma.originalContent.findMany({
    orderBy: { createdAt: 'desc' },
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

  const allArticles = allDbArticles.map(mapDbToArticleProps);
  const categories = Array.from(new Set(allArticles.map(a => a.category)));

  const urlCategory = resolvedParams.category;
  
  // Filter articles for this specific category (by matching URL slug)
  const categoryArticles = allArticles.filter(
    a => a.category.toLowerCase().replace(/[^a-z0-9]+/g, '-') === urlCategory
  );
  
  // Find the actual display name of the category for the title
  const actualCategoryName = categories.find(
    c => c.toLowerCase().replace(/[^a-z0-9]+/g, '-') === urlCategory
  ) || decodedCategory;
  
  const isEmpty = categoryArticles.length === 0;

  return (
    <div className="App min-h-screen flex flex-col bg-white dark:bg-gray-950">
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

      <div className="flex-1 mt-16">
        <div className="border-b border-gray-200 dark:border-gray-800 sticky top-16 bg-white dark:bg-gray-950 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide py-4">
              <a
                className="flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition-all bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                href="/"
              >
                <span className="text-sm font-medium">All Posts</span>
              </a>
              {categories.map((cat, idx) => {
                const isActive = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-') === urlCategory;
                return (
                  <a
                    key={idx}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition-all ${
                      isActive 
                        ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/30'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                    href={`/news/category/${cat.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  >
                    <span className="text-sm font-medium">{cat}</span>
                  </a>
                );
              })}
            </div>
          </div>
        </div>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-8">
            <h2 className="text-4xl font-bold text-slate-900 dark:text-white mb-2 capitalize">
              {actualCategoryName} Stories
            </h2>
            <p className="text-xl text-slate-600 dark:text-gray-400 max-w-3xl">
              Latest news and trends from the {actualCategoryName} space.
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
