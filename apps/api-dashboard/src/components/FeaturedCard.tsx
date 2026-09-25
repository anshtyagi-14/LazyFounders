import React from "react";
import { SafeImage } from "./SafeImage";
import { BrandBadge } from "./BrandBadge";
import { gaAttrs, publishAgeBucket, type ArticleOrigin } from "@/lib/ga-attrs";

export interface ArticleProps {
  url: string;
  imageUrl?: string;
  category: string;
  title: string;
  authorInitials: string;
  authorName: string;
  readTime: string | number;
  publishedDate: string;
  description?: string;
  /** Headline card that links out to the original publisher (opens in a new tab). */
  external?: boolean;
  /** Analytics: story id, how it was produced, and when (for the freshness bucket). */
  id?: string;
  origin?: ArticleOrigin;
  publishedAt?: string;
}

/** Where on the page a card sits, for select_content reporting. */
export interface CardContext {
  surface?: string;
  position?: number;
  /** Override the event (e.g. related_article_select). */
  event?: string;
}

/** Link attributes for cards: external headline cards open the publisher in a new tab. */
export function cardLinkProps(article: ArticleProps, ctx: CardContext = {}) {
  const ga = gaAttrs(ctx.event ?? "select_content", {
    content_type: "article",
    content_id: article.id,
    category: article.category,
    article_origin: article.origin,
    source_surface: ctx.surface,
    position: ctx.position,
    publish_age_bucket: publishAgeBucket(article.publishedAt),
  });
  if (article.external) {
    return {
      href: article.url,
      target: "_blank",
      rel: "noopener noreferrer nofollow",
      ...ga,
    };
  }
  // Source-story pages are noindex and Disallowed in robots.txt (they carry a
  // cross-domain canonical to the publisher). Following them from the home page
  // spends crawl budget on URLs the crawler is then told to drop.
  if (article.url.startsWith("/news/source/")) {
    return { href: article.url, rel: "nofollow", ...ga };
  }
  return { href: article.url, ...ga };
}

export function FeaturedCard({ article, context }: { article: ArticleProps; context?: CardContext }) {
  return (
    <a
      className="group relative overflow-hidden rounded-2xl block h-[380px] sm:h-[420px] lg:h-[460px]"
      {...cardLinkProps(article, context)}
    >
      <SafeImage
        src={article.imageUrl || "/fallback.webp"}
        alt={article.title}
        className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
      />
      <BrandBadge position="top-right" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 right-0 p-5 z-10">
        <h3 className="text-lg sm:text-xl font-bold text-white mb-3 leading-snug line-clamp-3">
          {article.title}
        </h3>
        <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-300">
          <div className="w-9 h-9 rounded-full bg-teal-500 flex items-center justify-center text-white font-bold text-xs shrink-0">
            {article.authorInitials || "AN"}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-white truncate">
              {article.authorName || "Anonymous"}
            </p>
            <p className="text-gray-400">
              {article.external
                ? "Read at source ↗"
                : `${article.readTime} min read`}{" "}
              &middot; {article.publishedDate}
            </p>
          </div>
        </div>
      </div>
    </a>
  );
}
