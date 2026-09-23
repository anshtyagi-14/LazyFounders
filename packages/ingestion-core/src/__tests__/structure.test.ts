import { FakeLlmClient, ExtractionSchema } from '@lazyfounders/llm';
import { describe, expect, it } from 'vitest';
import { runExtraction, runTranslation, translationTarget } from '../stages/structure';
import { groundExtraction } from '../validate/grounding';
import { checkTranslation } from '../validate/checks';
import { extractNumbers } from '../validate/numbers';
import { SAKANA_TEXT, SAKANA_TRANSLATION, ZEPTO_TEXT, sakanaExtraction, zeptoExtraction } from './fixtures/facts';

const zeptoInput = { publisher: 'YourStory', url: 'https://yourstory.com/2026/09/zepto', language: 'en', headline: 'Zepto raises $25M', publishedAt: new Date('2026-09-20T08:00:00Z'), bodyText: ZEPTO_TEXT };

describe('structured extraction', () => {
  // Required test 7
  it('invalid LLM output cannot enter the pipeline (bounded repair, then INVALID)', async () => {
    const llm = new FakeLlmClient({ extract: () => ({ storyType: 'funding', companies: 'not-a-list' }) });
    const out = await runExtraction(llm, zeptoInput);
    expect(out.status).toBe('INVALID');
    expect(out.extraction).toBeNull();
    expect(llm.calls).toHaveLength(2); // original + exactly one repair attempt
  });

  it('a repaired second attempt is accepted', async () => {
    const llm = new FakeLlmClient({ extract: (_r, attempt) => (attempt === 1 ? { bad: true } : zeptoExtraction()) });
    const out = await runExtraction(llm, zeptoInput);
    expect(out.status).toBe('VALID');
    expect(out.attempts).toBe(2);
    expect(out).toMatchObject({ promptVersion: 'extract.v1', schemaVersion: 'extraction.v1', model: 'fake-model' });
  });

  // Required test 8
  it('missing facts stay null; hallucinated values are nulled or dropped', async () => {
    const hallucinated = zeptoExtraction({
      funding: { amount: 30_000_000, currency: 'USD', amountText: '$30 million', round: 'Series B', valuation: 200_000_000, leadInvestors: ['Sequoia'] },
      eventDate: null,
      investors: ['Nexus Venture Partners', 'Sequoia Capital'],
      claims: [
        ...zeptoExtraction().claims,
        { text: 'Zepto is valued at $200 million.', kind: 'fact', evidence: 'valued at $200 million', speaker: null, confidence: 0.8 },
      ],
    });
    const g = groundExtraction(hallucinated, ZEPTO_TEXT, 'Zepto raises $25M');
    expect(g.extraction.funding?.amount).toBeNull(); // "$30 million" is not in the source
    expect(g.extraction.funding?.amountText).toBeNull();
    expect(g.extraction.funding?.leadInvestors).toEqual([]);
    expect(g.extraction.investors).toEqual(['Nexus Venture Partners']);
    expect(g.extraction.eventDate).toBeNull();
    expect(g.extraction.claims.map((c) => c.text)).not.toContain('Zepto is valued at $200 million.');
    expect(g.report.droppedClaims[0].reason).toBe('evidence_not_in_source');

    // Schema requires explicit nulls: omitting a field is a validation error, not "unknown".
    const { funding: _omit, ...withoutFunding } = zeptoExtraction();
    expect(ExtractionSchema.safeParse(withoutFunding).success).toBe(false);
    expect(ExtractionSchema.safeParse({ ...zeptoExtraction(), funding: null }).success).toBe(true);
  });

  it('ungrounded extractions go to review, not downstream', async () => {
    const llm = new FakeLlmClient({ extract: () => zeptoExtraction({ claims: [{ text: 'x', kind: 'fact', evidence: 'text that does not exist anywhere', speaker: null, confidence: 1 }] }) });
    const out = await runExtraction(llm, zeptoInput);
    expect(out.status).toBe('NEEDS_REVIEW');
  });

  // Required test 9
  it('international articles keep original language, text and source provenance', async () => {
    const llm = new FakeLlmClient({ extract: () => sakanaExtraction() });
    const out = await runExtraction(llm, {
      publisher: 'THE BRIDGE',
      url: 'https://thebridge.jp/2026/09/sakana-ai-series-a',
      language: 'ja',
      headline: 'Sakana AI、シリーズAで30億円を調達',
      publishedAt: new Date('2026-09-21T01:00:00Z'),
      bodyText: SAKANA_TEXT,
    });
    expect(out.status).toBe('VALID');
    expect(out.extraction?.provenance).toEqual({ sourceUrl: 'https://thebridge.jp/2026/09/sakana-ai-series-a', sourcePublishedAt: '2026-09-21T01:00:00.000Z', language: 'ja' });
    // Claims stay in Japanese, grounded verbatim in the original text.
    expect(out.extraction?.claims[0].text).toMatch(/調達/);
    expect(llm.calls[0].user).toContain(SAKANA_TEXT);
    expect(translationTarget({ mode: 'if_different', targetLanguage: null }, 'ja', 'en')).toBe('en');
    expect(translationTarget({ mode: 'if_different', targetLanguage: null }, 'en', 'en')).toBeNull();
    expect(translationTarget({ mode: 'never', targetLanguage: null }, 'ja', 'en')).toBeNull();
  });
});

describe('translation', () => {
  it('normalises amounts across notations', () => {
    expect(extractNumbers('30億円').map((n) => n.value)).toEqual([3e9]);
    expect(extractNumbers('3 billion yen').map((n) => n.value)).toEqual([3e9]);
    expect(extractNumbers('$25 million / ₹200 crore / 2,500万ドル').map((n) => n.value)).toEqual([25e6, 2e9, 25e6]);
    expect(extractNumbers('Inc42 reports on B2B and 5G startups')).toEqual([]);
    expect(extractNumbers('同社は2023年に設立').map((n) => n.value)).toEqual([2023]);
  });

  // Required test 10
  it('preserves names, amounts and dates; mutations are rejected', async () => {
    const good = await runTranslation(new FakeLlmClient({ translate: () => SAKANA_TRANSLATION }), {
      extraction: sakanaExtraction(),
      headline: 'Sakana AI、シリーズAで30億円を調達',
      sourceLanguage: 'ja',
      targetLanguage: 'en',
    });
    expect(good.status).toBe('VALID');
    expect(good.protectedTokens).toEqual(expect.arrayContaining(['Sakana AI', 'グローバル・ブレイン']));

    const wrongAmount = { ...SAKANA_TRANSLATION, headline: 'Tokyo AI startup Sakana AI raises 30 billion yen in Series A' };
    const bad1 = await runTranslation(new FakeLlmClient({ translate: () => wrongAmount }), {
      extraction: sakanaExtraction(),
      headline: 'Sakana AI、シリーズAで30億円を調達',
      sourceLanguage: 'ja',
      targetLanguage: 'en',
    });
    expect(bad1.status).toBe('NEEDS_REVIEW');
    expect(bad1.issues.map((i) => i.check)).toContain('translation.numbers');

    const renamed = { ...SAKANA_TRANSLATION, summary: 'Sakana raised 3 billion yen in a Series A round led by Global Brain.' };
    const bad2 = await runTranslation(new FakeLlmClient({ translate: () => renamed }), {
      extraction: sakanaExtraction(),
      headline: 'Sakana AI、シリーズAで30億円を調達',
      sourceLanguage: 'ja',
      targetLanguage: 'en',
    });
    expect(bad2.status).toBe('NEEDS_REVIEW');
    expect(bad2.issues.map((i) => i.check)).toContain('translation.protected');

    const wrongYear = checkTranslation({
      protectedTokens: [],
      originalTexts: ['同社は2023年に設立された。'],
      translatedTexts: ['The company was founded in 2024.'],
    });
    expect(wrongYear.map((i) => i.check)).toContain('translation.numbers');
  });
});
