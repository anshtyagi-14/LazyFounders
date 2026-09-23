import sanitizeHtml from 'sanitize-html';
import { load } from 'cheerio';
import { sha256 } from '../net/url-canonical';

/**
 * Allowlist sanitiser for stored article HTML. Scripts, styles, iframes, forms, event
 * handler attributes and non-http(s) URLs (javascript:, data:, vbscript:) are removed.
 * Stored HTML is for editorial review only; public pages never render source HTML.
 */
export function sanitizeArticleHtml(html: string, baseUrl?: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'h2', 'h3', 'h4', 'h5', 'ul', 'ol', 'li', 'blockquote', 'q', 'a', 'strong', 'em', 'b', 'i', 'u',
      'br', 'hr', 'figure', 'figcaption', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption',
      'code', 'pre', 'sup', 'sub', 'time', 'cite', 'span',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      time: ['datetime'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonTextTags: ['script', 'style', 'noscript', 'iframe', 'textarea', 'option', 'template', 'svg', 'math', 'object', 'embed', 'form', 'button'],
    transformTags: {
      a: (tagName, attribs) => {
        const out: Record<string, string> = { rel: 'nofollow noopener noreferrer' };
        if (attribs.href) {
          try {
            out.href = new URL(attribs.href, baseUrl).toString();
          } catch {
            /* drop unparsable href */
          }
        }
        if (attribs.title) out.title = attribs.title;
        return { tagName, attribs: out };
      },
      img: (tagName, attribs) => {
        const out: Record<string, string> = {};
        const src = attribs.src || attribs['data-src'] || attribs['data-lazy-src'];
        if (src) {
          try {
            out.src = new URL(src, baseUrl).toString();
          } catch {
            /* ignore */
          }
        }
        if (attribs.alt) out.alt = attribs.alt;
        return { tagName, attribs: out };
      },
    },
    exclusiveFilter: (frame) => frame.tag === 'a' && !frame.attribs.href && !frame.text.trim(),
  });
}

/** Plain text with paragraph breaks preserved. */
export function htmlToText(html: string): string {
  const $ = load(`<div id="__root">${html}</div>`);
  $('script,style,noscript,iframe,template').remove();
  $('br').replaceWith('\n');
  $('p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,tr,div,section,article').each((_, el) => {
    $(el).append('\n\n');
  });
  return normalizeText($('#__root').text());
}

/** Unicode NFKC, no zero-width characters, collapsed whitespace, max two newlines. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/[ \t\f\v 　]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Hash of the normalised text, insensitive to case, punctuation spacing and layout. */
export function contentHash(text: string): string {
  const canonical = normalizeText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return sha256(canonical);
}
