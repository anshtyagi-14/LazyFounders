import { load, type CheerioAPI } from 'cheerio';
import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';
import type { SourceAdapter } from '../registry/adapters';
import { htmlToText, sanitizeArticleHtml } from './sanitize';
import { cleanAuthor } from './author';

export interface ExtractedArticle {
  canonicalUrl: string | null;
  headline: string | null;
  subheadline: string | null;
  author: string | null;
  publishedAt: Date | null;
  modifiedAt: Date | null;
  bodyHtml: string;
  bodyText: string;
  leadImage: string | null;
  imageCredit: string | null;
  categories: string[];
  tags: string[];
  htmlLang: string | null;
  declaredLanguage: string | null;
  publisherName: string | null;
  isAccessibleForFree: boolean | null;
  structured: Record<string, unknown>;
  outboundLinks: Array<{ url: string; text: string }>;
  method: 'adapter' | 'json_ld' | 'readability' | 'semantic_html';
  /** True when the static HTML did not contain a usable body (candidate for headless rendering). */
  needsRender: boolean;
}

const ARTICLE_TYPES = new Set(['newsarticle', 'article', 'reportagenewsarticle', 'blogposting', 'analysisnewsarticle', 'techarticle']);
const MIN_BODY_CHARS = 400;

function toDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function str(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (Array.isArray(v)) return str(v[0]);
  if (v && typeof v === 'object' && 'name' in v) return str((v as { name: unknown }).name);
  return null;
}

function list(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(list);
  return [];
}

function imageOf(v: unknown): { url: string | null; credit: string | null } {
  if (!v) return { url: null, credit: null };
  if (typeof v === 'string') return { url: v, credit: null };
  if (Array.isArray(v)) return imageOf(v[0]);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return { url: str(o.url) ?? str(o.contentUrl), credit: str(o.creditText) ?? str(o.copyrightHolder) ?? str(o.author) };
  }
  return { url: null, credit: null };
}

/** Find the first Article-like JSON-LD node (handles arrays and @graph). */
export function findArticleJsonLd($: CheerioAPI): Record<string, unknown> | null {
  const nodes: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      nodes.push(JSON.parse($(el).text()));
    } catch {
      /* malformed JSON-LD is common; ignore */
    }
  });
  const stack = [...nodes];
  while (stack.length) {
    const n = stack.shift();
    if (Array.isArray(n)) {
      stack.push(...n);
      continue;
    }
    if (!n || typeof n !== 'object') continue;
    const o = n as Record<string, unknown>;
    if (Array.isArray(o['@graph'])) stack.push(...(o['@graph'] as unknown[]));
    const types = ([] as unknown[]).concat(o['@type'] ?? []).map((t) => String(t).toLowerCase());
    if (types.some((t) => ARTICLE_TYPES.has(t))) return o;
  }
  return null;
}

function meta($: CheerioAPI, ...names: string[]): string | null {
  for (const n of names) {
    const v = $(`meta[property="${n}"]`).attr('content') ?? $(`meta[name="${n}"]`).attr('content');
    if (v && v.trim()) return v.trim();
  }
  return null;
}

function readability(html: string, url: string): { html: string; title: string | null; byline: string | null } | null {
  try {
    // Scripts are never executed (JSDOM default) and console noise is discarded.
    const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
    const parsed = new Readability(dom.window.document, { charThreshold: 200 }).parse();
    dom.window.close();
    return parsed?.content ? { html: parsed.content, title: parsed.title ?? null, byline: parsed.byline ?? null } : null;
  } catch {
    return null;
  }
}

/**
 * Source-independent extraction chain:
 *   1. source adapter  2. schema.org JSON-LD  3. OpenGraph / standard meta
 *   4. semantic HTML via Readability (then <article> paragraphs)
 * Headless rendering is signalled via `needsRender`, never done here.
 */
export function extractArticle(html: string, url: string, adapter?: SourceAdapter): ExtractedArticle {
  const $ = load(html);
  const ld = findArticleJsonLd($);
  const fromAdapter = adapter?.extract?.($, url) ?? {};

  const ldImage = imageOf(ld?.image);
  const canonical = $('link[rel="canonical"]').attr('href') ?? meta($, 'og:url');

  let method: ExtractedArticle['method'] = 'semantic_html';
  let bodyHtml = '';
  if (fromAdapter.bodyHtml && htmlToText(fromAdapter.bodyHtml).length >= MIN_BODY_CHARS) {
    bodyHtml = fromAdapter.bodyHtml;
    method = 'adapter';
  } else if (typeof ld?.articleBody === 'string' && ld.articleBody.length >= MIN_BODY_CHARS) {
    bodyHtml = ld.articleBody
      .split(/\n{2,}|\r\n\r\n/)
      .map((p) => `<p>${p.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!)}</p>`)
      .join('');
    method = 'json_ld';
  } else {
    const r = readability(html, url);
    if (r && htmlToText(r.html).length >= MIN_BODY_CHARS) {
      bodyHtml = r.html;
      method = 'readability';
    } else {
      bodyHtml = $('article p, main p').map((_, el) => `<p>${$(el).html() ?? ''}</p>`).get().join('');
    }
  }

  const safeHtml = sanitizeArticleHtml(bodyHtml, url);
  const bodyText = htmlToText(safeHtml);

  const host = new URL(url).hostname.replace(/^www\./, '');
  const outboundLinks: Array<{ url: string; text: string }> = [];
  load(safeHtml)('a[href]').each((_, el) => {
    const a = load(el);
    const href = a('a').attr('href');
    if (!href) return;
    try {
      const u = new URL(href);
      if (!u.hostname.endsWith(host)) outboundLinks.push({ url: u.toString(), text: a('a').text().trim().slice(0, 200) });
    } catch {
      /* ignore */
    }
  });

  const leadImage = fromAdapter.leadImage ?? ldImage.url ?? meta($, 'og:image', 'twitter:image');
  const credit =
    fromAdapter.imageCredit ?? ldImage.credit ?? ($('figure figcaption').first().text().trim().slice(0, 300) || null);

  return {
    canonicalUrl: canonical ? safeAbs(canonical, url) : null,
    headline: fromAdapter.headline ?? str(ld?.headline) ?? meta($, 'og:title', 'twitter:title') ?? ($('h1').first().text().trim() || null),
    subheadline: fromAdapter.subheadline ?? str(ld?.alternativeHeadline) ?? str(ld?.description) ?? meta($, 'og:description', 'description'),
    author: cleanAuthor(fromAdapter.author ?? str(ld?.author) ?? meta($, 'author', 'article:author'), str(ld?.publisher) ?? meta($, 'og:site_name')),
    publishedAt: toDate(fromAdapter.publishedAt) ?? toDate(ld?.datePublished) ?? toDate(meta($, 'article:published_time')) ?? toDate($('time[datetime]').first().attr('datetime')),
    modifiedAt: toDate(fromAdapter.modifiedAt) ?? toDate(ld?.dateModified) ?? toDate(meta($, 'article:modified_time', 'og:updated_time')),
    bodyHtml: safeHtml,
    bodyText,
    leadImage: leadImage ? safeAbs(leadImage, url) : null,
    imageCredit: credit,
    categories: fromAdapter.categories ?? [...list(ld?.articleSection), ...(meta($, 'article:section') ? [meta($, 'article:section')!] : [])],
    tags: fromAdapter.tags ?? [...new Set([...list(ld?.keywords), ...$('meta[property="article:tag"]').map((_, el) => $(el).attr('content') ?? '').get().filter(Boolean)])],
    htmlLang: $('html').attr('lang') ?? null,
    declaredLanguage: str(ld?.inLanguage),
    publisherName: str(ld?.publisher) ?? meta($, 'og:site_name'),
    isAccessibleForFree: ld && 'isAccessibleForFree' in ld ? !['false', 'False', false].includes(ld.isAccessibleForFree as never) : null,
    structured: ld ? pickStructured(ld) : {},
    outboundLinks: outboundLinks.slice(0, 100),
    method,
    needsRender: bodyText.length < MIN_BODY_CHARS,
  };
}

function safeAbs(u: string, base: string): string | null {
  try {
    const abs = new URL(u, base);
    return abs.protocol === 'http:' || abs.protocol === 'https:' ? abs.toString() : null;
  } catch {
    return null;
  }
}

/** Keep structured metadata small: no article body copies in the metadata column. */
function pickStructured(ld: Record<string, unknown>): Record<string, unknown> {
  const keep = ['@type', 'headline', 'datePublished', 'dateModified', 'inLanguage', 'articleSection', 'keywords', 'isAccessibleForFree', 'wordCount'];
  const out: Record<string, unknown> = {};
  for (const k of keep) if (k in ld) out[k] = ld[k];
  const pub = str(ld.publisher);
  if (pub) out.publisher = pub;
  const author = str(ld.author);
  if (author) out.author = author;
  return out;
}
