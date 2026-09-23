import {
  ExtractionSchema,
  LlmOutputError,
  LlmRefusalError,
  SCHEMA_VERSIONS,
  TranslationSchema,
  extractPrompt,
  translatePrompt,
  type Extraction,
  type LlmClient,
  type TranslationOutput,
} from '@lazyfounders/llm';
import { checkTranslation, hasErrors, type CheckIssue } from '../validate/checks';
import { groundExtraction, isUsableExtraction, type GroundingReport } from '../validate/grounding';

export interface ExtractionInput {
  publisher: string;
  url: string;
  language: string;
  headline: string | null;
  publishedAt: Date | null;
  bodyText: string;
}

export interface ExtractionOutcome {
  status: 'VALID' | 'INVALID' | 'NEEDS_REVIEW';
  /** Only present when status is VALID or NEEDS_REVIEW (grounded, never raw). */
  extraction: (Extraction & { provenance: { sourceUrl: string; sourcePublishedAt: string | null; language: string } }) | null;
  grounding: GroundingReport | null;
  errors: unknown;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  attempts: number;
}

const MAX_INPUT_CHARS = 60_000;

/**
 * Deterministic pre-processing -> LLM structured extraction (schema-constrained, one
 * repair retry) -> deterministic grounding against the source text.
 * Invalid output never produces an extraction: callers must stop the pipeline.
 */
export async function runExtraction(llm: LlmClient, input: ExtractionInput): Promise<ExtractionOutcome> {
  const prompt = extractPrompt({
    publisher: input.publisher,
    url: input.url,
    language: input.language,
    headline: input.headline,
    publishedAt: input.publishedAt?.toISOString() ?? null,
    // Long articles are cut at a paragraph boundary; facts are overwhelmingly in the first part.
    bodyText: truncateAtParagraph(input.bodyText, MAX_INPUT_CHARS),
  });
  const base = { promptVersion: prompt.version, schemaVersion: SCHEMA_VERSIONS.extraction };
  try {
    const res = await llm.structured({ task: 'extract', promptVersion: prompt.version, system: prompt.system, user: prompt.user, schema: ExtractionSchema });
    const grounded = groundExtraction(res.data, input.bodyText, input.headline);
    const usable = isUsableExtraction(grounded);
    return {
      ...base,
      status: usable.ok ? 'VALID' : 'NEEDS_REVIEW',
      extraction: {
        ...grounded.extraction,
        provenance: { sourceUrl: input.url, sourcePublishedAt: input.publishedAt?.toISOString() ?? null, language: input.language },
      },
      grounding: grounded.report,
      errors: usable.ok ? null : usable.reasons,
      model: res.model,
      attempts: res.attempts,
    };
  } catch (err) {
    if (err instanceof LlmOutputError || err instanceof LlmRefusalError) {
      return {
        ...base,
        status: 'INVALID',
        extraction: null,
        grounding: null,
        errors: { name: err.name, message: err.message, issues: err instanceof LlmOutputError ? err.issues : null },
        model: err.model,
        attempts: err instanceof LlmOutputError ? err.attempts : 1,
      };
    }
    throw err;
  }
}

export function truncateAtParagraph(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf('\n\n', max);
  return text.slice(0, cut > max * 0.6 ? cut : max);
}

export interface TranslationPolicy {
  mode: 'never' | 'if_different' | 'always';
  targetLanguage: string | null;
}

export function translationTarget(policy: TranslationPolicy | null, sourceLanguage: string, publishLanguage: string): string | null {
  const mode = policy?.mode ?? 'if_different';
  const target = policy?.targetLanguage ?? publishLanguage;
  if (mode === 'never') return null;
  if (mode === 'always') return target;
  return sourceLanguage === target ? null : target;
}

/** Names that must survive translation unchanged. */
export function protectedTokensFor(extraction: Extraction): string[] {
  const names = [
    ...extraction.companies.map((c) => c.name),
    ...extraction.people.map((p) => p.name),
    ...extraction.investors,
    ...extraction.products,
  ];
  return [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 1))];
}

export interface TranslationOutcome {
  status: 'VALID' | 'NEEDS_REVIEW';
  output: TranslationOutput | null;
  issues: CheckIssue[];
  protectedTokens: string[];
  model: string;
  promptVersion: string;
}

/**
 * Translate the structured facts (not the whole article): headline, summary, key facts
 * and claims. Names, amounts and dates are validated deterministically; any loss sends
 * the article to editorial review. Translated quotes are marked unverified downstream.
 */
export async function runTranslation(
  llm: LlmClient,
  input: { extraction: Extraction; headline: string; sourceLanguage: string; targetLanguage: string },
): Promise<TranslationOutcome> {
  const protectedTokens = protectedTokensFor(input.extraction);
  const claims = input.extraction.claims.map((c) => c.text);
  const prompt = translatePrompt({
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    headline: input.headline,
    summary: input.extraction.summary,
    keyFacts: input.extraction.keyFacts,
    claims,
    protectedTokens,
  });
  try {
    const res = await llm.structured({ task: 'translate', promptVersion: prompt.version, system: prompt.system, user: prompt.user, schema: TranslationSchema });
    const out = res.data;
    const issues: CheckIssue[] = [];
    if (out.claims.length !== claims.length || out.claims.some((c, i) => c.index !== i)) {
      issues.push({ check: 'translation.claims', severity: 'error', message: `Expected ${claims.length} claims in order, got ${out.claims.length}` });
    }
    issues.push(
      ...checkTranslation({
        protectedTokens,
        originalTexts: [input.headline, input.extraction.summary, ...input.extraction.keyFacts, ...claims],
        translatedTexts: [out.headline, out.summary, ...out.keyFacts, ...out.claims.map((c) => c.text)],
      }),
    );
    return { status: hasErrors(issues) ? 'NEEDS_REVIEW' : 'VALID', output: out, issues, protectedTokens, model: res.model, promptVersion: prompt.version };
  } catch (err) {
    if (err instanceof LlmOutputError || err instanceof LlmRefusalError) {
      return {
        status: 'NEEDS_REVIEW',
        output: null,
        issues: [{ check: 'translation.schema', severity: 'error', message: err.message }],
        protectedTokens,
        model: err.model,
        promptVersion: prompt.version,
      };
    }
    throw err;
  }
}
