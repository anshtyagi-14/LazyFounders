import React from "react";
import Link from "next/link";
// Published stories are edited rarely; /api/revalidate covers the edits.
export const revalidate = 300;
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { SafeImage } from "../../../../components/SafeImage";
import { BrandBadge } from "../../../../components/BrandBadge";
import { SourcesSection } from "../../../../components/SourcesSection";
import { PoweredByBlogy } from "../../../../components/PoweredByBlogy";
import { JsonLd } from "../../../../components/JsonLd";
import { Breadcrumbs } from "../../../../components/Breadcrumbs";
import { ArticleTracker } from "../../../../components/ArticleTracker";
import { ShareBar } from "../../../../components/ShareBar";
import { EmailCapture } from "../../../../components/EmailCapture";
import { cardLinkProps } from "../../../../components/FeaturedCard";
import { BRAND, SITE_URL, getPublishedArticle, slugifyCategory, type PublicArticle } from "@/lib/articles";
import { listCategoryFeed } from "@/lib/feed";
import { categoryForArticle, type SiteCategory } from "@/lib/topics";
import { resolveImage, type ResolvedImage } from "@/lib/images";
import { gaAttrs } from "@/lib/ga-attrs";
import {
  ORGANIZATION_ID,
  SITE_LANG,
  WEBSITE_ID,
  breadcrumbSchema,
  clamp,
  extractFaq,
  faqSchema,
  pageMetadata,
  stripMarkdown,
  wordCount,
  type Crumb,
} from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

/**
 * No pages at build time (the image is built without database access), but an
 * empty list still opts the route into ISR: each story renders on its first
 * request and is then served from cache until the revalidate window passes.
 */
export async function generateStaticParams() {
  return [];
}

// Raw HTML is only used for the three styled summary boxes injected below; everything
// else from the model is sanitised (no scripts, handlers, iframes or unsafe URLs).
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    div: [...(defaultSchema.attributes?.div ?? []), ["className", "summary-box", "table-of-contents", "key-highlights"]],
  },
};

/** One image for the hero, og:image, twitter:image and NewsArticle.image. */
function articleImage(article: PublicArticle): ResolvedImage {
  return resolveImage(
    [
      { url: article.featuredImage?.url, credit: article.featuredImage?.credit ?? article.featuredImage?.publisher, creditUrl: article.featuredImage?.sourceUrl },
      { url: article.sourceImage?.url, credit: article.sourceImage?.credit ?? article.sourceImage?.publisher, creditUrl: article.sourceImage?.sourceUrl },
    ],
    article.headline,
  );
}

/**
 * "Modified" only when the story actually changed after it went out. The first
 * published version is usually created moments before publishing, so anything
 * within an hour is the original, not an update.
 */
function modifiedAt(article: PublicArticle): Date | null {
  return article.updatedAt.getTime() - article.publishedAt.getTime() > 60 * 60 * 1000 ? article.updatedAt : null;
}

function crumbsFor(article: PublicArticle, category: SiteCategory): Crumb[] {
  return [
    { name: "Home", path: "/" },
    { name: category.label, path: `/news/category/${category.slug}` },
    { name: clamp(article.headline, 110), path: `/news/article/${article.slug}` },
  ];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticle(decodeURIComponent(slug));
  if (!article) return { title: "Story not found", robots: { index: false, follow: false } };
  const image = articleImage(article);
  const modified = modifiedAt(article);
  return pageMetadata({
    title: article.seoTitle,
    description: article.metaDescription,
    path: `/news/article/${article.slug}`,
    image: image.url,
    imageWidth: image.width,
    imageHeight: image.height,
    imageAlt: article.headline,
    type: "article",
    keywords: [...article.tags, ...article.companies],
    publishedTime: article.publishedAt.toISOString(),
    modifiedTime: modified?.toISOString(),
    section: categoryForArticle(article.category).label,
  });
}

function jsonLd(article: PublicArticle, category: SiteCategory, image: ResolvedImage) {
  const url = `${SITE_URL}/news/article/${article.slug}`;
  const body = stripMarkdown(article.bodyMarkdown.split(/\n## Sources\n/)[0]);
  const faqs = extractFaq(article.bodyMarkdown);
  const modified = modifiedAt(article) ?? article.publishedAt;

  const newsArticle = {
    "@type": "NewsArticle",
    "@id": `${url}#article`,
    headline: clamp(article.headline, 110),
    alternativeHeadline: article.seoTitle !== article.headline ? clamp(article.seoTitle, 110) : undefined,
    description: article.metaDescription,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    datePublished: article.publishedAt.toISOString(),
    // Google wants dateModified on every NewsArticle; with no real update it equals datePublished.
    dateModified: modified.toISOString(),
    inLanguage: SITE_LANG,
    articleSection: category.label,
    keywords: [...article.tags, ...article.companies].join(", "),
    wordCount: wordCount(article.bodyMarkdown),
    timeRequired: `PT${article.readTime}M`,
    isAccessibleForFree: true,
    articleBody: clamp(body, 5000),
    image: [
      {
        "@type": "ImageObject",
        url: image.url,
        ...(image.width && image.height ? { width: image.width, height: image.height } : {}),
        ...(image.isFallback ? {} : { caption: article.headline }),
        ...(image.credit ? { creditText: image.credit } : {}),
      },
    ],
    author: { "@id": ORGANIZATION_ID },
    publisher: { "@id": ORGANIZATION_ID },
    isPartOf: { "@id": WEBSITE_ID },
    about: article.companies.map((name) => ({ "@type": "Organization", name })),
    mentions: article.tags.map((name) => ({ "@type": "Thing", name })),
    // Attribution: every source this story is based on.
    isBasedOn: article.citations.map((c) => c.url),
    citation: article.citations.map((c) => ({
      "@type": "NewsArticle",
      url: c.url,
      headline: c.title ?? undefined,
      inLanguage: c.language ?? undefined,
      datePublished: c.publishedAt?.toISOString(),
      publisher: { "@type": "Organization", name: c.publisher },
    })),
  };

  // Organization and WebSite come from the root layout; this graph links to them by @id.
  return {
    "@context": "https://schema.org",
    "@graph": [
      newsArticle,
      breadcrumbSchema(crumbsFor(article, category)),
      // Only emitted when the story actually contains question-shaped sections, which render visibly.
      ...(faqs.length ? [{ ...faqSchema(faqs), "@id": `${url}#faq` }] : []),
    ],
  };
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** Prepare stored markdown for rendering (legacy cleanup + styled summary boxes). */
function prepareBody(markdown: string): string {
  let body = markdown
    // Sources are rendered by <SourcesSection/> from structured citations.
    .split(/\n## Sources\n/)[0]
    .replace(/\*\*Featured Image:?\*\*:?\s*/gi, "")
    .replace(/Featured Image:\s*/gi, "")
    .replace(/!\[[^\]]*\]\(placeholder[^)]*\)/gi, "")
    .replace(/^\s*\n/gm, "\n");
  body = body.replace(/###\s+30 SEC SUMMARY\s*\n([\s\S]*?)(?=\n### |\n## |$)/i, '<div class="summary-box"><h3>30 SEC SUMMARY</h3>\n\n$1\n</div>\n\n');
  body = body.replace(/###\s+TABLE OF CONTENTS\s*\n([\s\S]*?)(?=\n### |\n## |$)/i, '<div class="table-of-contents"><h3>TABLE OF CONTENTS</h3>\n\n$1\n</div>\n\n');
  body = body.replace(/###\s+KEY HIGHLIGHTS\s*\n([\s\S]*?)(?=\n### |\n## |$)/i, '<div class="key-highlights"><h3>KEY HIGHLIGHTS</h3>\n\n$1\n</div>\n\n');
  return body;
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getPublishedArticle(decodeURIComponent(slug));
  if (!article) notFound();

  const category = categoryForArticle(article.category);
  const image = articleImage(article);
  const modified = modifiedAt(article);
  const related = await listCategoryFeed(category.slug, { perPage: 4, excludeId: article.id }).catch(() => ({ items: [], total: 0 }));
  const authorInitials = BRAND.slice(0, 2).toUpperCase();
  const canonical = `${SITE_URL}/news/article/${article.slug}`;
  const sourceCount = article.citations.length;

  return (
    <div className="App min-h-screen flex flex-col bg-white dark:bg-[#05070A]">
      <JsonLd data={jsonLd(article, category, image)} />
      <ArticleTracker id={article.id} category={category.label} origin="synthesis" />
      <main className="text-slate-900 dark:text-white min-h-screen flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <Breadcrumbs crumbs={crumbsFor(article, category)} className="mb-8" />

          <div className="flex flex-col lg:flex-row gap-10 lg:gap-14">
            <article className="min-w-0 flex-1 lg:max-w-190">
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <Link
                  href={`/news/category/${category.slug}`}
                  {...gaAttrs("category_select", { category: category.label, source_surface: "article_kicker" })}
                  className="inline-flex min-h-8 items-center gap-1.5 bg-teal-500/10 text-teal-800 border border-teal-500/30 dark:bg-teal-500/15 dark:text-teal-400 dark:border-teal-500/35 px-3 py-1.5 rounded-full text-xs font-semibold"
                >
                  {category.label}
                </Link>
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-white leading-[1.1] tracking-tight mb-6">{article.headline}</h1>

              <p className="article-summary text-lg sm:text-xl text-slate-600 dark:text-slate-400 leading-relaxed mb-8">{article.isLegacy ? article.metaDescription : article.intro}</p>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 mb-6 border-b border-slate-200 dark:border-white/10">
                <div className="flex items-center gap-3">
                  <div
                    aria-hidden="true"
                    className="rounded-full overflow-hidden bg-teal-100 dark:bg-teal-950/50 ring-2 ring-slate-200 dark:ring-white/10 shrink-0 flex items-center justify-center font-bold text-teal-700 dark:text-teal-400"
                    style={{ width: 48, height: 48 }}
                  >
                    {authorInitials}
                  </div>
                  <p className="font-bold text-slate-900 dark:text-white leading-tight text-base">{BRAND}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                  <span>
                    Published <time dateTime={article.publishedAt.toISOString()}>{formatDate(article.publishedAt)}</time>
                  </span>
                  {modified ? (
                    <>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                      <span>
                        Updated <time dateTime={modified.toISOString()}>{formatDate(modified)}</time>
                      </span>
                    </>
                  ) : null}
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                  <span>{article.readTime} min read</span>
                </div>
              </div>

              <aside
                aria-label="How this story was produced"
                className="mb-8 border-l-2 border-teal-500 bg-teal-500/5 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300"
              >
                <strong className="font-semibold text-slate-900 dark:text-white">AI-assisted story.</strong>{" "}
                This article was drafted with AI from the {sourceCount > 1 ? `${sourceCount} sources` : "source"} cited below and checked by
                automated validation before publication.{" "}
                <Link href="/ai-policy" className="font-medium text-teal-800 underline dark:text-teal-400">
                  How we use AI
                </Link>
                {" · "}
                <Link href="/corrections" className="font-medium text-teal-800 underline dark:text-teal-400">
                  Report an error
                </Link>
              </aside>

              <figure className="rounded-2xl overflow-hidden mb-10 bg-slate-100 ring-1 ring-slate-200 dark:bg-[#121820] dark:ring-white/10">
                <div className="aspect-video relative">
                  <SafeImage
                    src={image.displayUrl}
                    alt={image.isFallback ? "" : article.headline}
                    width={image.width ?? 1200}
                    height={image.height ?? 675}
                    priority
                    className="w-full h-full object-cover"
                  />
                  <BrandBadge size="md" />
                </div>
                {image.credit ? (
                  <figcaption className="px-4 py-2 text-xs text-slate-600 dark:text-slate-400">
                    Image: {image.credit}
                    {image.creditUrl ? (
                      <>
                        {" "}
                        via{" "}
                        <a
                          href={image.creditUrl}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          {...gaAttrs("source_select", { content_id: article.id, source_surface: "image_credit" })}
                          className="underline"
                        >
                          source
                        </a>
                      </>
                    ) : null}
                  </figcaption>
                ) : null}
              </figure>

              <div className="prose-custom max-w-none" data-article-body>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}>
                  {prepareBody(article.bodyMarkdown)}
                </ReactMarkdown>
              </div>

              <SourcesSection citations={article.citations} brand={BRAND} articleId={article.id} />

              <div className="mt-10 border-t border-slate-200 pt-6 dark:border-white/10">
                <ShareBar url={canonical} title={article.headline} id={article.id} />
              </div>

              <div className="mt-10">
                <EmailCapture location="article" />
              </div>

              <PoweredByBlogy />
            </article>

            <aside className="lg:w-85 lg:shrink-0 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto space-y-6 lg:pb-12">
              {related.items.length > 0 && (
                <section aria-labelledby="related-heading" className="rounded-2xl bg-white dark:bg-[#0d1117] ring-1 ring-slate-200 dark:ring-white/10 p-5">
                  <h2 id="related-heading" className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-4">
                    More in {category.label}
                  </h2>
                  <ul className="space-y-3.5">
                    {related.items.map((r, i) => (
                      <li key={r.id}>
                        <a
                          {...cardLinkProps(r.props, { event: "related_article_select", surface: "article_related", position: i + 1 })}
                          className="group flex gap-3 items-start"
                        >
                          <SafeImage
                            src={r.props.imageUrl || "/fallback.webp"}
                            alt=""
                            width={64}
                            height={64}
                            className="w-16 h-16 rounded-lg object-cover bg-slate-100 dark:bg-[#121820] shrink-0 ring-1 ring-slate-200 dark:ring-white/10"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
                              {r.props.title}
                            </span>
                            <span className="mt-1 block text-xs text-slate-600 dark:text-slate-500">
                              {r.isOwn ? `${r.props.readTime} min read` : r.props.authorName} · {r.props.publishedDate}
                            </span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/news/category/${category.slug}`}
                    {...gaAttrs("category_select", { category: category.label, source_surface: "article_related" })}
                    className="mt-4 inline-block text-xs font-semibold text-teal-800 hover:underline dark:text-teal-400"
                  >
                    All {category.label} stories →
                  </Link>
                </section>
              )}

              {article.companies.length > 0 && (
                <section aria-labelledby="companies-heading" className="rounded-2xl bg-white dark:bg-[#0d1117] ring-1 ring-slate-200 dark:ring-white/10 p-5">
                  <h2 id="companies-heading" className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-4">
                    Companies in this story
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {article.companies.slice(0, 10).map((c) => (
                      <Link
                        key={c}
                        href={`/company/${slugifyCategory(c)}`}
                        {...gaAttrs("company_select", { content_id: c, source_surface: "article_companies" })}
                        className="inline-flex min-h-8 items-center px-3 py-1.5 rounded-full bg-slate-100 dark:bg-[#121820] text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-teal-50 hover:text-teal-800 transition-colors"
                      >
                        {c}
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              <section className="rounded-2xl bg-linear-to-br from-teal-500 to-emerald-600 text-white p-6 relative overflow-hidden shadow-xl shadow-teal-500/20">
                <div className="relative z-10">
                  <span className="inline-block px-2 py-1 bg-white/20 rounded text-[10px] font-bold tracking-wider uppercase mb-3 backdrop-blur-md">Sponsor</span>
                  <p className="text-xl font-bold mb-2 leading-tight">Fire your SEO agency. Use Blogy instead.</p>
                  <p className="text-teal-50 text-sm mb-5 leading-relaxed">Automate your content creation and SEO growth with AI-powered programmatic SEO tailored for SaaS startups.</p>
                  <a href="https://blogy.in" target="_blank" rel="noreferrer sponsored" className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-white text-teal-700 rounded-lg font-semibold text-sm hover:bg-teal-50 transition-colors">
                    Start Free Trial
                  </a>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
