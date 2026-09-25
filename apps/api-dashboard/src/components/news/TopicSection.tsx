import React from 'react';
import { SectionHeading } from './SectionHeading';
import { LeadStory } from './LeadStory';
import { StoryRow } from './StoryRow';
import type { ResolvedSection } from '@/lib/feed';

/**
 * One beat. Two shapes: a lead plus a column of rows for the busy topics, and a
 * plain row list for the thinner ones. A section with no stories never reaches
 * here - `resolveSections` drops it - so there is no empty state to render.
 */
export function TopicSection({ section }: { section: ResolvedSection }) {
  const { items, layout, label, blurb, slug } = section;
  const href = '/news/category/' + slug;

  if (layout === 'lead-and-list' && items.length > 1) {
    const [lead, ...rest] = items;
    return (
      <section className="py-10">
        <SectionHeading label={label} blurb={blurb} href={href} />
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <LeadStory item={lead} context={{ surface: `section_${slug}`, position: 1 }} />
          <div className="border-t border-black/10 dark:border-white/8 lg:border-t-0">
            {rest.map((item, i) => (
              <StoryRow key={item.id} item={item} showThumb context={{ surface: `section_${slug}`, position: i + 2 }} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-10">
      <SectionHeading label={label} blurb={blurb} href={href} />
      <div className="grid gap-x-10 sm:grid-cols-2">
        {items.map((item, i) => (
          <StoryRow key={item.id} item={item} showThumb context={{ surface: `section_${slug}`, position: i + 1 }} />
        ))}
      </div>
    </section>
  );
}
