import React from 'react';
import { cardLinkProps, type CardContext } from '../FeaturedCard';
import type { FeedItem } from '@/lib/feed';

/**
 * The wire, as a ledger.
 *
 * This block is time-ordered and nothing else, so the timestamp leads each row -
 * the one place on the page where order genuinely carries information the reader
 * needs. That is why it is not another card grid.
 */
export function JustInLedger({ items, surface = 'just_in', event }: { items: FeedItem[]; surface?: string; event?: CardContext['event'] }) {
  return (
    <ol className="border-t border-black/10 dark:border-white/10">
      {items.map((item, i) => {
        const time = item.publishedAt.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Asia/Kolkata',
        });
        return (
          <li key={item.id} className="border-b border-black/10 dark:border-white/8">
            <a
              {...cardLinkProps(item.props, { surface, position: i + 1, event })}
              className="group flex flex-col gap-1 py-3.5 sm:flex-row sm:items-baseline sm:gap-5"
            >
              <time className="shrink-0 font-display text-xs font-bold tabular-nums tracking-[0.08em] text-teal-700 dark:text-teal-500">
                {time}
              </time>
              <h3 className="flex-1 font-headline text-[1.02rem] leading-snug text-gray-900 transition-colors group-hover:text-teal-700 dark:text-gray-100 dark:group-hover:text-teal-400">
                {item.props.title}
              </h3>
              <span className="shrink-0 font-display text-[0.65rem] font-bold uppercase tracking-[0.12em] text-gray-600 dark:text-gray-400">
                {item.props.category}
              </span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}
