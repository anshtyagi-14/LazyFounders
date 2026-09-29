import { z } from 'zod/v4';

/**
 * Output schemas for every LLM task. They are sent to the model as structured-output
 * JSON schemas AND re-validated locally, so nothing unvalidated leaves this package.
 *
 * Rules shared by all schemas:
 *  - Every field is required; unknown values are `null` (never omitted, never guessed).
 *  - Numeric ranges (confidence 0..1 etc.) are checked by callers after parsing, because
 *    structured-output JSON schema support for numeric bounds is limited.
 */

export const SCHEMA_VERSIONS = {
  extraction: 'extraction.v1',
  translation: 'translation.v1',
  generation: 'generation.v1',
} as const;

/** Category enum shared with the public site (existing LazyFounders categories). */
export const CATEGORIES = [
  'startup',
  'funding',
  'technology',
  'ai',
  'business',
  'finance',
  'product',
  'founders',
  'policy',
  'health',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const STORY_TYPES = [
  'funding',
  'acquisition',
  'merger',
  'partnership',
  'product_launch',
  'ipo',
  'earnings',
  'layoffs',
  'leadership_change',
  'expansion',
  'policy',
  'research',
  'other',
] as const;
export type StoryType = (typeof STORY_TYPES)[number];

const CompanySchema = z.object({
  name: z.string().describe('Exact name as written in the source'),
  role: z.enum(['subject', 'investor', 'acquirer', 'target', 'partner', 'customer', 'competitor', 'other']),
  country: z.string().nullable().describe('ISO-3166 alpha-2 if stated in the source, else null'),
});

const PersonSchema = z.object({
  name: z.string(),
  title: z.string().nullable(),
  company: z.string().nullable(),
});

const FundingSchema = z.object({
  amount: z.number().nullable().describe('Numeric amount in major units, e.g. 25000000'),
  currency: z.string().nullable().describe('ISO-4217 code, e.g. USD, INR, JPY'),
  amountText: z.string().nullable().describe('The amount exactly as written in the source, e.g. "$25 million" or "10億円"'),
  round: z.string().nullable().describe('e.g. Seed, Series A, Pre-IPO'),
  valuation: z.number().nullable(),
  leadInvestors: z.array(z.string()),
});

const DealSchema = z.object({
  type: z.enum(['acquisition', 'merger', 'partnership', 'investment']),
  counterparty: z.string().nullable(),
  value: z.number().nullable(),
  currency: z.string().nullable(),
  valueText: z.string().nullable(),
});

const ClaimSchema = z.object({
  text: z.string().describe('The claim, written in the source language'),
  kind: z.enum(['fact', 'quote']),
  evidence: z.string().describe('A short VERBATIM span copied character-for-character from the source text that supports the claim'),
  speaker: z.string().nullable().describe('Only for quotes: who said it, else null'),
  confidence: z.number().describe('0..1'),
});

export const ExtractionSchema = z.object({
  storyType: z.enum(STORY_TYPES),
  category: z.enum(CATEGORIES),
  summary: z.string().describe('One or two neutral sentences describing the event, in the source language'),
  companies: z.array(CompanySchema),
  people: z.array(PersonSchema),
  investors: z.array(z.string()),
  products: z.array(z.string()),
  industries: z.array(z.string()),
  locations: z.array(z.string()),
  funding: FundingSchema.nullable(),
  deal: DealSchema.nullable(),
  eventDate: z.string().nullable().describe('YYYY-MM-DD of the event if stated, else null'),
  topics: z.array(z.string()),
  keyFacts: z.array(z.string()),
  claims: z.array(ClaimSchema),
  overallConfidence: z.number().describe('0..1'),
});
export type Extraction = z.infer<typeof ExtractionSchema>;
export type ExtractedClaim = z.infer<typeof ClaimSchema>;

export const TranslationSchema = z.object({
  headline: z.string().describe('plain text, no markdown'),
  summary: z.string(),
  keyFacts: z.array(z.string()),
  claims: z.array(z.object({ index: z.number(), text: z.string() })),
});
export type TranslationOutput = z.infer<typeof TranslationSchema>;

const SectionSchema = z.object({
  heading: z.string(),
  kind: z.enum(['reported', 'background', 'developing']),
  paragraphs: z.array(z.string()),
});

export const GeneratedArticleSchema = z.object({
  headline: z.string(),
  seoTitle: z.string().describe('<= 60 characters, plain text, no markdown'),
  metaDescription: z.string().describe('120-160 characters, plain text, no markdown'),
  slug: z.string().describe('lowercase-hyphenated, no dates'),
  intro: z.string().describe('2-3 sentence introduction, plain text, no markdown'),
  summary30s: z.array(z.string()).describe('3-5 bullets for the 30 SEC SUMMARY box'),
  keyHighlights: z.array(z.string()).describe('3-6 factual highlights'),
  sections: z.array(SectionSchema),
  whatThisMeans: z.string().describe('LazyFounders analysis. Opinion, clearly separated from facts. Must not introduce new facts.'),
  keyTakeaways: z.array(z.string()),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })),
  category: z.enum(CATEGORIES),
  tags: z.array(z.string()),
  socialSummary: z.string().describe('<= 280 characters, plain text, no markdown'),
  internalLinkIds: z.array(z.string()).describe('Only ids from the provided internal link candidates'),
});
export type GeneratedArticle = z.infer<typeof GeneratedArticleSchema>;
