import React from 'react';
import { cardLinkProps } from '../FeaturedCard';
import { SafeImage } from '../SafeImage';
import type { FeedItem } from '@/lib/feed';

/**
 * A text-first row: the shape most of a news page is made of. Cards are reserved
 * for lead stories, because a page of equal-weight cards gives the reader no way
 * to tell what matters.
 */
export function StoryRow({ item, showThumb = false }: { item: FeedItem; showThumb?: boolean }) {
  const { props } = item;
  return (
    <a
      {...cardLinkProps(props)}
      className="group flex items-start gap-4 border-b border-white/8 py-4 last:border-b-0"
    >
      {showThumb ? (
        <div className="relative h-16 w-24 shrink-0 overflow-hidden bg-[#16161a]">
          <SafeImage
            src={item.hasImage ? props.imageUrl : undefined}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <h3 className="font-headline text-[1.05rem] leading-snug text-gray-100 transition-colors group-hover:text-teal-400">
          {props.title}
        </h3>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
          <span className="font-display font-semibold uppercase tracking-[0.1em] text-gray-400">{props.category}</span>
          <span aria-hidden="true" className="text-white/15">/</span>
          <span>{props.publishedDate}</span>
          {!item.isOwn ? (
            <>
              <span aria-hidden="true" className="text-white/15">/</span>
              <span>{props.authorName}</span>
            </>
          ) : null}
        </p>
      </div>
    </a>
  );
}
