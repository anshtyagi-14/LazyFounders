import React from 'react';
import type { ArticleProps } from './FeaturedCard';
import { SafeImage } from './SafeImage';

export function ArticleCard({ article }: { article: ArticleProps }) {
  return (
    <a
      className="group bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-800 block flex flex-col h-full"
      href={article.url}
    >
      <div className="relative h-48 overflow-hidden bg-gray-200 dark:bg-gray-800 shrink-0">
        <SafeImage
          src={article.imageUrl || '/placeholder.jpg'}
          alt={article.title}
          className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
        />
        <div className="absolute top-4 left-4">
          <div className="flex items-center space-x-1 bg-white dark:bg-gray-900 px-3 py-1 rounded-full text-xs font-medium shadow-lg">
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
              className="lucide lucide-hash w-3.5 h-3.5 text-teal-500"
            >
              <line x1="4" x2="20" y1="9" y2="9"></line>
              <line x1="4" x2="20" y1="15" y2="15"></line>
              <line x1="10" x2="8" y1="3" y2="21"></line>
              <line x1="16" x2="14" y1="3" y2="21"></line>
            </svg>
            <span className="text-gray-800 dark:text-gray-200">
              {article.category || 'Tech'}
            </span>
          </div>
        </div>
      </div>
      <div className="p-6 flex flex-col flex-1">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 line-clamp-2 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
          {article.title}
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4 line-clamp-2 text-sm leading-relaxed flex-1">
          {article.description || article.title}
        </p>
        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-950/50 flex items-center justify-center text-teal-700 dark:text-teal-300 text-xs font-bold shrink-0">
              {article.authorInitials || 'AN'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {article.authorName || 'Anonymous'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                {article.publishedDate}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-500 shrink-0">
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
              className="lucide lucide-clock w-4 h-4"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span className="text-sm">{article.readTime} min</span>
          </div>
        </div>
      </div>
    </a>
  );
}
