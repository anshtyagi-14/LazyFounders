import { describe, expect, test } from 'vitest';

import {
  SITE_CATEGORIES,
  categoryForArticle,
  categoryForLabel,
  labelsForCategory,
  resolveCategorySlug,
} from './topics';

describe('site categories', () => {
  test('are exactly the six V1 sections', () => {
    expect(SITE_CATEGORIES.map((c) => c.slug)).toEqual(['funding', 'ai', 'policy', 'technology', 'business', 'product']);
  });

  test('every pipeline category lands in a site category', () => {
    // packages/llm CATEGORIES: the only values the generator writes.
    const expected: Record<string, string> = {
      startup: 'business',
      funding: 'funding',
      technology: 'technology',
      ai: 'ai',
      business: 'business',
      finance: 'business',
      product: 'product',
      founders: 'business',
      policy: 'policy',
      health: 'technology',
    };
    for (const [raw, slug] of Object.entries(expected)) expect(categoryForLabel(raw)?.slug, raw).toBe(slug);
  });

  test('merges the duplicate labels named in the spec', () => {
    expect(categoryForLabel('AI Platforms & Assistants')?.slug).toBe('ai');
    expect(categoryForLabel('Startups')?.slug).toBe('business');
    expect(categoryForLabel('Tech')?.slug).toBe('technology');
    expect(categoryForLabel('Investors and Funding')?.slug).toBe('funding');
    expect(categoryForLabel('Privacy')?.slug).toBe('policy');
  });

  test('an own story with an unknown label still files somewhere', () => {
    expect(categoryForArticle('Quantum Gardening').slug).toBe('technology');
    expect(categoryForArticle(null).slug).toBe('technology');
  });
});

describe('resolveCategorySlug', () => {
  test('keeps a site category as-is', () => {
    expect(resolveCategorySlug('funding')?.slug).toBe('funding');
  });

  test('maps an old or alias slug onto its category (the page 308s there)', () => {
    expect(resolveCategorySlug('startups')?.slug).toBe('business');
    expect(resolveCategorySlug('fintech')?.slug).toBe('business');
    expect(resolveCategorySlug('artificial-intelligence')?.slug).toBe('ai');
  });

  test('rejects anything else (404)', () => {
    expect(resolveCategorySlug('news')).toBeNull();
    expect(resolveCategorySlug('not-a-real-section')).toBeNull();
  });
});

describe('labelsForCategory', () => {
  test('translates a category back into the raw labels stored in the database', () => {
    const raw = ['Fundraising', 'AI', 'Venture', 'Startups', 'News', 'Biotech &amp; Health'];
    expect(labelsForCategory('funding', raw)).toEqual(['Fundraising', 'Venture']);
    expect(labelsForCategory('technology', raw)).toEqual(['Biotech &amp; Health']);
  });
});
