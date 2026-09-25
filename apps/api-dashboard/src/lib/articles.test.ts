import { describe, expect, test } from 'vitest';

import { sanitizeHeadline } from './articles';
import { normalizeTopic, normalizeTopics } from './topics';
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
