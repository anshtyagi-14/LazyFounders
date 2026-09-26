import { describe, expect, test } from 'vitest';

import { imageObjectSchema, resolveImage, usableImageUrl } from './images';

describe('usableImageUrl', () => {
  test('accepts https and site paths', () => {
    expect(usableImageUrl('https://cdn.example.com/a.jpg?w=1200&h=630')).toBe('https://cdn.example.com/a.jpg?w=1200&h=630');
    expect(usableImageUrl('/uploads/a.png')).toBe('/uploads/a.png');
  });

  test('rejects what would break or be unsafe on an https page', () => {
    expect(usableImageUrl('http://example.com/a.jpg')).toBeNull();
    expect(usableImageUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(usableImageUrl('javascript:alert(1)')).toBeNull();
    expect(usableImageUrl('//evil.example/a.jpg')).toBeNull();
    expect(usableImageUrl('not a url')).toBeNull();
    expect(usableImageUrl('')).toBeNull();
    expect(usableImageUrl(null)).toBeNull();
  });
});

describe('resolveImage', () => {
  test('uses the story image first', () => {
    const img = resolveImage(
      [
        { url: 'https://a.example/lead.jpg', credit: 'Publisher A' },
        { url: 'https://b.example/other.jpg', credit: 'Publisher B' },
      ],
      'Headline',
    );
    expect(img).toMatchObject({ url: 'https://a.example/lead.jpg', credit: 'Publisher A', alt: 'Headline', isFallback: false });
    expect(img.width).toBeUndefined();
  });

  test('falls back to a source image when the story image is missing or unusable', () => {
    const img = resolveImage([{ url: 'http://insecure.example/x.jpg' }, { url: 'https://b.example/other.jpg', credit: 'B' }], 'Headline');
    expect(img.url).toBe('https://b.example/other.jpg');
    expect(img.credit).toBe('B');
  });

  test('ends at the brand card, with its real size and an empty alt', () => {
    const img = resolveImage([{ url: null }, { url: undefined }], 'Headline');
    expect(img.isFallback).toBe(true);
    expect(img.url).toMatch(/\/og-default\.png$/);
    expect(img.displayUrl).toBe('/fallback.webp');
    expect([img.width, img.height]).toEqual([1200, 630]);
    expect(img.alt).toBe('');
  });
});

describe('imageObjectSchema', () => {
  test('a publisher image names its owner and points at the original, but claims no licence', () => {
    const img = resolveImage([{ url: 'https://cdn.techcrunch.com/a.jpg', credit: 'TechCrunch', creditUrl: 'https://techcrunch.com/2026/09/25/story/' }], 'Headline');
    expect(imageObjectSchema(img, 'Headline')).toEqual({
      '@type': 'ImageObject',
      url: 'https://cdn.techcrunch.com/a.jpg',
      contentUrl: 'https://cdn.techcrunch.com/a.jpg',
      caption: 'Headline',
      creator: { '@type': 'Organization', name: 'TechCrunch', url: 'https://techcrunch.com' },
      creditText: 'TechCrunch',
      copyrightNotice: '© TechCrunch',
      acquireLicensePage: 'https://techcrunch.com/2026/09/25/story/',
    });
  });

  test('falls back to the source host when the publisher is not named', () => {
    const img = resolveImage([{ url: 'https://img.example.com/a.jpg', creditUrl: 'https://www.yourstory.com/x' }], 'H');
    const schema = imageObjectSchema(img, 'H');
    expect(schema.creator).toEqual({ '@type': 'Organization', name: 'yourstory.com', url: 'https://www.yourstory.com' });
    expect(schema.copyrightNotice).toBe('© yourstory.com');
  });

  test('our own brand card carries our full rights metadata', () => {
    const schema = imageObjectSchema(resolveImage([], ''), 'H');
    expect(schema.creator).toEqual({ '@id': expect.stringMatching(/\/#organization$/) });
    expect(schema.creditText).toBeTruthy();
    expect(schema.copyrightNotice).toMatch(/^© /);
    expect(schema.license).toMatch(/\/terms$/);
    expect(schema.acquireLicensePage).toMatch(/\/contact$/);
    expect(schema.caption).toBeUndefined();
    expect(schema.width).toBe(1200);
  });
});
