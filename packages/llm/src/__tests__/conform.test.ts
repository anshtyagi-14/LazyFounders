import { describe, expect, it } from 'vitest';
import { toJSONSchema } from 'zod/v4';
import { conformToSchema } from '../client';
import { ExtractionSchema } from '../schemas';

const schema = toJSONSchema(ExtractionSchema) as Parameters<typeof conformToSchema>[1];

const base = {
  storyType: 'funding',
  category: 'Funding',
  summary: 'Acme raised $12 million.',
  companies: [{ name: 'Acme', role: 'subject' }],
  people: [],
  investors: ['Sequoia'],
  products: [],
  industries: [],
  locations: [],
  funding: { amount: '12000000', currency: 'USD', amountText: '$12 million', round: 'Series A', leadInvestors: ['Sequoia'] },
  deal: null,
  topics: [],
  keyFacts: [],
  claims: [],
  overallConfidence: 0.9,
};

describe('conformToSchema (Converse models without constrained decoding)', () => {
  it('fills omitted nullable keys with null and quoted numbers become numbers', () => {
    const out = conformToSchema(base, schema) as any;
    expect(out.companies[0].country).toBeNull();
    expect(out.eventDate).toBeNull();
    expect(out.funding.valuation).toBeNull();
    expect(out.funding.amount).toBe(12_000_000);
    expect(ExtractionSchema.safeParse(out).success).toBe(true);
  });

  it('maps unknown enum labels to "other" only when the enum has it', () => {
    const out = conformToSchema({ ...base, companies: [{ name: 'Acme', role: 'founder', country: null }] }, schema) as any;
    expect(out.companies[0].role).toBe('other');
    const cased = conformToSchema({ ...base, storyType: 'FUNDING' }, schema) as any;
    expect(cased.storyType).toBe('funding');
  });

  it('fills omitted required lists with [] but leaves real errors for zod', () => {
    const { people: _p, ...noPeople } = base;
    expect((conformToSchema(noPeople, schema) as any).people).toEqual([]);
    const { summary: _s, ...noSummary } = base;
    expect(ExtractionSchema.safeParse(conformToSchema(noSummary, schema)).success).toBe(false);
  });
});
