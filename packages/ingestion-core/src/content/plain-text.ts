/**
 * Inline markdown that leaks into plain-text fields: the model italicises publication
 * names (*WIRED*), bolds key figures (**$33M**) or links a company, and publishers'
 * own descriptions sometimes carry the same syntax. Headlines, deks, meta descriptions
 * and excerpts are printed as text, so any of it shows up as literal asterisks.
 *
 * Only paired emphasis that hugs a word is unwrapped, so arithmetic ("5 * 3") and
 * snake_case identifiers survive. Asterisks left glued to a word edge after that (an
 * emphasis cut in half by truncation) are dropped too.
 */
export function stripInlineMarkdown(value: string): string {
  if (!value) return '';
  return (
    value
      // [text](url) -> text
      .replace(/\[([^\]\n]+)\]\((?:[^()\s]+)\)/g, '$1')
      // `code` -> code
      .replace(/`([^`\n]+)`/g, '$1')
      // **bold** / __bold__
      .replace(/\*\*(?=\S)([^*]+?)(?<=\S)\*\*/g, '$1')
      .replace(/(?<![\w_])__(?=\S)([^_]+?)(?<=\S)__(?![\w_])/g, '$1')
      // *italic* / _italic_
      .replace(/(?<![\w*])\*(?=[^\s*])([^*\n]+?)(?<=[^\s*])\*(?![\w*])/g, '$1')
      .replace(/(?<![\w_])_(?=[^\s_])([^_\n]+?)(?<=[^\s_])_(?![\w_])/g, '$1')
      // Orphans: an asterisk run opening or closing a word, e.g. "*WIRED has" after a clamp.
      .replace(/(^|\s)\*+(?=[^\s*])/g, '$1')
      .replace(/([^\s*])\*+(?=\s|$|[.,;:!?)"'’”])/g, '$1')
      // Heading and quote markers at the start.
      .replace(/^\s*(?:#{1,6}|>)\s+/, '')
  );
}
