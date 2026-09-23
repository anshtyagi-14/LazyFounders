import { gunzipSync } from 'node:zlib';
import { SaxesParser } from 'saxes';
import { TerminalError } from '../errors';
import { sha256 } from '../net/url-canonical';

export interface FeedEntry {
  loc: string;
  lastmod: Date | null;
  publishedAt: Date | null;
  title: string | null;
  isNews: boolean;
  /** Full text supplied by the publisher in the feed (RSS content:encoded / Atom content). */
  contentHtml: string | null;
  author: string | null;
}

export interface SitemapChild {
  loc: string;
  lastmod: Date | null;
}

export interface ParsedFeed {
  kind: 'urlset' | 'sitemapindex' | 'rss' | 'atom' | 'unknown';
  entries: FeedEntry[];
  children: SitemapChild[];
}

const MAX_DECOMPRESSED = Number(process.env.FETCH_MAX_BYTES_SITEMAP || 50 * 1024 * 1024);

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Decompress .xml.gz payloads with a hard output cap (gzip-bomb guard). */
export function maybeGunzip(buf: Buffer): Buffer {
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      return gunzipSync(buf, { maxOutputLength: MAX_DECOMPRESSED });
    } catch (err) {
      throw new TerminalError(`Invalid or oversized gzip sitemap: ${(err as Error).message}`, 'parse_error');
    }
  }
  return buf;
}

/**
 * One streaming parser for sitemap indexes, url sets (incl. Google News sitemaps),
 * RSS 2.0 and Atom. Unknown elements are ignored; DTDs/entities are not expanded.
 */
export function parseFeed(input: Buffer): ParsedFeed {
  const xml = maybeGunzip(input).toString('utf8');
  const parser = new SaxesParser({ xmlns: false });
  const result: ParsedFeed = { kind: 'unknown', entries: [], children: [] };

  const stack: string[] = [];
  let text = '';
  let item: Record<string, string> | null = null;
  let itemKind: 'url' | 'sitemap' | 'item' | 'entry' | null = null;
  let atomLink: string | null = null;

  parser.on('opentag', (tag) => {
    const local = tag.name.toLowerCase();
    if (stack.length === 0) {
      if (local === 'urlset') result.kind = 'urlset';
      else if (local === 'sitemapindex') result.kind = 'sitemapindex';
      else if (local === 'rss' || local === 'rdf:rdf') result.kind = 'rss';
      else if (local === 'feed') result.kind = 'atom';
    }
    stack.push(local);
    text = '';
    if (!item && (local === 'url' || local === 'sitemap' || local === 'item' || local === 'entry')) {
      item = {};
      itemKind = local;
      atomLink = null;
    }
    if (item && itemKind === 'entry' && local === 'link') {
      const rel = String(tag.attributes.rel ?? 'alternate');
      const href = String(tag.attributes.href ?? '');
      if (href && (rel === 'alternate' || !atomLink)) atomLink = href;
    }
  });

  parser.on('text', (t) => {
    text += t;
  });
  parser.on('cdata', (t) => {
    text += t;
  });

  parser.on('closetag', (tag) => {
    const local = tag.name.toLowerCase();
    stack.pop();
    const value = text.trim();
    if (item) {
      if (local !== itemKind) {
        // Keep the first occurrence of each field (e.g. first <link> in RSS).
        if (value && item[local] === undefined) item[local] = value;
      } else {
        finishItem(item, itemKind!, atomLink, result);
        item = null;
        itemKind = null;
      }
    }
    text = '';
  });

  try {
    parser.write(xml).close();
  } catch (err) {
    throw new TerminalError(`Malformed feed XML: ${(err as Error).message}`, 'parse_error');
  }
  return result;
}

function finishItem(item: Record<string, string>, kind: string, atomLink: string | null, out: ParsedFeed): void {
  if (kind === 'sitemap') {
    if (item.loc) out.children.push({ loc: item.loc, lastmod: toDate(item.lastmod) });
    return;
  }
  if (kind === 'url') {
    if (!item.loc) return;
    const newsDate = toDate(item['news:publication_date']);
    out.entries.push({
      loc: item.loc,
      lastmod: toDate(item.lastmod) ?? newsDate,
      publishedAt: newsDate,
      title: item['news:title'] ?? null,
      isNews: newsDate !== null || item['news:title'] !== undefined,
      contentHtml: null,
      author: null,
    });
    return;
  }
  if (kind === 'item') {
    const loc = item.link ?? item.guid;
    if (!loc || !/^https?:\/\//i.test(loc)) return;
    const published = toDate(item.pubdate ?? item['dc:date']);
    out.entries.push({
      loc,
      lastmod: toDate(item['atom:updated']) ?? published,
      publishedAt: published,
      title: item.title ?? null,
      isNews: true,
      contentHtml: item['content:encoded'] ?? null,
      author: item['dc:creator'] ?? item.author ?? null,
    });
    return;
  }
  if (kind === 'entry') {
    const loc = atomLink ?? item.id;
    if (!loc || !/^https?:\/\//i.test(loc)) return;
    const published = toDate(item.published);
    out.entries.push({
      loc,
      lastmod: toDate(item.updated) ?? published,
      publishedAt: published,
      title: item.title ?? null,
      isNews: true,
      contentHtml: item.content ?? null,
      author: item.name ?? null,
    });
  }
}

/**
 * Normalised fingerprint of a feed's content. Ignores formatting, ordering and fields
 * we do not use, so cosmetic changes (e.g. a regenerated <lastBuildDate>) are not
 * treated as "source changed".
 */
export function snapshotHash(feed: ParsedFeed): string {
  const lines = [
    ...feed.entries.map((e) => `u|${e.loc}|${e.lastmod?.toISOString() ?? ''}`),
    ...feed.children.map((c) => `s|${c.loc}|${c.lastmod?.toISOString() ?? ''}`),
  ].sort();
  return sha256(`${feed.kind}\n${lines.join('\n')}`);
}
