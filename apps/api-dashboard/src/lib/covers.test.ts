import { describe, expect, test } from 'vitest';

import { coverPath, coverPathForStoryUrl, parseCoverFile } from './covers';
import { coverImage, imageObjectSchema } from './images';

describe('cover paths', () => {
  test('social and art variants of one story', () => {
    expect(coverPath('zepto-raises-abc123')).toBe('/covers/zepto-raises-abc123.png');
    expect(coverPath('zepto-raises-abc123', 'art')).toBe('/covers/zepto-raises-abc123.art.png');
    expect(coverPathForStoryUrl('/news/zepto-blinkit-abcdef12', 'art')).toBe('/covers/zepto-blinkit-abcdef12.art.png');
    expect(coverPathForStoryUrl('/news/a-b?x=1#y')).toBe('/covers/a-b.png');
  });

  test('parses only cover file names', () => {
    expect(parseCoverFile('zepto-raises-abc123.png')).toEqual({ slug: 'zepto-raises-abc123', variant: 'social' });
    expect(parseCoverFile('Zepto-Raises-ABC123.art.png')).toEqual({ slug: 'zepto-raises-abc123', variant: 'art' });
    for (const bad of ['x.jpg', '.png', '../etc.png', 'a/b.png', 'a.b.png', 'a.art.art.png', '-lead.png']) {
      expect(parseCoverFile(bad), bad).toBeNull();
    }
  });
});

describe('coverImage', () => {
  test('og uses the headline card, the page shows the art, and the rights are ours', () => {
    const img = coverImage('a-b', 'Headline');
    expect(img.url).toMatch(/\/covers\/a-b\.png\?v=\d+$/);
    expect(img.displayUrl).toBe('/covers/a-b.art.png');
    expect([img.width, img.height]).toEqual([1200, 630]);
    const schema = imageObjectSchema(img, 'Headline');
    expect(schema).toMatchObject({ width: 1200, height: 630, creditText: expect.any(String), license: expect.stringMatching(/\/terms$/) });
    expect(schema.creator).toEqual({ '@id': expect.stringMatching(/#organization$/) });
  });
});
