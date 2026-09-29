import { describe, expect, test } from 'vitest';

import { sanitizeHeadline, sourceStoryPath } from './articles';
import { canonicalSitePath, normalizeTopic, normalizeTopics } from './topics';
import { normalizeQuery } from './search';

describe('sanitizeHeadline', () => {
  test('decodes HTML entities and strips markup', () => {
    // &#8217; is a right single quote (U+2019), not an ASCII apostrophe.
    expect(sanitizeHeadline('A16z is challenging Silicon Valley&#8217;s love for drop-outs by launching a school')).toBe(
      'A16z is challenging Silicon Valley’s love for drop-outs by launching a school',
    );
    expect(sanitizeHeadline('A &amp; B <strong>headline</strong>')).toBe('A & B headline');
    expect(sanitizeHeadline('  &nbsp;  Hello&nbsp;world  ')).toBe('Hello world');
  });

  test('drops markdown emphasis the drafter or the publisher left in plain-text fields', () => {
    expect(sanitizeHeadline('*WIRED* has released its 2026 gift guide')).toBe('WIRED has released its 2026 gift guide');
    expect(sanitizeHeadline('Tiny Health raises **$33M**')).toBe('Tiny Health raises $33M');
    expect(sanitizeHeadline('the user_id field, 5 * 3')).toBe('the user_id field, 5 * 3');
  });
});

describe('sourceStoryPath', () => {
  test('is a readable slug ending in the first 8 hex of the id', () => {
    expect(sourceStoryPath('54a9bdcb-c668-450a-8f79-e87fc0430f98', 'Australia steps up response to AI after OpenAI bot breaches health system database')).toBe(
      '/news/australia-steps-up-response-to-ai-after-openai-bot-breaches-health-54a9bdcb',
    );
    expect(sourceStoryPath('ABCDEF12-0000-0000-0000-000000000000', 'Zepto &amp; Blinkit')).toBe('/news/zepto-blinkit-abcdef12');
  });
});

describe('normalizeTopic', () => {
  test('decodes entities that publishers leave in category labels', () => {
    // This is real data: source rows carry "Biotech &amp; Health" verbatim.
    expect(normalizeTopic('Biotech &amp; Health')).toBe('Technology');
    expect(normalizeTopic('Government &amp; Policy')).toBe('Policy');
  });

  test('folds publisher labels into the six site categories', () => {
    expect(normalizeTopic('Fundraising')).toBe('Funding');
    expect(normalizeTopic('Venture')).toBe('Funding');
    expect(normalizeTopic('Startup Stories')).toBe('Business');
  });

  test('drops labels that are not subjects', () => {
    // "News" and "TC" are publisher bookkeeping, not something to browse.
    expect(normalizeTopic('News')).toBeNull();
    expect(normalizeTopic('TC')).toBeNull();
    expect(normalizeTopic('')).toBeNull();
    expect(normalizeTopic(null)).toBeNull();
  });

  test('drops a label that is not one of the site categories rather than inventing a section', () => {
    expect(normalizeTopic('Climate')).toBe('Technology');
    expect(normalizeTopic('Some Publisher Column')).toBeNull();
  });
});

describe('normalizeTopics', () => {
  test('de-duplicates across aliases and preserves order', () => {
    expect(normalizeTopics(['Fundraising', 'Venture', 'AI', 'News'])).toEqual(['Funding', 'AI']);
  });

  test('returns an empty list rather than throwing on junk input', () => {
    expect(normalizeTopics([null, undefined, '', 'News'])).toEqual([]);
  });
});

describe('normalizeQuery', () => {
  test('collapses whitespace and trims', () => {
    expect(normalizeQuery('  funding   round ')).toBe('funding round');
  });

  test('caps length so a pathological query cannot reach the database', () => {
    expect(normalizeQuery('a'.repeat(500))).toHaveLength(100);
  });

  test('treats a missing query as empty', () => {
    expect(normalizeQuery(undefined)).toBe('');
    expect(normalizeQuery(null)).toBe('');
  });
});

describe('canonicalSitePath', () => {
  test('moves old story prefixes onto /news/<slug>', () => {
    expect(canonicalSitePath('/news/article/zepto-raises-abc123')).toBe('/news/zepto-raises-abc123');
    expect(canonicalSitePath('/news/source/zepto-blinkit-abcdef12')).toBe('/news/zepto-blinkit-abcdef12');
    expect(canonicalSitePath('/news/article/a-b#faq')).toBe('/news/a-b#faq');
  });

  test('folds raw pipeline categories into the site section', () => {
    expect(canonicalSitePath('/news/category/startup')).toBe('/news/category/business');
    expect(canonicalSitePath('/news/category/funding')).toBe('/news/category/funding');
  });

  test('leaves everything else alone', () => {
    for (const p of ['/', '/news/a-b', '/company/zepto', '/news/category/not-a-topic', 'https://example.com/news/article/x']) {
      expect(canonicalSitePath(p)).toBe(p);
    }
  });
});
