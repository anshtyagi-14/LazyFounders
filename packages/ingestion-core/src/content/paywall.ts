import { load } from 'cheerio';

export interface PaywallResult {
  paywalled: boolean;
  reason: string | null;
}

const TEASER_PATTERNS = [
  /subscribe (now )?to (continue|read)/i,
  /this (article|story|content) is (only )?(available|for) (to )?(subscribers|members)/i,
  /(sign in|log in) to (continue|read)/i,
  /会員限定/,
  /有料会員/,
  /この記事は.*会員/,
  /abonnez-vous pour lire/i,
  /jetzt abonnieren/i,
  /suscr[ií]bete para (seguir|leer)/i,
  /assine para (continuar|ler)/i,
];

/**
 * Detect paywalled / teaser pages so they are skipped, never bypassed.
 * Signals: schema.org isAccessibleForFree=false, adapter selectors, or a short body
 * that ends in a subscription prompt.
 */
export function detectPaywall(
  html: string,
  bodyText: string,
  opts: { isAccessibleForFree: boolean | null; selectors?: string[]; sourcePaywall?: string },
): PaywallResult {
  if (opts.isAccessibleForFree === false) return { paywalled: true, reason: 'schema_isAccessibleForFree_false' };
  if (opts.selectors?.length) {
    const $ = load(html);
    const hit = opts.selectors.find((s) => $(s).length > 0);
    if (hit) return { paywalled: true, reason: `selector:${hit}` };
  }
  const tail = bodyText.slice(-600);
  if (bodyText.length < 1500 && TEASER_PATTERNS.some((p) => p.test(tail))) return { paywalled: true, reason: 'teaser_text' };
  if (opts.sourcePaywall === 'hard' && bodyText.length < 800) return { paywalled: true, reason: 'hard_paywall_source' };
  return { paywalled: false, reason: null };
}
