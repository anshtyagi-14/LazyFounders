/**
 * Split prepared article markdown into two halves near its middle, so the
 * contact strip can sit between them. Prefers a section heading, then a plain
 * paragraph break, and never cuts inside one of the HTML boxes (summary, table
 * of contents, key highlights) the article page wraps in a <div>.
 *
 * Returns [body, ''] when there is nowhere safe to cut.
 */
export function splitBodyNearMiddle(body: string): [string, string] {
  const outsideBox = (i: number) => {
    const before = body.slice(0, i);
    return (before.match(/<div\b/g) ?? []).length === (before.match(/<\/div>/g) ?? []).length;
  };
  const candidates = (re: RegExp) =>
    [...body.matchAll(re)].map((m) => m.index).filter((i) => i > 0 && outsideBox(i));
  const mid = body.length / 2;

  // Headings first; then a blank line before ordinary prose (not a list item,
  // quote, table row or numbered item, which would split a block in two).
  for (const re of [/\n(?=#{2,} )/g, /\n\n(?=[^\s*\-+>|\d])/g]) {
    const found = candidates(re);
    if (found.length === 0) continue;
    const at = found.reduce((best, i) => (Math.abs(i - mid) < Math.abs(best - mid) ? i : best));
    return [body.slice(0, at), body.slice(at)];
  }
  return [body, ''];
}
