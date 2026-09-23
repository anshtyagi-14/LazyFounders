import type { Extraction } from '@lazyfounders/llm';

export const ZEPTO_TEXT = [
  'Quick-commerce startup Zepto has raised $25 million in a Series B round led by Nexus Venture Partners, the company said on Tuesday.',
  'Existing investor Y Combinator also joined the round.',
  'The company was founded in 2021 by Aadit Palicha and Kaivalya Vohra.',
  '"We are building the fastest grocery delivery in India," said Aadit Palicha, co-founder and CEO of Zepto.',
].join('\n\n');

export function zeptoExtraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    storyType: 'funding',
    category: 'funding',
    summary: 'Zepto raised $25 million in a Series B round led by Nexus Venture Partners.',
    companies: [
      { name: 'Zepto', role: 'subject', country: 'IN' },
      { name: 'Nexus Venture Partners', role: 'investor', country: null },
    ],
    people: [{ name: 'Aadit Palicha', title: 'co-founder and CEO', company: 'Zepto' }],
    investors: ['Nexus Venture Partners', 'Y Combinator'],
    products: [],
    industries: ['quick commerce'],
    locations: [],
    funding: { amount: 25_000_000, currency: 'USD', amountText: '$25 million', round: 'Series B', valuation: null, leadInvestors: ['Nexus Venture Partners'] },
    deal: null,
    eventDate: null,
    topics: ['funding'],
    keyFacts: ['Zepto raised $25 million in a Series B round.'],
    claims: [
      {
        text: 'Zepto raised $25 million in a Series B round led by Nexus Venture Partners.',
        kind: 'fact',
        evidence: 'has raised $25 million in a Series B round led by Nexus Venture Partners',
        speaker: null,
        confidence: 0.95,
      },
      {
        text: 'We are building the fastest grocery delivery in India',
        kind: 'quote',
        evidence: 'We are building the fastest grocery delivery in India',
        speaker: 'Aadit Palicha',
        confidence: 0.9,
      },
    ],
    overallConfidence: 0.92,
    ...overrides,
  };
}

export const SAKANA_TEXT = [
  '東京を拠点とするAIスタートアップのSakana AIは、シリーズAラウンドで30億円を調達したと発表した。',
  'ラウンドはグローバル・ブレイン社がリードし、既存投資家も参加した。',
  '同社は2023年に設立され、調達資金を研究開発と採用に充てる。',
].join('\n\n');

export function sakanaExtraction(): Extraction {
  return {
    storyType: 'funding',
    category: 'ai',
    summary: 'Sakana AIはシリーズAラウンドで30億円を調達した。',
    companies: [
      { name: 'Sakana AI', role: 'subject', country: 'JP' },
      { name: 'グローバル・ブレイン', role: 'investor', country: 'JP' },
    ],
    people: [],
    investors: ['グローバル・ブレイン'],
    products: [],
    industries: ['AI'],
    locations: ['東京'],
    funding: { amount: 3_000_000_000, currency: 'JPY', amountText: '30億円', round: 'シリーズA', valuation: null, leadInvestors: ['グローバル・ブレイン'] },
    deal: null,
    eventDate: null,
    topics: ['AI'],
    keyFacts: ['Sakana AIはシリーズAで30億円を調達した。', '同社は2023年に設立された。'],
    claims: [
      { text: 'Sakana AIはシリーズAラウンドで30億円を調達した。', kind: 'fact', evidence: 'シリーズAラウンドで30億円を調達したと発表した', speaker: null, confidence: 0.95 },
      { text: '同社は2023年に設立された。', kind: 'fact', evidence: '同社は2023年に設立され', speaker: null, confidence: 0.9 },
    ],
    overallConfidence: 0.9,
  };
}

export const SAKANA_TRANSLATION = {
  headline: 'Tokyo AI startup Sakana AI raises 3 billion yen in Series A',
  summary: 'Sakana AI raised 3 billion yen in a Series A round led by グローバル・ブレイン (Global Brain).',
  keyFacts: ['Sakana AI raised 3 billion yen in its Series A.', 'The company was founded in 2023.'],
  claims: [
    { index: 0, text: 'Sakana AI raised 3 billion yen in a Series A round.' },
    { index: 1, text: 'The company was founded in 2023.' },
  ],
};
