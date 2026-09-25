/**
 * Keep other people's contact details out of LazyFounders articles.
 *
 * Publisher pages end with reporter bios ("You can contact or verify outreach
 * from Tim by emailing tim.dechant@techcrunch.com"), press releases end with
 * media contacts, and the LLM happily carries either into a rewrite. A reader
 * who sees that address on lazyfounder.in thinks it is ours.
 *
 * `scrubForeignContacts` drops every sentence that carries an email address on a
 * domain we do not own, plus the stock "View Bio" style lines those bios come
 * with. It runs on source text before the LLM sees it, on generated text before
 * it is stored, and again when the public site renders an article, so stories
 * published before this existed are cleaned too. `checkForeignContacts` is the
 * publish-time backstop.
 */

/** Domains whose addresses may appear in an article (our own inboxes). */
export const OWN_EMAIL_DOMAINS = ['lazyfounder.in', 'blogy.in'] as const;

const EMAIL = /[A-Z0-9._%+-]+@((?:[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?\.)+[A-Z]{2,})/gi;
/** name [at] domain [dot] com, name(at)domain(dot)com */
const OBFUSCATED_EMAIL =
  /[A-Z0-9._%+-]+\s*[[(]\s*at\s*[\])]\s*((?:[A-Z0-9-]+\s*(?:[[(]\s*dot\s*[\])]|\.)\s*)+[A-Z]{2,})/gi;

/** Whole lines that only exist as part of an author bio box. */
const BIO_LINE = /^\s*(?:[-*]\s*)?(?:view|read|see)\s+(?:full\s+)?(?:bio|profile)\s*[.:]?\s*$/i;

function isOwnDomain(domain: string, allowed: readonly string[]): boolean {
  const d = domain.toLowerCase().replace(/\s*(?:[[(]\s*dot\s*[\])])\s*/g, '.').replace(/\s+/g, '');
  return allowed.some((a) => d === a || d.endsWith(`.${a}`));
}

/** Every email address in `text` whose domain is not one of ours. */
export function findForeignEmails(text: string, allowed: readonly string[] = OWN_EMAIL_DOMAINS): string[] {
  const out: string[] = [];
  for (const re of [EMAIL, OBFUSCATED_EMAIL]) {
    for (const m of text.matchAll(re)) if (!isOwnDomain(m[1], allowed)) out.push(m[0]);
  }
  return out;
}

function hasForeignEmail(text: string, allowed: readonly string[]): boolean {
  return findForeignEmails(text, allowed).length > 0;
}

// Sentence boundary: end punctuation followed by whitespace. The dots inside an
// email address are never followed by whitespace, so an address stays whole.
const SENTENCE_BREAK = /(?<=[.!?…。！？])\s+/;
// Markdown line prefixes that must survive when a line loses some sentences.
const LINE_PREFIX = /^(\s*(?:[-*+]\s+|\d+[.)]\s+|>\s*)*)/;

export interface ScrubResult {
  text: string;
  /** The sentences or lines that were dropped, for logging. */
  removed: string[];
}

/**
 * Remove every sentence containing a foreign email address, and bio-box lines.
 * Works on plain text and on Markdown: headings and list items that carry an
 * address are dropped whole; paragraphs lose only the offending sentences.
 */
export function scrubForeignContacts(text: string, allowed: readonly string[] = OWN_EMAIL_DOMAINS): ScrubResult {
  const removed: string[] = [];
  if (!text) return { text, removed };
  const lines = text.split('\n').flatMap((line): string[] => {
    if (BIO_LINE.test(line)) {
      removed.push(line.trim());
      return [];
    }
    if (!hasForeignEmail(line, allowed)) return [line];
    if (/^\s*#{1,6}\s/.test(line)) {
      removed.push(line.trim());
      return [];
    }
    const prefix = line.match(LINE_PREFIX)?.[1] ?? '';
    const kept = line
      .slice(prefix.length)
      .split(SENTENCE_BREAK)
      .filter((s) => {
        if (!hasForeignEmail(s, allowed)) return true;
        removed.push(s.trim());
        return false;
      });
    const rest = kept.join(' ').trim();
    return rest ? [prefix + rest] : [];
  });
  if (removed.length === 0) return { text, removed };
  return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), removed };
}

/** Publish-time check, same shape as the other validate/checks. */
export function checkForeignContacts(text: string, allowed: readonly string[] = OWN_EMAIL_DOMAINS) {
  const found = [...new Set(findForeignEmails(text, allowed))];
  return found.length
    ? [{ check: 'contacts', severity: 'error' as const, message: `Third-party email address in article: ${found.slice(0, 3).join(', ')}` }]
    : [];
}
