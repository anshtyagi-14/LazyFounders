/** Script-agnostic text normalisation for comparisons (works for Latin, CJK, Devanagari...). */
export function normalizeForCompare(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Character trigrams, the same measure Postgres pg_trgm uses for headline similarity. */
export function trigrams(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of normalizeForCompare(text).split(' ')) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function headlineSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  return jaccard(trigrams(a), trigrams(b));
}

export function cosine(a: number[] | null | undefined, b: number[] | null | undefined): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const LEGAL_SUFFIXES =
  /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|llc|llp|plc|gmbh|ag|sa|sas|sarl|bv|nv|pte|pvt|private|kk|oy|ab|as|spa|srl|pty|holdings?|group|technologies|technology|labs?)\b/g;
const CJK_LEGAL = /(株式会社|有限会社|合同会社|有限公司|股份有限公司|주식회사|\(株\)|（株）)/g;

/** "Zepto Pvt. Ltd." / "ZEPTO" / "株式会社Zepto" -> "zepto". */
export function normalizeEntity(name: string): string {
  return normalizeForCompare(name.replace(CJK_LEGAL, ' '))
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function entityOverlap(a: string[], b: string[]): number {
  const A = new Set(a.map(normalizeEntity).filter(Boolean));
  const B = new Set(b.map(normalizeEntity).filter(Boolean));
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n;
}
