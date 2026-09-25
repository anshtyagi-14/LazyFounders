/**
 * Versioned prompts. Bump the version string whenever the wording changes: it is stored
 * with every output (FactExtraction.promptVersion, Translation.promptVersion,
 * ArticleVersion.generator) so any published sentence can be traced to the prompt that
 * produced it, and so replays of an old job never mix prompt generations.
 */

export const PROMPT_VERSIONS = {
  extract: 'extract.v1',
  translate: 'translate.v1',
  generate: 'generate.v2',
} as const;

export interface PromptPair {
  version: string;
  system: string;
  user: string;
}

export interface ExtractPromptInput {
  publisher: string;
  url: string;
  language: string;
  headline: string | null;
  publishedAt: string | null;
  bodyText: string;
}

export function extractPrompt(input: ExtractPromptInput): PromptPair {
  return {
    version: PROMPT_VERSIONS.extract,
    system: [
      'You extract structured facts from one news article for a newsroom database.',
      'Work only from the article text provided. Do not use outside knowledge, do not infer, do not guess.',
      'If a value is not stated in the text, return null (or an empty list). Never fill gaps.',
      `The article is written in language "${input.language}". Keep names, claims and evidence in that original language; do not translate.`,
      'Every claim must include "evidence": a short span copied exactly, character for character, from the article text. Claims without exact evidence will be discarded.',
      'Quotes: only mark kind="quote" for words the article presents as a direct quotation, and copy them exactly.',
      'Monetary amounts: copy the amount as written into amountText/valueText, and give the numeric value in major units with its ISO-4217 currency.',
      'Confidence is 0..1 and reflects how explicitly the text states the fact.',
    ].join('\n'),
    user: [
      `Publisher: ${input.publisher}`,
      `URL: ${input.url}`,
      `Headline: ${input.headline ?? '(none)'}`,
      `Published: ${input.publishedAt ?? '(unknown)'}`,
      '',
      '<article>',
      input.bodyText,
      '</article>',
    ].join('\n'),
  };
}

export interface TranslatePromptInput {
  sourceLanguage: string;
  targetLanguage: string;
  headline: string;
  summary: string;
  keyFacts: string[];
  claims: string[];
  protectedTokens: string[];
}

export function translatePrompt(input: TranslatePromptInput): PromptPair {
  return {
    version: PROMPT_VERSIONS.translate,
    system: [
      `You are a professional news translator from "${input.sourceLanguage}" to "${input.targetLanguage}".`,
      'Translate faithfully. Do not summarise, add, soften or embellish.',
      'Keep proper nouns, company names, product names, people names, monetary amounts, numbers and dates exact.',
      'Every token in the PROTECTED list must appear in your output unchanged (you may add a transliteration in parentheses after it).',
      'Return one translated claim per input claim, keeping the same index.',
    ].join('\n'),
    user: JSON.stringify(
      {
        protected: input.protectedTokens,
        headline: input.headline,
        summary: input.summary,
        keyFacts: input.keyFacts,
        claims: input.claims.map((text, index) => ({ index, text })),
      },
      null,
      2,
    ),
  };
}

export interface GeneratePromptInput {
  brand: string;
  publishLanguage: string;
  storyType: string;
  facts: unknown;
  claims: Array<{ id: string; text: string; kind: string; sources: string[]; translated: boolean; verified: boolean }>;
  sources: Array<{ publisher: string; url: string; publishedAt: string | null }>;
  background: Array<{ title: string; summary: string }>;
  internalLinkCandidates: Array<{ id: string; label: string; kind: string }>;
  categories: readonly string[];
}

/** "en" -> "English": models follow a language name far better than an ISO code. */
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function generatePrompt(input: GeneratePromptInput): PromptPair {
  return {
    version: PROMPT_VERSIONS.generate,
    system: [
      `You write original news stories for ${input.brand}, a publication about startups, founders, funding, technology and business.`,
      `Write every output field in ${languageName(input.publishLanguage)} only. Some facts may be in another language: translate names of roles, titles, products and descriptions into ${languageName(input.publishLanguage)}, and keep proper nouns (people, companies, funds) in their usual Latin-script form. Never copy non-${languageName(input.publishLanguage)} text into the output.`,
      'Tone: clear, factual, useful to founders and operators; no hype, no clickbait.',
      'You receive verified facts and claims, not the source articles. Use ONLY these facts. Never add numbers, names, dates or events that are not in the facts.',
      'Structure:',
      '- sections[kind="reported"]: what the sources report. Attribute claims ("according to <publisher>").',
      '- sections[kind="background"]: only context present in the provided background items.',
      '- sections[kind="developing"]: only if some claims are unconfirmed; say clearly they are unverified.',
      `- whatThisMeans: ${input.brand}'s analysis. It is opinion and must read as such; it must not state new facts.`,
      'Quotes: only quote claims with kind="quote" AND verified=true. Render translated or unverified quotes as reported speech, never inside quotation marks.',
      'Length follows the facts: a short story is fine. Do not pad, do not repeat, do not invent a year or a statistic.',
      'Do not reproduce sentences from any source; write original sentences.',
      `category must be one of: ${input.categories.join(', ')}.`,
      'internalLinkIds: choose only ids from the provided candidates that are genuinely relevant; an empty list is fine.',
      'Do not write a sources section, links or calls to action; the system adds them.',
    ].join('\n'),
    user: JSON.stringify(
      {
        storyType: input.storyType,
        facts: input.facts,
        claims: input.claims,
        sources: input.sources,
        background: input.background,
        internalLinkCandidates: input.internalLinkCandidates,
      },
      null,
      2,
    ),
  };
}
