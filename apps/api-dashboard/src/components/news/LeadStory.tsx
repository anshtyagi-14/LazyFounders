import React from 'react';
import { cardLinkProps } from '../FeaturedCard';
import { SafeImage } from '../SafeImage';
import type { FeedItem } from '@/lib/feed';

/**
 * The lead: image above, headline below, no scrim and no text sitting on the
 * picture. It is the one place a story gets a large serif headline, which is what
 * marks it as the most important thing in its block.
 */
export function LeadStory({ item, size = 'md' }: { item: FeedItem; size?: 'md' | 'lg' }) {
  const { props } = item;
  const headline = size === 'lg' ? 'text-2xl sm:text-3xl lg:text-4xl' : 'text-xl sm:text-2xl';
  const frame = size === 'lg' ? 'aspect-[16/9]' : 'aspect-[3/2]';

  return (
    <a {...cardLinkProps(props)} className="group block">
      <div className={'relative overflow-hidden bg-[#16161a] ' + frame}>
        <SafeImage
          src={item.hasImage ? props.imageUrl : undefined}
          alt=""
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
      </div>
      <p className="mt-4 font-display text-[0.68rem] font-bold uppercase tracking-[0.14em] text-teal-500">
        {props.category}
      </p>
      <h3 className={'mt-2 font-headline leading-[1.15] text-white transition-colors group-hover:text-teal-300 ' + headline}>
        {props.title}
      </h3>
      {props.description ? (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-400">{props.description}</p>
      ) : null}
      <p className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
        <span>{props.publishedDate}</span>
        <span aria-hidden="true" className="text-white/15">/</span>
        <span>{item.isOwn ? props.readTime + ' min read' : props.authorName}</span>
      </p>
    </a>
  );
}
