import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { SafeImage } from "@/components/SafeImage";
import { withContactStrip } from "@/components/ContactStrip";
import { PoweredByBlogy } from "@/components/PoweredByBlogy";
import { articlePath, listPublishedArticles, sourceStoryPath, type SourceStory } from "@/lib/articles";
import { COVER_HEIGHT, COVER_WIDTH, coverPath, coverPathForStoryUrl } from "@/lib/covers";
import { currentStoryImageMode } from "@/lib/site-settings";
import { authorInitials, authorPath } from "@/lib/authors";
import { BRAND, pageMetadata } from "@/lib/seo";

/** Metadata for a syndicated story, served at /news/<slug> (see page.tsx). */
export function sourceMetadata(story: SourceStory): Metadata {
  const path = sourceStoryPath(story.id, story.headline);
  return pageMetadata({
    title: story.headline,
    description: story.excerpt,
    path,
    // Our cover card, or in "publisher" mode the publisher's photo (sizes unknown).
    ...(currentStoryImageMode() === "covers"
      ? { image: coverPathForStoryUrl(path, "social"), imageWidth: COVER_WIDTH, imageHeight: COVER_HEIGHT }
      : { image: story.publisherImageUrl ?? undefined }),
    imageAlt: story.headline,
    type: "article",
    publishedTime: story.publishedAt.toISOString(),
    // The original publisher owns this story: point search engines at their page, and
    // keep our copy out of the index so it can never compete with theirs.
    canonical: story.sourceUrl,
    index: false,
  });
}

export async function SourceView({ story }: { story: SourceStory }) {
  const covers = currentStoryImageMode() === "covers";
  const latest = await listPublishedArticles({ take: 4 });
  const publishedDate = story.publishedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const sourceHost = new URL(story.sourceUrl).hostname.replace(/^www\./, "");
  const [lead, ...rest] = story.paragraphs;
  const intro = story.subheadline || lead;
  const body = story.subheadline ? story.paragraphs : rest;

  return (
    <div className="App min-h-screen flex flex-col bg-white dark:bg-[#05070A]">
      <main className="text-slate-900 dark:text-white min-h-screen flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <Link className="inline-flex items-center gap-2 text-teal-600 dark:text-teal-400 text-sm font-medium mb-8 hover:text-teal-500 dark:hover:text-teal-300 transition-colors" href="/">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-left w-4 h-4">
              <path d="m12 19-7-7 7-7"></path>
              <path d="M19 12H5"></path>
            </svg>
            Back to all stories
          </Link>

          <div className="flex flex-col lg:flex-row gap-10 lg:gap-14">
            <article className="min-w-0 flex-1 lg:max-w-190">
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <span className="inline-flex items-center gap-1.5 bg-teal-500/10 text-teal-700 border border-teal-500/30 dark:bg-teal-500/15 dark:text-teal-400 dark:border-teal-500/35 px-3 py-1.5 rounded-full text-xs font-semibold">
                  {story.publisher}
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-white leading-[1.1] tracking-tight mb-6">{story.headline}</h1>

              {intro ? <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 leading-relaxed mb-8">{intro}</p> : null}

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 mb-8 border-b border-slate-200 dark:border-white/10">
                <div className="flex items-center gap-3">
                  <div
                    className="rounded-full overflow-hidden bg-teal-100 dark:bg-teal-950/50 ring-2 ring-slate-200 dark:ring-white/10 shrink-0 flex items-center justify-center font-bold text-teal-600 dark:text-teal-400"
                    style={{ width: 48, height: 48 }}
                  >
                    {story.editor ? authorInitials(story.editor.name) : BRAND.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    {/* Our editor curated this; the words are the publisher's, credited below. */}
                    <p className="font-bold text-slate-900 dark:text-white leading-tight text-base">
                      {story.editor ? (
                        <>Curated by <Link href={authorPath(story.editor.slug)} className="hover:underline">{story.editor.name}</Link></>
                      ) : (
                        <>Curated by {BRAND}</>
                      )}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Via {story.publisher}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <time dateTime={story.publishedAt.toISOString()}>{publishedDate}</time>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span>{story.readTime} min read</span>
                </div>
              </div>

              {covers ? (
                <figure className="rounded-2xl overflow-hidden mb-10 bg-slate-100 ring-1 ring-slate-200 dark:bg-[#121820] dark:ring-white/10">
                  <div className="aspect-[40/21] relative">
                    {/* Decorative: the headline is the H1 right above it. */}
                    <SafeImage src={story.imageUrl} alt="" width={COVER_WIDTH} height={COVER_HEIGHT} className="w-full h-full object-cover" />
                  </div>
                </figure>
              ) : story.publisherImageUrl ? (
                <figure className="rounded-2xl overflow-hidden mb-10 bg-slate-100 ring-1 ring-slate-200 dark:bg-[#121820] dark:ring-white/10">
                  <div className="aspect-video relative">
                    <SafeImage src={story.publisherImageUrl} alt={story.headline} className="w-full h-full object-cover" />
                  </div>
                  <figcaption className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">Image: {story.imageCredit ?? story.publisher}</figcaption>
                </figure>
              ) : null}

              <div className="prose-custom max-w-none">
                {withContactStrip(
                  body.map((p, i) => <p key={i}>{p}</p>),
                  "source_story",
                  "my-8",
                )}
              </div>

              <section className="content-courtesy mt-12 rounded-2xl bg-slate-50 dark:bg-[#0d1117] ring-1 ring-slate-200 dark:ring-white/10 p-5" aria-labelledby="courtesy-heading">
                <h2 id="courtesy-heading" className="text-xs uppercase tracking-[0.15em] text-teal-600 dark:text-teal-400 font-bold mb-3">
                  Courtesy
                </h2>
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">
                  This story was originally published by <span className="font-semibold text-slate-900 dark:text-white">{story.publisher}</span>. All rights belong to the original publisher.
                </p>
                <a
                  href={story.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="courtesy-link inline-flex items-center gap-1.5 text-sm font-semibold text-teal-600 dark:text-teal-400 hover:underline break-all"
                >
                  Read the original on {sourceHost} ↗
                </a>
              </section>

              <PoweredByBlogy />
            </article>

            <aside className="lg:w-85 lg:shrink-0 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto space-y-6 lg:pb-12">
              {latest.length > 0 && (
                <section className="rounded-2xl bg-white dark:bg-[#0d1117] ring-1 ring-slate-200 dark:ring-white/10 p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">Latest News</p>
                  <div className="space-y-3.5">
                    {latest.map((l) => (
                      <Link key={l.id} href={articlePath(l.slug)} className="group flex gap-3 items-start">
                        <SafeImage
                          src={covers ? coverPath(l.slug, "art") : l.featuredImage?.url || "/fallback.webp"}
                          alt=""
                          className="w-16 h-16 rounded-lg object-cover bg-slate-100 dark:bg-[#121820] shrink-0 ring-1 ring-slate-200 dark:ring-white/10"
                          loading="lazy"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{l.headline}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{l.readTime} min read</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
