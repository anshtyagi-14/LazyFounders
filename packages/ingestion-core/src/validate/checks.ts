import { normalizeForCompare } from '../dedup/similarity';
import { extractNumbers, sameNumber, unsupportedNumbers, valueSet } from './numbers';
import { normalizeForEvidence } from './grounding';
import { detectLanguage } from '../content/language';

export interface CheckIssue {
  check: string;
  severity: 'error' | 'warning';
  message: string;
}

const CJK = /[぀-ヿ㐀-鿿가-힯]/;

/** Remove quoted passages; quoting a source verbatim (with attribution) is allowed. */
function stripQuotes(text: string): string {
  return text.replace(/"[^"]{0,600}"|“[^”]{0,600}”|「[^」]{0,600}」/g, ' ');
}

/**
 * Longest run of consecutive words (or 1 char per token for CJK) shared with any source.
 * Used to reject near-copies: a LazyFounders article must be an original synthesis.
 */
export function longestSharedRun(generated: string, sources: string[]): number {
  const tokenize = (t: string) => {
    const n = normalizeForCompare(t);
    return CJK.test(n) ? [...n.replace(/\s+/g, '')] : n.split(' ').filter(Boolean);
  };
  const gen = tokenize(stripQuotes(generated));
  let best = 0;
  for (const src of sources) {
    const s = tokenize(src);
    if (!s.length || !gen.length) continue;
    // Index source token positions, then extend matches greedily.
    const index = new Map<string, number[]>();
    s.forEach((tok, i) => {
      const list = index.get(tok);
      if (list) list.push(i);
      else index.set(tok, [i]);
    });
    for (let i = 0; i < gen.length; i++) {
      for (const j of index.get(gen[i]) ?? []) {
        let k = 0;
        while (i + k < gen.length && j + k < s.length && gen[i + k] === s[j + k]) k++;
        if (k > best) best = k;
      }
      if (best > 200) return best;
    }
  }
  return best;
}

export function checkOriginality(generated: string, sources: string[]): CheckIssue[] {
  const run = longestSharedRun(generated, sources);
  const anyCjk = sources.some((s) => CJK.test(s));
  const limit = anyCjk ? 40 : 12;
  return run > limit
    ? [{ check: 'originality', severity: 'error', message: `Shares a ${run}-token verbatim run with a source (limit ${limit})` }]
    : [];
}

export function checkNumbersGrounded(generated: string, factTexts: Array<string | null | undefined>): CheckIssue[] {
  const allowed = valueSet(factTexts);
  const bad = unsupportedNumbers(generated, allowed);
  return bad.length
    ? [{ check: 'numbers', severity: 'error', message: `Numbers not supported by facts: ${[...new Set(bad.map((b) => b.raw))].slice(0, 10).join(', ')}` }]
    : [];
}

export interface SeoFields {
  headline: string;
  seoTitle: string;
  metaDescription: string;
  slug: string;
}

export function checkSeo(f: SeoFields): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const err = (check: string, message: string) => issues.push({ check, severity: 'error', message });
  const warn = (check: string, message: string) => issues.push({ check, severity: 'warning', message });
  if (!f.headline.trim()) err('seo.headline', 'Headline missing');
  if (f.seoTitle.length < 15 || f.seoTitle.length > 70) err('seo.title', `SEO title length ${f.seoTitle.length} (15-70)`);
  else if (f.seoTitle.length > 60) warn('seo.title', `SEO title ${f.seoTitle.length} chars (> 60)`);
  if (f.metaDescription.length < 70 || f.metaDescription.length > 180) err('seo.meta', `Meta description length ${f.metaDescription.length} (70-180)`);
  else if (f.metaDescription.length < 120 || f.metaDescription.length > 160) warn('seo.meta', `Meta description ${f.metaDescription.length} chars (120-160 ideal)`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.slug) || f.slug.length > 90) err('seo.slug', `Invalid slug "${f.slug}"`);
  return issues;
}

const UNSAFE_PATTERNS: Array<[RegExp, string]> = [
  [/<\s*(script|iframe|object|embed|style)\b/i, 'raw HTML/script in body'],
  [/javascript:/i, 'javascript: URL'],
  [/\b(guaranteed returns|get rich quick|100% risk[- ]free)\b/i, 'financial promotion language'],
];

export function checkSafety(text: string): CheckIssue[] {
  return UNSAFE_PATTERNS.filter(([re]) => re.test(text)).map(([, m]) => ({ check: 'safety', severity: 'error' as const, message: m }));
}

export interface TranslationCheckInput {
  protectedTokens: string[];
  originalTexts: string[];
  translatedTexts: string[];
}

/**
 * A translation is valid when every protected token (names, product names, amounts as
 * written) is still present and every number in the original survives with the same
 * value (scale words and 万/億 notation are normalised before comparing).
 */
export function checkTranslation(input: TranslationCheckInput): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const translated = normalizeForEvidence(input.translatedTexts.join('\n'));
  const missing = input.protectedTokens.filter((t) => t.trim() && !translated.includes(normalizeForEvidence(t)));
  if (missing.length) issues.push({ check: 'translation.protected', severity: 'error', message: `Protected tokens missing: ${missing.slice(0, 10).join(', ')}` });

  const originalValues = input.originalTexts.flatMap((t) => extractNumbers(t).map((n) => n.value));
  const translatedValues = valueSet(input.translatedTexts);
  const lost = originalValues.filter(
    (v) => !(Number.isInteger(v) && v < 11) && !translatedValues.some((x) => sameNumber(x, v)),
  );
  if (lost.length) issues.push({ check: 'translation.numbers', severity: 'error', message: `Numbers changed or lost: ${[...new Set(lost)].slice(0, 10).join(', ')}` });

  const introduced = unsupportedNumbers(input.translatedTexts.join('\n'), originalValues);
  if (introduced.length) {
    issues.push({ check: 'translation.numbers', severity: 'error', message: `Numbers introduced by translation: ${introduced.map((n) => n.raw).slice(0, 10).join(', ')}` });
  }
  return issues;
}

// Scripts that never belong in an English story (proper nouns are written in Latin script).
const NON_LATIN = /[Ѐ-ӿ֐-ۿऀ-෿฀-໿぀-ヿ㐀-鿿가-힯]/gu;

/**
 * The reader-facing text must be in the publish language: the whole text is detected, and for
 * a Latin-script target any run of non-Latin characters (a leaked source sentence or name) fails.
 */
export function checkOutputLanguage(text: string, target: string): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const detected = detectLanguage(text);
  if (detected.method === 'text' && detected.language !== target) {
    issues.push({ check: 'output_language', severity: 'error', message: `Article text reads as "${detected.language}", expected "${target}"` });
  }
  if (target === 'en') {
    const foreign = text.match(NON_LATIN)?.length ?? 0;
    if (foreign >= 5) issues.push({ check: 'output_language', severity: 'error', message: `${foreign} non-Latin characters in the article text` });
  }
  return issues;
}

export function hasErrors(issues: CheckIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
