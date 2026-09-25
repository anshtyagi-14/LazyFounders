/**
 * Publisher markup often carries junk in its author slot: template keys
 * ("list.metadata.agency"), profile URLs, emails, or the outlet's own name.
 * Returns a readable person name, or null when the value is not one.
 */
export function cleanAuthor(raw: string | null | undefined, publisher?: string | null): string | null {
  if (!raw) return null;
  let name = raw.replace(/\s+/g, ' ').trim();
  name = name.replace(/^by[\s:]+/i, '').trim();
  if (!name || name.length > 80) return null;
  if (!/\p{L}/u.test(name)) return null;
  if (/https?:\/\/|www\.|@/i.test(name)) return null;
  if (/[{}$<>]|\b(metadata|undefined|null)\b/i.test(name)) return null;
  // A dotted token with no spaces is a domain or a template path, not a name ("J.R." is fine).
  if (!name.includes(' ') && /\p{L}{2,}\.\p{L}{2,}/u.test(name)) return null;
  if (publisher && name.toLowerCase() === publisher.trim().toLowerCase()) return null;
  return name;
}
