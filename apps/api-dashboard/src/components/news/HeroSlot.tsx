import React from 'react';
import { TopPicks } from './TopPicks';
import type { FeedItem } from '@/lib/feed';

/**
 * The homepage hero.
 *
 * TODO(hero): the final hero design is still to come. Until it lands this slot
 * shows Top Picks (a large lead story plus the day's other beats), which keeps
 * the page's LCP image and layout stable. Replace the body of this component,
 * not its position on the page, and keep exactly one `priority` image in it.
 */
export function HeroSlot({ items }: { items: FeedItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="hero-heading" className="py-10" data-hero-slot>
      <h2 id="hero-heading" className="sr-only">
        Top stories
      </h2>
      <TopPicks items={items} />
    </section>
  );
}
