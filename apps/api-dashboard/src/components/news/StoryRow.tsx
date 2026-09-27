import React from 'react';
import { cardLinkProps, type CardContext } from '../FeaturedCard';
import { SafeImage } from '../SafeImage';
import type { FeedItem } from '@/lib/feed';

/**
 * A text-first row: the shape most of a news page is made of. Cards are reserved
 * for lead stories, because a page of equal-weight cards gives the reader no way
 * to tell what matters.
 */
export function StoryRow({ item, showThumb = false, context }: { item: FeedItem; showThumb?: boolean; context?: CardContext }) {
  const { props } = item;
  return (
    <a
      {...cardLinkProps(props, context)}
      className="group flex items-start gap-4 border-b border-black/10 py-4 last:border-b-0 dark:border-white/8"
    >
      {showThumb ? (
        <div className="relative h-16 w-24 shrink-0 overflow-hidden bg-gray-100 dark:bg-[#16161a]">
          <SafeImage
            src={props.imageUrl}
            alt=""
            width={96}
            height={64}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <h3 className="font-headline text-[1.05rem] leading-snug text-gray-900 transition-colors group-hover:text-teal-700 dark:text-gray-100 dark:group-hover:text-teal-400">
          {props.title}
        </h3>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-600 dark:text-gray-400">
          <span className="font-display font-semibold uppercase tracking-[0.1em] text-gray-600 dark:text-gray-400">{props.category}</span>
          <span aria-hidden="true" className="text-black/20 dark:text-white/15">/</span>
          <span>{props.publishedDate}</span>
          {!item.isOwn ? (
            <>
              <span aria-hidden="true" className="text-black/20 dark:text-white/15">/</span>
              <span>{props.authorName}</span>
            </>
          ) : null}
        </p>
      </div>
    </a>
  );
}
