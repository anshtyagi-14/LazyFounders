import React from 'react';
import { SafeImage } from './SafeImage';

export interface ArticleProps {
  url: string;
  imageUrl?: string;
  category: string;
  title: string;
  authorInitials: string;
  authorName: string;
  readTime: string | number;
  publishedDate: string;
  description?: string;
}

export function FeaturedCard({ article }: { article: ArticleProps }) {
  return (
    <a
      className="group relative overflow-hidden rounded-2xl block h-[380px] sm:h-[420px] lg:h-[460px]"
      href={article.url}
    >
      <SafeImage
        src={article.imageUrl || '/placeholder.jpg'}
        alt={article.title}
        className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
      />
      <div className="absolute top-4 left-4 z-10">
        <span className="inline-flex items-center bg-teal-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-lg">
          {article.category || 'Tech'}
        </span>
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 right-0 p-5 z-10">
        <h3 className="text-lg sm:text-xl font-bold text-white mb-3 leading-snug line-clamp-3">
          {article.title}
        </h3>
        <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-300">
          <div className="w-9 h-9 rounded-full bg-teal-500 flex items-center justify-center text-white font-bold text-xs shrink-0">
            {article.authorInitials || 'AN'}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-white truncate">{article.authorName || 'Anonymous'}</p>
            <p className="text-gray-400">
              {article.readTime} min read &middot; {article.publishedDate}
            </p>
          </div>
        </div>
      </div>
    </a>
  );
}
