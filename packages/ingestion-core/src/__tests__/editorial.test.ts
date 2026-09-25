import { describe, expect, it } from 'vitest';
import { renderArticleMarkdown, renderSources, versionContentHash, type Citation } from '../editorial/render';
import { canTransition, evaluatePublishGates, type PublishGateInput } from '../editorial/state-machine';
import { decidePublish } from '../stages/validate-publish';
import { checkNumbersGrounded, checkOriginality, checkOutputLanguage, checkSeo } from '../validate/checks';
import { ZEPTO_TEXT } from './fixtures/facts';

const citations: Citation[] = [
  { position: 1, publisher: 'YourStory', url: 'https://yourstory.com/2026/09/zepto', title: 'Zepto raises $25M', language: 'en', publishedAt: new Date('2026-09-20'), sourceArticleId: 'sa-1' },
  { position: 2, publisher: 'THE BRIDGE', url: 'https://thebridge.jp/2026/09/zepto', title: 'Zepto raises $25 million', language: 'ja', publishedAt: null, sourceArticleId: 'sa-2' },
];

function gateInput(p: Partial<PublishGateInput> = {}): PublishGateInput {
  return {
    status: 'APPROVED',
    mode: 'manual',
    autoPublishEnabled: false,
    source: { trustStatus: 'APPROVED', publishingMode: 'MANUAL', minConfidence: 0.85 },
    validation: { schemaValid: true, dedupDecision: 'UNIQUE', confidence: 0.9, translationRequired: false, translationValid: true, safetyPassed: true, errors: 0 },
    citations: 2,
    seo: { seoTitle: 'Zepto raises $25M Series B', metaDescription: 'x'.repeat(140), slug: 'zepto-raises-25m' },
    ...p,
  };
}

describe('editorial workflow', () => {
  it('enforces the lifecycle', () => {
    expect(canTransition('GENERATED', 'VALIDATED')).toBe(true);
    expect(canTransition('DRAFT', 'APPROVED')).toBe(true);
    expect(canTransition('DRAFT', 'PUBLISHED')).toBe(false);
    expect(canTransition('GENERATED', 'PUBLISHED')).toBe(false);
    expect(canTransition('REJECTED', 'PUBLISHED')).toBe(false);
  });

  // Required test 17
  it('an unapproved article cannot be published', () => {
    for (const status of ['GENERATED', 'VALIDATED', 'DRAFT', 'NEEDS_REVIEW', 'REJECTED']) {
      const gates = evaluatePublishGates(gateInput({ status }));
      expect(gates.allowed, status).toBe(false);
      expect(decidePublish({ article: { status, currentVersionId: 'v1', publishedVersionId: null }, versionId: 'v1', gates }).action).toBe('blocked');
    }
    // Unapproved source blocks even an approved article.
    expect(evaluatePublishGates(gateInput({ source: { trustStatus: 'SUSPENDED', publishingMode: 'MANUAL', minConfidence: 0.85 } })).allowed).toBe(false);
    // Auto-publish is off unless explicitly enabled globally AND per source AND every gate passes.
    expect(evaluatePublishGates(gateInput({ mode: 'auto', status: 'DRAFT' })).reasons).toEqual(expect.arrayContaining(['auto_publish_disabled', 'source_policy_manual']));
    const auto = gateInput({ mode: 'auto', status: 'DRAFT', autoPublishEnabled: true, source: { trustStatus: 'APPROVED', publishingMode: 'AUTO', minConfidence: 0.85 } });
    expect(evaluatePublishGates(auto).allowed).toBe(true);
    expect(evaluatePublishGates({ ...auto, validation: { ...auto.validation, confidence: 0.5 } }).reasons).toContain('confidence_below_threshold');
    expect(evaluatePublishGates({ ...auto, validation: { ...auto.validation, translationRequired: true, translationValid: false } }).reasons).toContain('translation_not_validated');
    expect(evaluatePublishGates({ ...auto, validation: { ...auto.validation, dedupDecision: 'POSSIBLE_DUPLICATE' } }).allowed).toBe(false);
    // A stale version (newer draft exists) cannot be published.
    expect(decidePublish({ article: { status: 'APPROVED', currentVersionId: 'v2', publishedVersionId: null }, versionId: 'v1', gates: evaluatePublishGates(gateInput()) })).toEqual({
      action: 'blocked',
      reasons: ['stale_version'],
    });
  });

  // Required test 18
  it('re-publishing an unchanged version is a no-op', () => {
    const gates = evaluatePublishGates(gateInput({ status: 'PUBLISHED' }));
    expect(decidePublish({ article: { status: 'PUBLISHED', currentVersionId: 'v1', publishedVersionId: 'v1' }, versionId: 'v1', gates })).toEqual({
      action: 'noop',
      reasons: ['version_already_published'],
    });
    // Identical generated content hashes identically, so no new version is created either.
    const v = { headline: 'h', seoTitle: 's', metaDescription: 'm', intro: 'i', bodyMarkdown: 'b' };
    expect(versionContentHash(v)).toBe(versionContentHash({ ...v }));
    expect(versionContentHash(v)).not.toBe(versionContentHash({ ...v, bodyMarkdown: 'b2' }));
  });

  // Required test 19
  it('every publishable article carries source attribution', () => {
    expect(evaluatePublishGates(gateInput({ citations: 0 }))).toMatchObject({ allowed: false, reasons: ['missing_source_attribution'] });
    const md = renderArticleMarkdown(
      {
        headline: 'Zepto raises $25 million',
        seoTitle: 'Zepto raises $25 million in Series B',
        metaDescription: 'm',
        slug: 'zepto',
        intro: 'Zepto has new funding.',
        summary30s: ['Zepto raised $25 million.'],
        keyHighlights: ['Series B'],
        sections: [{ heading: 'What happened', kind: 'reported', paragraphs: ['According to YourStory, Zepto raised $25 million.'] }],
        whatThisMeans: 'Competition will intensify.',
        keyTakeaways: ['Funding continues'],
        faq: [],
        category: 'funding',
        tags: [],
        socialSummary: 's',
        internalLinkIds: ['company:zepto', 'story:invented-by-llm'],
      },
      { brand: 'LazyFounders', citations, links: [{ id: 'company:zepto', label: 'Zepto', href: '/company/zepto', kind: 'company' }] },
    );
    expect(md).toContain('## Sources');
    expect(md).toContain('1. [YourStory](https://yourstory.com/2026/09/zepto)');
    expect(md).toContain('2. [THE BRIDGE](https://thebridge.jp/2026/09/zepto) — Zepto raises $25 million (JA)');
    // Template markers the public page understands, and analysis clearly labelled.
    expect(md).toMatch(/### 30 SEC SUMMARY[\s\S]*### TABLE OF CONTENTS[\s\S]*### KEY HIGHLIGHTS/);
    expect(md).toContain('*LazyFounders analysis');
    // Only allow-listed internal links survive; invented ones are dropped.
    expect(md).toContain('[Zepto](/company/zepto)');
    expect(md).not.toContain('invented-by-llm');
    expect(renderSources([])).toBe('');
  });

  it('validators catch invented numbers, near-copies and bad SEO fields', () => {
    expect(checkNumbersGrounded('Zepto raised $25 million in 2021.', [ZEPTO_TEXT])).toEqual([]);
    expect(checkNumbersGrounded('Zepto raised $40 million.', [ZEPTO_TEXT])[0].check).toBe('numbers');
    const copied = 'Quick-commerce startup Zepto has raised $25 million in a Series B round led by Nexus Venture Partners, the company said on Tuesday.';
    expect(checkOriginality(copied, [ZEPTO_TEXT])[0]?.check).toBe('originality');
    expect(checkOriginality('Zepto secured fresh capital; Nexus led the round.', [ZEPTO_TEXT])).toEqual([]);
    expect(checkOriginality(`As the CEO put it, "We are building the fastest grocery delivery in India," he said.`, [ZEPTO_TEXT])).toEqual([]);
    expect(checkSeo({ headline: 'h', seoTitle: 'short', metaDescription: 'x', slug: 'Bad Slug' }).filter((i) => i.severity === 'error')).toHaveLength(3);
  });

  it('requires the article text to be in the publish language', () => {
    const ja = '東京を拠点とするAIスタートアップのサカナAIは、シリーズAラウンドで30億円の資金調達を実施したと発表した。同社は大規模言語モデルの研究開発を進めている。';
    expect(checkOutputLanguage(ZEPTO_TEXT, 'en')).toEqual([]);
    expect(checkOutputLanguage(ja, 'en').map((i) => i.check)).toContain('output_language');
    // An English story with one leaked source sentence still fails.
    expect(checkOutputLanguage(`${ZEPTO_TEXT}\n${ja.slice(0, 30)}`, 'en')).toHaveLength(1);
  });
});
