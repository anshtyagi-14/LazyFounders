import type { GeneratedArticle } from '@lazyfounders/llm';
import { sha256 } from '../net/url-canonical';

export interface Citation {
  position: number;
  publisher: string;
  url: string;
  title: string | null;
  language: string | null;
  publishedAt: Date | null;
  sourceArticleId: string | null;
}

export interface InternalLink {
  id: string;
  label: string;
  href: string;
  kind: 'company' | 'category' | 'story';
}

const esc = (s: string) => s.replace(/([\\[\]()])/g, '\\$1');

/** Deterministic Sources section. Never produced by the LLM. */
export function renderSources(citations: Citation[]): string {
  if (!citations.length) return '';
  const lines = citations
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((c) => {
      const title = c.title ? ` — ${esc(c.title)}` : '';
      const lang = c.language && c.language !== 'en' ? ` (${c.language.toUpperCase()})` : '';
      const date = c.publishedAt ? `, ${c.publishedAt.toISOString().slice(0, 10)}` : '';
      return `${c.position}. [${esc(c.publisher)}](${c.url})${title}${lang}${date}`;
    });
  return `## Sources\n\n${lines.join('\n')}`;
}

/**
 * Render the generated article into the markdown structure the public article page
 * already understands (the three ### boxes are wrapped by the page renderer).
 * Reported facts, background, developing information and analysis stay in separate,
 * clearly labelled sections.
 */
export function renderArticleMarkdown(a: GeneratedArticle, opts: { brand: string; citations: Citation[]; links: InternalLink[] }): string {
  const allowed = new Map(opts.links.map((l) => [l.id, l]));
  const links = a.internalLinkIds.map((id) => allowed.get(id)).filter((l): l is InternalLink => Boolean(l));

  const reported = a.sections.filter((s) => s.kind === 'reported');
  const background = a.sections.filter((s) => s.kind === 'background');
  const developing = a.sections.filter((s) => s.kind === 'developing');
  const sectionHeadings = [...reported, ...background].map((s) => s.heading);
  const toc = [...sectionHeadings, ...(developing.length ? ['Developing: what is not yet confirmed'] : []), `What this means`, 'Key takeaways', ...(a.faq.length ? ['FAQ'] : []), 'Sources'];

  const parts: string[] = [];
  parts.push(a.intro.trim());
  parts.push(`### 30 SEC SUMMARY\n\n${a.summary30s.map((s) => `- ${s}`).join('\n')}`);
  parts.push(`### TABLE OF CONTENTS\n\n${toc.map((t) => `- ${t}`).join('\n')}`);
  parts.push(`### KEY HIGHLIGHTS\n\n${a.keyHighlights.map((s) => `- ${s}`).join('\n')}`);
  for (const s of [...reported, ...background]) parts.push(`## ${s.heading}\n\n${s.paragraphs.join('\n\n')}`);
  if (developing.length) {
    parts.push(
      `## Developing: what is not yet confirmed\n\n> The following is reported but has not been independently confirmed.\n\n${developing
        .flatMap((s) => s.paragraphs)
        .join('\n\n')}`,
    );
  }
  parts.push(`## What this means\n\n*${opts.brand} analysis — our interpretation, not reported fact.*\n\n${a.whatThisMeans.trim()}`);
  parts.push(`## Key takeaways\n\n${a.keyTakeaways.map((s) => `- ${s}`).join('\n')}`);
  if (a.faq.length) parts.push(`## FAQ\n\n${a.faq.map((f) => `**${f.question.trim()}**\n\n${f.answer.trim()}`).join('\n\n')}`);
  if (links.length) parts.push(`## Related on ${opts.brand}\n\n${links.map((l) => `- [${esc(l.label)}](${l.href})`).join('\n')}`);
  parts.push(renderSources(opts.citations));
  return parts.filter(Boolean).join('\n\n');
}

/** Hash of everything a reader sees; identical content => identical hash => no new version. */
export function versionContentHash(v: {
  headline: string;
  seoTitle: string;
  metaDescription: string;
  intro: string;
  bodyMarkdown: string;
  featuredImage?: unknown;
}): string {
  return sha256(JSON.stringify([v.headline, v.seoTitle, v.metaDescription, v.intro, v.bodyMarkdown, v.featuredImage ?? null]));
}

export function slugify(input: string): string {
  return (
    input
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/, '') || 'story'
  );
}
