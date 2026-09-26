import { describe, expect, test } from 'vitest';

import type { PublicAuthor } from './authors';
import { ORGANIZATION_ID, SITE_URL, pageMetadata, personId, personSchema } from './seo';

const author: PublicAuthor = {
  id: '7a3f0c52-5e1b-4c8e-9d2a-1f6b4e8c0d11',
  slug: 'tarun-mottlia',
  name: 'Tarun Mottlia',
  jobTitle: 'Editor',
  bio: 'Edits the site.',
  avatarUrl: null,
  sameAs: ['https://www.linkedin.com/in/tarunmottlia'],
  createdAt: new Date('2026-09-26T00:00:00Z'),
  updatedAt: new Date('2026-09-26T00:00:00Z'),
};

describe('personSchema', () => {
  test('is one stable entity: the same @id every page points its author at', () => {
    const p = personSchema(author);
    expect(p['@type']).toBe('Person');
    expect(p['@id']).toBe(personId('tarun-mottlia'));
    expect(p['@id']).toBe(`${SITE_URL}/author/tarun-mottlia#person`);
    expect(p.url).toBe(`${SITE_URL}/author/tarun-mottlia`);
    // Google: the name field holds the name only; the title lives in jobTitle.
    expect(p.name).toBe('Tarun Mottlia');
    expect(p.jobTitle).toBe('Editor');
    expect(p.sameAs).toEqual(['https://www.linkedin.com/in/tarunmottlia']);
    expect(p.worksFor).toEqual({ '@id': ORGANIZATION_ID });
  });

  test('omits what it cannot back up', () => {
    const p = personSchema({ ...author, sameAs: [] });
    expect(p).not.toHaveProperty('image');
    expect(p).not.toHaveProperty('sameAs');
    expect(p).not.toHaveProperty('knowsAbout');
    expect(p).not.toHaveProperty('agentInteractionStatistic');
  });

  test('carries beats and the story count on the byline page', () => {
    const p = personSchema(author, { knowsAbout: ['Funding', 'AI'], storyCount: 12 });
    expect(p.knowsAbout).toEqual(['Funding', 'AI']);
    expect(p.agentInteractionStatistic).toEqual({
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/WriteAction',
      userInteractionCount: 12,
    });
  });
});

describe('pageMetadata authors', () => {
  test('credits the byline, not the brand, on an article', () => {
    const m = pageMetadata({
      title: 'A story',
      description: 'About it',
      path: '/news/article/a-story',
      type: 'article',
      authors: [{ name: 'Tarun Mottlia', url: '/author/tarun-mottlia' }],
    });
    expect(m.authors).toEqual([{ name: 'Tarun Mottlia', url: `${SITE_URL}/author/tarun-mottlia` }]);
    expect((m.openGraph as { authors?: string[] }).authors).toEqual([`${SITE_URL}/author/tarun-mottlia`]);
  });

  test('leaves the site-wide author alone when a page names none', () => {
    const m = pageMetadata({ title: 'Home', description: 'x', path: '/' });
    expect(m).not.toHaveProperty('authors');
  });
});
