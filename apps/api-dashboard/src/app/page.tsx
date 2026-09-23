import React from "react";
export const dynamic = 'force-dynamic';
import type { Metadata } from "next";
import { JsonLd } from "../components/JsonLd";
import { Dateline } from "../components/site/Dateline";
import { TopPicks } from "../components/news/TopPicks";
import { JustInLedger } from "../components/news/JustInLedger";
import { TopicSection } from "../components/news/TopicSection";
import { SectionHeading } from "../components/news/SectionHeading";
import { StoryRow } from "../components/news/StoryRow";
import { loadHomepageFeed, pickJustIn, pickTopStories, resolveSections } from "@/lib/feed";
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

export default async function NewsDashboard() {
  const feed = await loadHomepageFeed({ pool: 120 });

  // One shared ledger of what has already been shown, threaded through each
  // block in page order, so a story never appears twice down the page.
  const used = new Set<string>();
  const topPicks = pickTopStories(feed, used, 5);
  const justIn = pickJustIn(feed, used, 8);
  const sections = resolveSections(feed, used);
  const wire = feed.items.filter((i) => !i.isOwn && !used.has(i.id)).slice(0, 9);

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
    entries: ordered.slice(0, 40).map((i) => ({ path: i.props.url, name: i.props.title })),
  });

  return (
    <>
      <JsonLd data={schema} />
      <Dateline storyCount={feed.items.length} newest={newest} />

      <main className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center border border-dashed border-white/12 px-4 py-24 text-center">
            <h1 className="font-headline text-2xl text-white">Nothing on the wire yet</h1>
            <p className="mt-3 max-w-md text-sm text-gray-500">
              The newsroom pipeline publishes stories as it verifies them. Check back shortly.
            </p>
          </div>
        ) : (
          <>
            <section className="py-10">
              {/* The h1 is the section label: this page is the publication, and the
                  lead story is the headline - a marketing slogan here would push the
                  actual news below the fold. */}
              <SectionHeading label="Top picks" blurb={SITE_DESCRIPTION} />
              <TopPicks items={topPicks} />
            </section>

            {justIn.length > 0 ? (
              <section className="py-10">
                <SectionHeading
                  id="just-in"
                  label="Just in"
                  blurb="Everything that landed today, newest first."
                  href="/search"
                />
                <JustInLedger items={justIn} />
              </section>
            ) : null}

            {sections.map((section) => (
              <TopicSection key={section.slug} section={section} />
            ))}

            {wire.length > 0 ? (
              <section className="py-10">
                <SectionHeading
                  id="from-the-wire"
                  label="From the wire"
                  blurb="Headlines from our trusted sources, each linking back to the publisher."
                />
                <div className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
                  {wire.map((item) => (
                    <StoryRow key={item.id} item={item} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
