import React from 'react';
import { cardLinkProps } from '../FeaturedCard';
import type { FeedItem } from '@/lib/feed';

/**
 * The strip under the masthead: the newest few headlines on one scrollable
 * line. Static, not an animated marquee - motion that never stops is an
 * accessibility problem, and a scrollable row reads the same at a glance.
 */
export function BreakingTicker({ items }: { items: FeedItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Latest headlines" className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <span className="shrink-0 bg-teal-500 px-2 py-1 font-display text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-black">
          Latest
        </span>
        <ul className="flex min-w-0 flex-1 gap-6 overflow-x-auto py-2 scrollbar-hide">
          {items.map((item, i) => (
            <li key={item.id} className="shrink-0">
              <a
                {...cardLinkProps(item.props, { event: 'ticker_select', surface: 'ticker', position: i + 1 })}
                className="inline-flex min-h-11 max-w-[22rem] items-center truncate text-sm text-gray-800 hover:text-teal-700 dark:text-gray-200 dark:hover:text-teal-400"
              >
                <span className="truncate">{item.props.title}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
