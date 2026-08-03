import React from 'react';
import { prisma } from "@/lib/prisma";
import Link from 'next/link';

// Helper to format relative time
function getRelativeTimeString(date: Date | string | null, fallbackDate: Date | string | null = null): string {
  const targetDate = date ? new Date(date) : (fallbackDate ? new Date(fallbackDate) : null);
  if (!targetDate) return 'Unknown';
  
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - targetDate.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  
  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) return `${diffInWeeks} week${diffInWeeks > 1 ? 's' : ''} ago`;
  
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''} ago`;
  
  return targetDate.toLocaleDateString();
}

export const dynamic = 'force-dynamic';

export default async function AdminOverview() {
  const [totalArticles, totalSources, recentErrors] = await Promise.all([
    prisma.originalContent.count(),
    prisma.source.count(),
    prisma.crawlError.count({
      where: { occurredAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
    })
  ]);

  const recentArticles = await prisma.originalContent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
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

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard Overview</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white dark:bg-[#121820] p-6 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
          <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Articles Generated</div>
          <div className="text-4xl font-bold text-teal-600 dark:text-teal-400">{totalArticles}</div>
        </div>
        <div className="bg-white dark:bg-[#121820] p-6 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
          <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Active Sources</div>
          <div className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">{totalSources}</div>
        </div>
        <div className="bg-white dark:bg-[#121820] p-6 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
          <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Errors (Last 24h)</div>
          <div className={`text-4xl font-bold ${recentErrors > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{recentErrors}</div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#121820] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-white/10 flex justify-between items-center">
          <h2 className="text-xl font-bold">Recently Published Articles</h2>
          <Link href="/" className="text-sm text-teal-600 dark:text-teal-400 font-medium hover:underline">View Live Blog &rarr;</Link>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-white/5 text-sm uppercase text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold w-full">Title</th>
                <th className="px-6 py-4 font-semibold">Category</th>
                <th className="px-6 py-4 font-semibold">Published</th>
                <th className="px-6 py-4 font-semibold">Processed At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/10 text-sm">
              {recentArticles.map((article) => {
                const category = article.intelligenceResult?.categorization?.primaryCategory || 'Technology';
                const originalPublishDate = article.intelligenceResult?.categorization?.scrapeResult?.publishedDate;
                
                return (
                  <tr key={article.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-medium max-w-md truncate">
                      <a href={`/news/article/${article.slug}`} className="hover:text-teal-500 transition-colors" target="_blank" rel="noreferrer">
                        {article.seoTitle}
                      </a>
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      <span className="px-2 py-1 rounded-full bg-slate-100 dark:bg-white/10 text-xs font-medium">{category}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {getRelativeTimeString(article.publishedToBlogAt || article.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {new Date(article.createdAt).toLocaleString()}
                    </td>
                  </tr>
                )
              })}
              {recentArticles.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    No articles generated yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
