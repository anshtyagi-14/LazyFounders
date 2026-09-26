import React from "react";
/**
 * Rendered once per window and served from the ISR cache in between, instead of
 * rebuilt per request. Under force-dynamic every one of these answered
 * `Cache-Control: no-store`, so nothing - not the ALB, not a CDN, not a crawler -
 * could reuse a single response, and each hit re-queried Postgres.
 *
 * The publishing service still calls /api/revalidate on publish, so a new story
 * does not wait out the window. That hook lands on one ECS task, so the window
 * below is what the rest converge on.
 */
export const revalidate = 60;
import type { Metadata } from "next";
import { JsonLd } from "../components/JsonLd";
import { Dateline } from "../components/site/Dateline";
import { BreakingTicker } from "../components/news/BreakingTicker";
import { HeroSlot } from "../components/news/HeroSlot";
import { JustInLedger } from "../components/news/JustInLedger";
import { EmailCapture } from "../components/EmailCapture";
import { withContactStrip } from "../components/ContactStrip";
import { TopicSection } from "../components/news/TopicSection";
import { SectionHeading } from "../components/news/SectionHeading";
import { StoryRow } from "../components/news/StoryRow";
import { loadHomepageFeed, pickJustIn, pickTopStories, resolveSections, type HomepageFeed } from "@/lib/feed";
import { BRAND, SITE_DESCRIPTION, SITE_TAGLINE, collectionPageSchema, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({
    title: `${BRAND} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    path: "/",
  }),
  // The home page is the canonical root: keep the brand name unsuffixed.
  title: { absolute: `${BRAND} — ${SITE_TAGLINE}` },
};

const EMPTY_FEED: HomepageFeed = { items: [], byTopic: new Map(), topics: [] };

export default async function NewsDashboard() {
  // Enough to fill every block below without duplicates; the page renders
  // about 45 stories, so reading more is database work nobody sees.
  const feed = await loadHomepageFeed({ pool: 60 }).catch((err) => {
    // The Docker image is built without database access. Prerender an empty
    // shell then; ISR replaces it on the first request after deploy. At runtime
    // a database failure is a real error and goes to error.tsx.
    if (process.env.NEXT_PHASE === 'phase-production-build') return EMPTY_FEED;
    throw err;
  });

  // The ticker is the newest few, and deliberately not deduplicated against
  // the blocks below: it is a headline strip, not a section.
  const ticker = feed.items.slice(0, 6);

  // One shared ledger of what has already been shown, threaded through each
  // block in page order, so a story never appears twice down the page.
  const used = new Set<string>();
  const topPicks = pickTopStories(feed, used, 5);
  const justIn = pickJustIn(feed, used, 8);
  const sections = resolveSections(feed, used);
  const wire = feed.items.filter((i) => !i.isOwn && !used.has(i.id)).slice(0, 6);

  const isEmpty = feed.items.length === 0;
  const newest = feed.items[0]?.publishedAt ?? null;

  // AEO: tell answer engines exactly what this hub lists, in the order a reader
  // meets it, with a breadcrumb root.
  const ordered = [...topPicks, ...justIn, ...sections.flatMap((s) => s.items), ...wire];
  const schema = collectionPageSchema({
    path: "/",
    name: `${BRAND} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    crumbs: [{ name: "Home", path: "/" }],
    entries: ordered.slice(0, 20).map((i) => ({ path: i.props.url, name: i.props.title })),
  });

  return (
    <>
      <JsonLd data={schema} />
      <Dateline storyCount={feed.items.length} newest={newest} />
      <BreakingTicker items={ticker} />

      <main className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center border border-dashed border-black/15 px-4 py-24 text-center dark:border-white/12">
            <h1 className="font-headline text-2xl text-gray-950 dark:text-white">Nothing on the wire yet</h1>
            <p className="mt-3 max-w-md text-sm text-gray-500">
              The newsroom pipeline publishes stories as it verifies them. Check back shortly.
            </p>
          </div>
        ) : (
          <>
            {/* The document needs exactly one h1 and it has to be the publication
                itself, because every block below it is an h2. Held to a single
                compact line so the lead story still opens the page. */}
            <header className="border-b border-black/10 pb-6 pt-8 dark:border-white/8">
              <h1 className="font-headline text-lg leading-snug text-gray-950 sm:text-xl dark:text-white">
                {BRAND} — {SITE_TAGLINE}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-500">{SITE_DESCRIPTION}</p>
            </header>

            <HeroSlot items={topPicks} />

            {justIn.length > 0 ? (
              <section className="py-10">
                <SectionHeading
                  id="just-in"
                  label="Just in"
                  blurb="The latest stories, newest first."
                />
                <JustInLedger items={justIn} />
              </section>
            ) : null}

            {withContactStrip(
              sections.map((section) => <TopicSection key={section.slug} section={section} />),
              'home',
              'my-6',
            )}

            {wire.length > 0 ? (
              <section className="py-10">
                <SectionHeading
                  id="from-the-wire"
                  label="From the wire"
                  blurb="Headlines from our trusted sources, each linking back to the publisher."
                />
                <div className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
                  {wire.map((item, i) => (
                    <StoryRow key={item.id} item={item} context={{ surface: 'from_the_wire', position: i + 1 }} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}

        <div className="py-10">
          <EmailCapture location="homepage" />
        </div>
      </main>
    </>
  );
}
