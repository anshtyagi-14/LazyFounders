import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { articlePath, getPublishedArticle, getSourceStory, movedArticleSlug, type PublicArticle, type SourceStoryResult } from "@/lib/articles";
import { ArticleView, articleMetadata } from "./article-view";
import { SourceView, sourceMetadata } from "./source-view";

// Published stories are edited rarely; /api/revalidate covers the edits.
export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

/**
 * No pages at build time (the image is built without database access), but an
 * empty list still opts the route into ISR: each story renders on its first
 * request and is then served from cache until the revalidate window passes.
 */
export async function generateStaticParams() {
  return [];
}

type Resolved = { kind: "article"; article: PublicArticle } | SourceStoryResult;

/**
 * One URL space for every story. Our own articles win, then an article's old slug
 * (301 to the current one), then syndicated stories (old id-suffixed URLs 301 too).
 */
async function resolve(param: string): Promise<Resolved> {
  const slug = decodeURIComponent(param);
  const article = await getPublishedArticle(slug);
  if (article) return { kind: "article", article };
  const moved = await movedArticleSlug(slug);
  if (moved) return { kind: "moved", path: articlePath(moved) };
  return getSourceStory(slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await resolve((await params).slug);
  if (result?.kind === "article") return articleMetadata(result.article);
  if (result?.kind === "story") return sourceMetadata(result.story);
  return { title: "Story not found", robots: { index: false, follow: false } };
}

export default async function StoryPage({ params }: Props) {
  const result = await resolve((await params).slug);
  if (!result) notFound();
  if (result.kind === "published") permanentRedirect(articlePath(result.slug));
  if (result.kind === "moved") permanentRedirect(result.path);
  if (result.kind === "article") return <ArticleView article={result.article} />;
  return <SourceView story={result.story} />;
}
