import { scrubForeignContacts } from '../content/contacts';
import { detectLanguage } from '../content/language';
import { contentHash, normalizeText } from '../content/sanitize';
import { TerminalError } from '../errors';
import type { StageHandler } from '../jobs/execute';
import { emitEvent } from '../jobs/outbox';
import { STAGES } from '../jobs/stages';
import type { PipelineDeps } from './context';

const MIN_CHARS = Number(process.env.MIN_ARTICLE_CHARS || 300);
// CJK scripts carry roughly 2-3x more information per character than Latin scripts.
const MIN_CHARS_CJK = Number(process.env.MIN_ARTICLE_CHARS_CJK || 120);
const CJK_CHARS = /[぀-ヿ㐀-鿿가-힯]/g;

/** Minimum body length that still carries a real article, independent of script. */
export function hasEnoughContent(text: string): boolean {
  const cjk = text.match(CJK_CHARS)?.length ?? 0;
  return cjk > text.length / 3 ? text.length >= MIN_CHARS_CJK : text.length >= MIN_CHARS;
}

/**
 * article.normalize: normalised text, content hash and language. Stops (without error)
 * on thin content or when the exact same version of this article was already processed.
 */
export function normalizeHandler(deps: PipelineDeps): StageHandler<{ sourceArticleId: string }> {
  return async (env) => {
    const sa = await deps.prisma.sourceArticle.findUnique({ where: { id: env.payload.sourceArticleId }, include: { source: true } });
    if (!sa) throw new TerminalError('SourceArticle not found', 'not_found');
    if (sa.state !== 'SCRAPED' && sa.state !== 'NORMALIZED') return;

    // Reporter bios and press contacts must never reach extraction or generation.
    const scrubbed = scrubForeignContacts(normalizeText(sa.bodyText ?? ''));
    if (scrubbed.removed.length) {
      deps.logger.info({ sourceArticleId: sa.id, removed: scrubbed.removed.length }, 'Removed third-party contact sentences from source text');
    }
    const text = scrubbed.text;
    if (!hasEnoughContent(text)) {
      await deps.prisma.sourceArticle.update({ where: { id: sa.id }, data: { state: 'REJECTED', stateReason: 'insufficient_content' } });
      return;
    }

    const hash = contentHash(text);
    const meta = (sa.structuredMeta ?? {}) as { htmlLang?: string; declaredLanguage?: string };
    const lang = detectLanguage(`${sa.headline ?? ''}\n${text}`, {
      htmlLang: meta.htmlLang,
      declared: meta.declaredLanguage,
      sourceDefault: sa.source.defaultLanguage,
    });

    await deps.prisma.$transaction(async (tx) => {
      const sameVersion = await tx.sourceArticle.findFirst({
        where: { canonicalFingerprint: sa.canonicalFingerprint, contentHash: hash, id: { not: sa.id } },
        select: { id: true },
      });
      if (sameVersion) {
        await tx.sourceArticle.update({
          where: { id: sa.id },
          data: { state: 'ARCHIVED', stateReason: `unchanged_version_of:${sameVersion.id}`, bodyText: text, language: lang.language, languageConfidence: lang.confidence },
        });
        return;
      }
      await tx.sourceArticle.update({
        where: { id: sa.id },
        data: { bodyText: text, contentHash: hash, language: lang.language, languageConfidence: lang.confidence, state: 'NORMALIZED' },
      });
      await emitEvent(tx, {
        stage: STAGES.EXTRACT,
        idempotencyKey: `article.extract:${sa.id}`,
        correlationId: env.correlationId,
        subjectType: 'source_article',
        subjectId: sa.id,
        payload: { sourceArticleId: sa.id },
      });
    });
  };
}
