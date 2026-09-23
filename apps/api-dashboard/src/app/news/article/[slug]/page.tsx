import React from "react";
import Link from "next/link";
export const dynamic = "force-dynamic";
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
import {
  BRAND,
  SITE_URL,
  getPublishedArticle,
  listCategories,
  listPublishedArticles,
  slugifyCategory,
  type PublicArticle,
} from "@/lib/articles";
import {
  ORGANIZATION_ID,
  SITE_LANG,
  WEBSITE_ID,
  breadcrumbSchema,
  clamp,
  extractFaq,
  faqSchema,
  ogImageUrl,
  pageMetadata,
  stripMarkdown,
  wordCount,
} from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

// Raw HTML is only used for the three styled summary boxes injected below; everything
// else from the model is sanitised (no scripts, handlers, iframes or unsafe URLs).
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    div: [...(defaultSchema.attributes?.div ?? []), ["className", "summary-box", "table-of-contents", "key-highlights"]],
  },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticle(decodeURIComponent(slug));
  if (!article) return { title: "Story not found", robots: { index: false, follow: false } };
  return pageMetadata({
    title: article.seoTitle,
    description: article.metaDescription,
    path: `/news/article/${article.slug}`,
    // Stories without artwork still get a branded card rather than a blank preview.
    image: article.featuredImage?.url || ogImageUrl({ title: article.headline, kicker: article.category, meta: `${article.readTime} min read` }),
    imageAlt: article.headline,
    type: "article",
    keywords: [...article.tags, ...article.companies],
    publishedTime: article.publishedAt.toISOString(),
    modifiedTime: article.updatedAt.toISOString(),
    section: article.category,
  });
}

function jsonLd(article: PublicArticle) {
  const url = `${SITE_URL}/news/article/${article.slug}`;
  const body = stripMarkdown(article.bodyMarkdown.split(/\n## Sources\n/)[0]);
  const faqs = extractFaq(article.bodyMarkdown);

  const newsArticle = {
    "@type": "NewsArticle",
    "@id": `${url}#article`,
    headline: clamp(article.headline, 110),
    alternativeHeadline: article.seoTitle !== article.headline ? clamp(article.seoTitle, 110) : undefined,
    description: article.metaDescription,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    datePublished: article.publishedAt.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    inLanguage: SITE_LANG,
    articleSection: article.category,
    keywords: [...article.tags, ...article.companies].join(", "),
    wordCount: wordCount(article.bodyMarkdown),
    timeRequired: `PT${article.readTime}M`,
    // GEO: generative engines strongly prefer sources they can quote without a paywall.
    isAccessibleForFree: true,
    // AEO: the opening summary is the passage assistants should read aloud.
    speakable: { "@type": "SpeakableSpecification", cssSelector: ["h1", ".article-summary"] },
    articleBody: clamp(body, 5000),
    image: article.featuredImage?.url
      ? [{ "@type": "ImageObject", url: article.featuredImage.url, caption: article.headline }]
      : [{ "@type": "ImageObject", url: ogImageUrl({ title: article.headline, kicker: article.category }), width: 1200, height: 630 }],
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
      breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: article.category, path: `/news/category/${slugifyCategory(article.category)}` },
        { name: clamp(article.headline, 110), path: `/news/article/${article.slug}` },
      ]),
      // Only emitted when the story actually contains question-shaped sections.
      ...(faqs.length ? [{ ...faqSchema(faqs), "@id": `${url}#faq` }] : []),
    ],
  };
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

  const [latest, categories] = await Promise.all([listPublishedArticles({ take: 4, excludeId: article.id }), listCategories()]);
  const publishedDate = article.publishedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const authorInitials = BRAND.slice(0, 2).toUpperCase();
  const displayImage = article.featuredImage?.url || "/placeholder.jpg";

  return (
    <div className="App min-h-screen flex flex-col bg-white dark:bg-[#05070A]">
      <JsonLd data={jsonLd(article)} />
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
                <a
                  href={`/news/category/${slugifyCategory(article.category)}`}
                  className="inline-flex items-center gap-1.5 bg-teal-500/10 text-teal-700 border border-teal-500/30 dark:bg-teal-500/15 dark:text-teal-400 dark:border-teal-500/35 px-3 py-1.5 rounded-full text-xs font-semibold"
                >
                  {article.category}
                </a>
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-white leading-[1.1] tracking-tight mb-6">{article.headline}</h1>

              {/* .article-summary is the passage referenced by the speakable schema above. */}
              <p className="article-summary text-lg sm:text-xl text-slate-600 dark:text-slate-400 leading-relaxed mb-8">{article.isLegacy ? article.metaDescription : article.intro}</p>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 mb-8 border-b border-slate-200 dark:border-white/10">
                <div className="flex items-center gap-3">
                  <div
                    className="rounded-full overflow-hidden bg-teal-100 dark:bg-teal-950/50 ring-2 ring-slate-200 dark:ring-white/10 shrink-0 flex items-center justify-center font-bold text-teal-600 dark:text-teal-400"
                    style={{ width: 48, height: 48 }}
                  >
                    {authorInitials}
                  </div>
                  <p className="font-bold text-slate-900 dark:text-white leading-tight text-base">{BRAND}</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <time dateTime={article.publishedAt.toISOString()}>{publishedDate}</time>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span>{article.readTime} min read</span>
                </div>
              </div>

              <figure className="rounded-2xl overflow-hidden mb-10 bg-slate-100 ring-1 ring-slate-200 dark:bg-[#121820] dark:ring-white/10">
                <div className="aspect-video relative">
                  <SafeImage src={displayImage} alt={article.headline} className="w-full h-full object-cover" />
                  <BrandBadge size="md" />
                </div>
                {article.featuredImage?.credit || article.featuredImage?.publisher ? (
                  <figcaption className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                    Image: {article.featuredImage?.credit ?? article.featuredImage?.publisher}
                    {article.featuredImage?.sourceUrl ? (
                      <>
                        {" "}
                        via{" "}
                        <a href={article.featuredImage.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">
                          {article.featuredImage.publisher ?? "source"}
                        </a>
                      </>
                    ) : null}
                  </figcaption>
                ) : null}
              </figure>

              <div className="prose-custom max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}>
                  {prepareBody(article.bodyMarkdown)}
                </ReactMarkdown>
              </div>

              <SourcesSection citations={article.citations} brand={BRAND} />

              <PoweredByBlogy />
            </article>

            <aside className="lg:w-85 lg:shrink-0 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto space-y-6 lg:pb-12">
              <section className="rounded-2xl bg-linear-to-br from-teal-500 to-emerald-600 text-white p-6 relative overflow-hidden shadow-xl shadow-teal-500/20">
                <div className="relative z-10">
                  <span className="inline-block px-2 py-1 bg-white/20 rounded text-[10px] font-bold tracking-wider uppercase mb-3 backdrop-blur-md">Sponsor</span>
                  <h3 className="text-xl font-bold mb-2 leading-tight">Fire your SEO agency. Use Blogy instead.</h3>
                  <p className="text-teal-50 text-sm mb-5 leading-relaxed">Automate your content creation and SEO growth with AI-powered programmatic SEO tailored for SaaS startups.</p>
                  <a href="https://blogy.in" target="_blank" rel="noreferrer sponsored" className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-white text-teal-600 rounded-lg font-semibold text-sm hover:bg-teal-50 transition-colors">
                    Start Free Trial
                  </a>
                </div>
              </section>

              {article.companies.length > 0 && (
                <section className="rounded-2xl bg-white dark:bg-[#0d1117] ring-1 ring-slate-200 dark:ring-white/10 p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">Companies in this story</p>
                  <div className="flex flex-wrap gap-2">
                    {article.companies.slice(0, 10).map((c) => (
                      <a
                        key={c}
                        href={`/company/${slugifyCategory(c)}`}
                        className="inline-flex items-center px-3 py-1.5 rounded-full bg-slate-100 dark:bg-[#121820] text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-teal-50 hover:text-teal-700 transition-colors"
                      >
                        {c}
                      </a>
                    ))}
                  </div>
                </section>
              )}

              <section className="rounded-2xl bg-white dark:bg-[#0d1117] ring-1 ring-slate-200 dark:ring-white/10 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">Latest News</p>
                <div className="space-y-3.5">
                  {latest.map((l) => (
                    <a key={l.id} href={`/news/article/${l.slug}`} className="group flex gap-3 items-start">
                      <SafeImage
                        src={l.featuredImage?.url || "/placeholder.jpg"}
                        alt={l.headline}
                        className="w-16 h-16 rounded-lg object-cover bg-slate-100 dark:bg-[#121820] shrink-0 ring-1 ring-slate-200 dark:ring-white/10"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{l.headline}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{l.readTime} min read</p>
                      </div>
                    </a>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl bg-white dark:bg-[#0d1117] ring-1 ring-slate-200 dark:ring-white/10 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">Browse Categories</p>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <a
                      key={cat}
                      href={`/news/category/${slugifyCategory(cat)}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-[#121820] text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-950/40 dark:hover:text-teal-400 transition-colors"
                    >
                      {cat}
                    </a>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
