import { describe, expect, test } from 'vitest';

import { gaAttrs, publishAgeBucket } from './ga-attrs';

describe('gaAttrs', () => {
  test('emits the event and only the params that have values', () => {
    const attrs = gaAttrs('select_content', { content_id: 'a1', position: 2, category: undefined, source_surface: '' });
    expect(attrs['data-ga-event']).toBe('select_content');
    expect(JSON.parse(attrs['data-ga-params'])).toEqual({ content_id: 'a1', position: 2 });
  });
});

describe('publishAgeBucket', () => {
  const now = Date.parse('2026-09-25T12:00:00Z');
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();

  test('buckets by age', () => {
    expect(publishAgeBucket(hoursAgo(1), now)).toBe('lt_6h');
    expect(publishAgeBucket(hoursAgo(12), now)).toBe('6_24h');
    expect(publishAgeBucket(hoursAgo(48), now)).toBe('1_7d');
    expect(publishAgeBucket(hoursAgo(24 * 30), now)).toBe('gt_7d');
  });

  test('is undefined without a usable date', () => {
    expect(publishAgeBucket(undefined, now)).toBeUndefined();
    expect(publishAgeBucket('garbage', now)).toBeUndefined();
  });
});
