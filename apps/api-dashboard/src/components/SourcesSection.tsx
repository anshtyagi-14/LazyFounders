import React from "react";
import type { PublicCitation } from "@/lib/articles";
import { gaAttrs } from "@/lib/ga-attrs";

const LANGUAGE_NAMES: Record<string, string> = { ja: "Japanese", zh: "Chinese", ko: "Korean", de: "German", fr: "French", es: "Spanish", pt: "Portuguese", hi: "Hindi", ar: "Arabic" };

/**
 * Source credits and backlinks. Every published article lists every publisher its facts
 * come from, with a direct link to the canonical source article. Anchor text is the
 * publisher's name and the original headline - never keyword-stuffed.
 */
export function SourcesSection({ citations, brand, articleId }: { citations: PublicCitation[]; brand: string; articleId?: string }) {
  if (citations.length === 0) return null;
  return (
    <section className="content-courtesy mt-12" aria-labelledby="sources-heading">
      <h2 id="sources-heading" className="text-xs uppercase tracking-[0.15em] text-teal-800 dark:text-teal-400 font-bold mb-4">
        Sources
      </h2>
      <ol className="space-y-3 list-decimal pl-5">
        {citations.map((c) => (
          <li key={c.position} className="text-sm text-slate-700 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-white">{c.publisher}</span>
            {c.language && c.language !== "en" ? (
              <span className="ml-2 inline-block rounded bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                {LANGUAGE_NAMES[c.language] ?? c.language}
              </span>
            ) : null}
            {c.publishedAt ? <span className="text-slate-500"> · {c.publishedAt.toISOString().slice(0, 10)}</span> : null}
            <br />
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              {...gaAttrs("source_select", { content_id: articleId, source_surface: "article_sources", position: c.position, item_name: c.publisher })}
              className="courtesy-link text-teal-800 dark:text-teal-400 hover:underline break-all"
            >
              {c.title ?? c.url}
            </a>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
        This story is an original summary drafted with AI by {brand} from the reporting listed above and checked by automated validation. Facts
        are attributed to their original publishers; sections marked as analysis are {brand}&apos;s. Where a source is in another
        language, facts were machine-translated and quotations are reported, not reproduced. Read the original coverage via the links, and
        see our <a href="/ai-policy" className="underline">AI policy</a> and <a href="/corrections" className="underline">corrections policy</a>.
      </p>
    </section>
  );
}
