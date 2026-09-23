/**
 * Numeric fact extraction used to check that numbers survive translation and that
 * generated articles only contain numbers backed by source facts. Understands digit
 * grouping, decimals and scale words across several languages (million, crore, lakh,
 * 万, 億, 兆, Mio, milliard...), so "$25 million", "25M" and "2,500万ドル" normalise
 * to comparable values.
 */
const SCALE_WORDS: Array<[RegExp, number]> = [
  [/^(k|thousand|mil|tausend)$/i, 1e3],
  [/^(lakh|lakhs|lac)$/i, 1e5],
  [/^(m|mn|mln|million|millions|mio|millón|millones|milhão|milhões|millions?)$/i, 1e6],
  [/^(crore|crores|cr)$/i, 1e7],
  [/^(b|bn|billion|billions|mrd|milliarden?|milliard|milliards|bilhão|bilhões|mil millones)$/i, 1e9],
  [/^(t|tn|trillion|trillions)$/i, 1e12],
];
const CJK_SCALE: Record<string, number> = { 万: 1e4, 萬: 1e4, 億: 1e8, 亿: 1e8, 兆: 1e12, 千: 1e3, 만: 1e4, 억: 1e8, 조: 1e12 };

// Digits glued to Latin letters (Inc42, B2B, 5G) are names, not quantities.
const NUMBER_RE = /(?<![A-Za-z0-9.,])(\d{1,3}(?:[,，]\d{3})+|\d+)(?:[.．](\d+))?(\s*)([万萬億亿兆千만억조]|[a-zA-Zá-úÁ-Ú]+)?/g;

export interface NumberToken {
  raw: string;
  value: number;
}

export function extractNumbers(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  const normalized = text.normalize('NFKC');
  for (const m of normalized.matchAll(NUMBER_RE)) {
    const intPart = m[1].replace(/[,，]/g, '');
    let value = Number(`${intPart}${m[2] ? '.' + m[2] : ''}`);
    if (!Number.isFinite(value)) continue;
    const unit = m[4];
    if (unit) {
      if (CJK_SCALE[unit]) value *= CJK_SCALE[unit];
      else {
        const scale = SCALE_WORDS.find(([re]) => re.test(unit));
        if (scale) value *= scale[1];
        // "5G", "4K", "3D": letters glued to the digits form a name, not a quantity.
        else if (m[3] === '') continue;
      }
    }
    out.push({ raw: m[0].trim(), value });
  }
  return out;
}

/**
 * Same number? Small integers (years, counts, percentages) must match exactly; large
 * amounts may differ by rounding ("$25.3 million" vs 25,312,000) up to 0.1%.
 */
export function sameNumber(a: number, b: number): boolean {
  if (a === b) return true;
  if (Math.max(Math.abs(a), Math.abs(b)) < 100_000) return false;
  return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 0.001;
}

export function valueSet(texts: Array<string | null | undefined>): number[] {
  return texts.flatMap((t) => (t ? extractNumbers(t).map((n) => n.value) : []));
}

/** Numbers in `candidate` not found among `allowed` (see sameNumber). Tiny integers are ignored. */
export function unsupportedNumbers(candidate: string, allowed: number[], opts: { ignoreBelow?: number } = {}): NumberToken[] {
  const ignoreBelow = opts.ignoreBelow ?? 11;
  return extractNumbers(candidate).filter((n) => !(Number.isInteger(n.value) && n.value < ignoreBelow) && !allowed.some((a) => sameNumber(a, n.value)));
}
