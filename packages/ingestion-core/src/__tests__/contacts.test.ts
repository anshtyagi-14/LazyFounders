import { describe, expect, it } from 'vitest';
import { checkForeignContacts, findForeignEmails, scrubForeignContacts } from '../content/contacts';
import { extractArticle } from '../content/extract';

const STORY = [
  'Quick-commerce startup Zepto has raised $25 million in a Series B round led by Nexus Venture Partners, the company said on Tuesday.',
  'Existing investor Y Combinator also joined the round, which the company said would fund expansion of its dark-store network.',
  'The company was founded in 2021 by Aadit Palicha and Kaivalya Vohra and operates in several large Indian cities.',
  'Analysts expect competition in the category to intensify as incumbents add faster delivery options for groceries.',
];

describe('scrubForeignContacts', () => {
  it('drops the TechCrunch reporter-bio sentence and its "View Bio" line', () => {
    const text = [
      'Tim De Chant is a senior climate reporter at TechCrunch. He holds his BA degree in environmental studies, English, and biology from St. Olaf College.',
      '',
      'You can contact or verify outreach from Tim by emailing tim.dechant@techcrunch.com.',
      '',
      'View Bio',
    ].join('\n');
    const r = scrubForeignContacts(text);
    expect(r.text).not.toContain('@');
    expect(r.text).not.toMatch(/View Bio/);
    expect(r.text).toContain('St. Olaf College.');
    expect(r.removed).toHaveLength(2);
  });

  it('removes only the offending sentence from a paragraph', () => {
    const r = scrubForeignContacts('The round closed in May. For media queries, write to press@zepto.com. The company plans to hire 200 people.');
    expect(r.text).toBe('The round closed in May. The company plans to hire 200 people.');
  });

  it('drops list items and headings that carry an address, keeping Markdown structure', () => {
    const md = ['## Key highlights', '', '- Raised $25 million', '- Contact: jane@acme.io', '- Led by Nexus', '', '### Reach us at ops@acme.io'].join('\n');
    const r = scrubForeignContacts(md);
    expect(r.text).toBe(['## Key highlights', '', '- Raised $25 million', '- Led by Nexus'].join('\n'));
  });

  it('keeps our own addresses', () => {
    const text = 'Send corrections to tarun.kumar@blogy.in or hello@lazyfounder.in.';
    expect(scrubForeignContacts(text)).toEqual({ text, removed: [] });
  });

  it('catches obfuscated and mailto addresses', () => {
    expect(findForeignEmails('reach tim [at] techcrunch [dot] com')).toHaveLength(1);
    expect(findForeignEmails('[Email us](mailto:news@example.org)')).toHaveLength(1);
    expect(scrubForeignContacts('Intro line. Reach tim(at)techcrunch(dot)com for more.').text).toBe('Intro line.');
  });

  it('leaves social handles and ordinary text alone', () => {
    const text = 'Follow @TechCrunch for updates. The deal values the company at $1.2 billion.';
    expect(scrubForeignContacts(text)).toEqual({ text, removed: [] });
  });
});

describe('checkForeignContacts', () => {
  it('is an error when a third-party address is present', () => {
    expect(checkForeignContacts('Contact tim.dechant@techcrunch.com.')).toEqual([
      expect.objectContaining({ check: 'contacts', severity: 'error' }),
    ]);
    expect(checkForeignContacts('Write to tarun.kumar@blogy.in.')).toEqual([]);
  });
});

describe('extractArticle author bio boxes', () => {
  it('drops a reporter bio container inside <article>', () => {
    const html = `<!doctype html><html lang="en"><head><title>Zepto raises</title></head><body><article>
      <h1>Zepto raises $25M</h1>
      ${STORY.map((p) => `<p>${p}</p>`).join('')}
      <div class="wp-block-tc23-author-card">
        <p>Tim De Chant is a senior climate reporter at TechCrunch.</p>
        <p>You can contact or verify outreach from Tim by emailing tim.dechant@techcrunch.com.</p>
        <a href="/author/tim-de-chant">View Bio</a>
      </div>
    </article></body></html>`;
    const x = extractArticle(html, 'https://techcrunch.com/2026/09/25/zepto/');
    expect(x.bodyText).toContain('Series B');
    expect(x.bodyText).not.toContain('techcrunch.com');
    expect(x.bodyText).not.toContain('senior climate reporter');
  });
});
