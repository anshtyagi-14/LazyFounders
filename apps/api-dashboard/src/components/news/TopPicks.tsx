import React from 'react';
import { LeadStory } from './LeadStory';
import { StoryRow } from './StoryRow';
import type { FeedItem } from '@/lib/feed';

/**
 * The opening block: one large lead and the rest of the day's beats beside it.
 *
 * It is called Top Picks, not Trending. There is no featured flag and no view
 * counter in the schema, so these are the newest story from each of the busiest
 * beats - the day's spread - and the label says only what is true.
 */
export function TopPicks({ items }: { items: FeedItem[] }) {
  if (items.length === 0) return null;
  const [lead, ...rest] = items;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.55fr_1fr] lg:gap-14">
      <LeadStory item={lead} size="lg" priority context={{ surface: 'top_picks', position: 1 }} />
      {rest.length > 0 ? (
        <div className="border-t border-black/10 dark:border-white/10 lg:border-t-0">
          {rest.map((item, i) => (
            <StoryRow key={item.id} item={item} showThumb context={{ surface: 'top_picks', position: i + 2 }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
