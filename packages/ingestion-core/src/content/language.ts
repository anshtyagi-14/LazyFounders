import { detectAll } from 'tinyld';

export interface LanguageResult {
  language: string;
  confidence: number;
  method: 'text' | 'markup' | 'source_default';
}

/** Primary subtag, lowercase: "ja-JP" -> "ja", "zh_Hans" -> "zh". */
export function primaryLanguage(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const m = /^([a-zA-Z]{2,3})/.exec(tag.trim());
  return m ? m[1].toLowerCase() : null;
}

/**
 * Detect the language of an article. Text statistics win when they are confident;
 * otherwise declared markup (<html lang>, JSON-LD inLanguage), then the source default.
 * Nothing here is specific to any country or language.
 */
export function detectLanguage(
  text: string,
  hints: { htmlLang?: string | null; declared?: string | null; sourceDefault?: string | null } = {},
): LanguageResult {
  const sample = text.slice(0, 4000);
  const markup = primaryLanguage(hints.declared) ?? primaryLanguage(hints.htmlLang);
  const candidates = sample.trim().length >= 40 ? detectAll(sample) : [];
  const top = candidates[0];

  if (top && top.accuracy >= 0.5) {
    // If markup agrees with any plausible candidate, trust markup (tinyld can confuse close languages).
    if (markup && markup !== top.lang && candidates.some((c) => c.lang === markup && c.accuracy >= 0.2)) {
      return { language: markup, confidence: 0.9, method: 'markup' };
    }
    return { language: top.lang, confidence: Math.min(1, top.accuracy), method: 'text' };
  }
  if (markup) return { language: markup, confidence: 0.7, method: 'markup' };
  const fallback = primaryLanguage(hints.sourceDefault) ?? 'und';
  return { language: fallback, confidence: fallback === 'und' ? 0 : 0.5, method: 'source_default' };
}
