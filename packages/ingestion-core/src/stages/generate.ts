import type { Prisma } from '@lazyfounders/database';
import {
  CATEGORIES,
  GeneratedArticleSchema,
  LlmOutputError,
  LlmRefusalError,
  SCHEMA_VERSIONS,
  generatePrompt,
  type GeneratedArticle,
  type LlmClient,
} from '@lazyfounders/llm';
import { scrubForeignContacts } from '../content/contacts';
import { renderArticleMarkdown, slugify, versionContentHash, type Citation, type InternalLink } from '../editorial/render';
import { TerminalError } from '../errors';
import type { StageHandler } from '../jobs/execute';
import { emitEvent } from '../jobs/outbox';
import { STAGES } from '../jobs/stages';
import type { PipelineConfig, PipelineDeps } from './context';
import type { StoryFacts } from './story';

export interface GenerationContext {
  storyType: string;
  facts: StoryFacts;
  claims: Array<{ id: string; text: string; kind: string; sources: string[]; translated: boolean; verified: boolean }>;
  citations: Citation[];
  background: Array<{ title: string; summary: string }>;
  links: InternalLink[];
}

export interface GeneratedVersion {
  article: GeneratedArticle;
  bodyMarkdown: string;
  contentHash: string;
  model: string;
  promptVersion: string;
}

/** LLM generation from verified facts only, rendered into the LazyFounders template. */
export async function generateVersion(llm: LlmClient, ctx: GenerationContext, config: PipelineConfig): Promise<GeneratedVersion> {
  const prompt = generatePrompt({
    brand: config.brand,
    publishLanguage: config.publishLanguage,
    storyType: ctx.storyType,
    facts: { ...ctx.facts, sourceArticleIds: undefined },
    claims: ctx.claims,
    sources: ctx.citations.map((c) => ({ publisher: c.publisher, url: c.url, publishedAt: c.publishedAt?.toISOString() ?? null })),
    background: ctx.background,
    internalLinkCandidates: ctx.links.map((l) => ({ id: l.id, label: l.label, kind: l.kind })),
    categories: CATEGORIES,
  });
  const res = await llm.structured({ task: 'generate', promptVersion: prompt.version, system: prompt.system, user: prompt.user, schema: GeneratedArticleSchema });
  // Facts can carry a quoted press contact; no third-party address is ever published.
  const article = { ...res.data, intro: scrubForeignContacts(res.data.intro).text, slug: slugify(res.data.slug || res.data.headline) };
  const bodyMarkdown = scrubForeignContacts(renderArticleMarkdown(article, { brand: config.brand, citations: ctx.citations, links: ctx.links })).text;
  return {
    article,
    bodyMarkdown,
    contentHash: versionContentHash({ headline: article.headline, seoTitle: article.seoTitle, metaDescription: article.metaDescription, intro: article.intro, bodyMarkdown }),
    model: res.model,
    promptVersion: prompt.version,
  };
}

/** The configured byline; null (credited to the default at render time) if the row is missing. */
async function defaultAuthorId(tx: Prisma.TransactionClient, slug: string): Promise<string | null> {
  const author = await tx.author.findUnique({ where: { slug }, select: { id: true } });
  return author?.id ?? null;
}

/** article.generate: build (or revise) the story's LazyFounders article as a new immutable version. */
export function generateHandler(deps: PipelineDeps): StageHandler<{ storyId: string; revision: string }> {
  return async (env) => {
    const story = await deps.prisma.story.findUnique({
      where: { id: env.payload.storyId },
      include: {
        claims: true,
        article: true,
        sources: {
          orderBy: { createdAt: 'asc' },
          include: {
            sourceArticle: {
              include: {
                source: true,
                translations: { where: { targetLanguage: deps.config.publishLanguage, status: 'VALID' }, orderBy: { createdAt: 'desc' }, take: 1 },
              },
            },
          },
        },
      },
    });
    if (!story) throw new TerminalError('Story not found', 'not_found');
    if (story.status !== 'ACTIVE') return; // waiting for an editor (possible duplicate / merged)
    const facts = story.facts as unknown as StoryFacts;

    const sources = story.sources
      .filter((s) => s.decision !== 'POSSIBLE_DUPLICATE')
      .sort((a, b) => (a.role === 'PRIMARY' ? -1 : b.role === 'PRIMARY' ? 1 : 0));
    const citations: Citation[] = sources.map((s, i) => ({
      position: i + 1,
      publisher: s.sourceArticle.source.name,
      url: s.sourceArticle.canonicalUrl ?? s.sourceArticle.finalUrl ?? s.sourceArticle.originalUrl,
      // Readers see this title in the Sources list: never show it in the source language.
      title: s.sourceArticle.language === deps.config.publishLanguage ? s.sourceArticle.headline : (s.sourceArticle.translations[0]?.headline ?? null),
      language: s.sourceArticle.language,
      publishedAt: s.sourceArticle.publishedAt,
      sourceArticleId: s.sourceArticle.id,
    }));
    const { background, links } = await loadContext(deps, story.id, facts);

    let generated: GeneratedVersion;
    try {
      generated = await generateVersion(
        deps.llm,
        {
          storyType: story.storyType,
          facts,
          claims: story.claims.map((c) => ({
            id: c.id,
            text: c.text,
            kind: c.kind,
            sources: c.sourceArticleIds.map((id) => citations.find((x) => x.sourceArticleId === id)?.publisher ?? 'source'),
            translated: c.translated,
            verified: c.verified,
          })),
          citations,
          background,
          links,
        },
        deps.config,
      );
    } catch (err) {
      if (!(err instanceof LlmOutputError || err instanceof LlmRefusalError)) throw err;
      deps.metrics?.llmValidationFailures.inc({ task: 'generate' });
      await deps.prisma.$transaction(async (tx) => {
        const article = story.article ?? (await tx.article.create({ data: { storyId: story.id, slug: `${slugify(story.headline)}-${story.id.slice(0, 6)}`, status: 'NEEDS_REVIEW', authorId: await defaultAuthorId(tx, deps.config.defaultAuthorSlug) } }));
        await tx.article.update({ where: { id: article.id }, data: { status: 'NEEDS_REVIEW' } });
        await tx.editorialAction.create({
          data: { articleId: article.id, actor: 'pipeline', action: 'generate_failed', fromStatus: article.status, toStatus: 'NEEDS_REVIEW', note: err.message.slice(0, 500) },
        });
      });
      return;
    }

    const primary = sources[0]?.sourceArticle;
    const imagePolicy = primary?.source.imagePolicy ?? 'none';
    const featuredImage =
      primary?.leadImage && imagePolicy !== 'none'
        ? { url: primary.leadImage, credit: primary.imageCredit ?? primary.source.name, sourceUrl: citations[0]?.url, publisher: primary.source.name, policy: imagePolicy }
        : null;

    await deps.prisma.$transaction(async (tx) => {
      let article = story.article;
      if (!article) {
        let slug = `${generated.article.slug}-${story.id.slice(0, 6)}`;
        if (await tx.article.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
        article = await tx.article.create({ data: { storyId: story.id, slug, status: 'GENERATED', authorId: await defaultAuthorId(tx, deps.config.defaultAuthorSlug) } });
      }
      const dup = await tx.articleVersion.findUnique({ where: { articleId_contentHash: { articleId: article.id, contentHash: generated.contentHash } } });
      if (dup) return; // identical content: no new version

      const last = await tx.articleVersion.findFirst({ where: { articleId: article.id }, orderBy: { version: 'desc' }, select: { version: true } });
      const g = generated.article;
      const version = await tx.articleVersion.create({
        data: {
          articleId: article.id,
          version: (last?.version ?? 0) + 1,
          contentHash: generated.contentHash,
          headline: g.headline,
          seoTitle: g.seoTitle,
          metaDescription: g.metaDescription,
          intro: g.intro,
          bodyMarkdown: generated.bodyMarkdown,
          keyTakeaways: g.keyTakeaways,
          whatThisMeans: g.whatThisMeans,
          faq: g.faq,
          socialSummary: g.socialSummary,
          internalLinks: links.filter((l) => g.internalLinkIds.includes(l.id)) as unknown as Prisma.InputJsonValue,
          featuredImage: (featuredImage ?? undefined) as Prisma.InputJsonValue | undefined,
          generator: { model: generated.model, promptVersion: generated.promptVersion, schemaVersion: SCHEMA_VERSIONS.generation, storyRevision: env.payload.revision },
        },
      });
      await tx.articleCitation.createMany({
        data: citations.map((c) => ({
          versionId: version.id,
          sourceArticleId: c.sourceArticleId,
          position: c.position,
          publisher: c.publisher,
          url: c.url,
          title: c.title,
          language: c.language,
          publishedAt: c.publishedAt,
        })),
      });
      await tx.article.update({
        where: { id: article.id },
        data: {
          currentVersionId: version.id,
          status: 'GENERATED',
          category: g.category,
          tags: g.tags.slice(0, 12),
          companies: facts.companies.map((c) => c.name).slice(0, 20),
        },
      });
      await tx.editorialAction.create({
        data: { articleId: article.id, versionId: version.id, actor: 'pipeline', action: 'generate', fromStatus: article.status, toStatus: 'GENERATED', note: `v${version.version}` },
      });
      await emitEvent(tx, {
        stage: STAGES.VALIDATE,
        idempotencyKey: `${STAGES.VALIDATE}:${version.id}`,
        correlationId: env.correlationId,
        subjectType: 'article_version',
        subjectId: version.id,
        payload: { articleId: article.id, versionId: version.id },
      });
    });
    deps.metrics?.articles.inc({ event: 'generated' });
  };
}

async function loadContext(deps: PipelineDeps, storyId: string, facts: StoryFacts): Promise<{ background: GenerationContext['background']; links: InternalLink[] }> {
  const companies = facts.companies.map((c) => c.name);
  const related = companies.length
    ? await deps.prisma.article.findMany({
        where: { status: 'PUBLISHED', publishedVersionId: { not: null }, storyId: { not: storyId }, companies: { hasSome: companies } },
        orderBy: { publishedAt: 'desc' },
        take: 5,
      })
    : [];
  const versions = related.length
    ? await deps.prisma.articleVersion.findMany({ where: { id: { in: related.map((r) => r.publishedVersionId!) } }, select: { id: true, headline: true, intro: true } })
    : [];
  const byId = new Map(versions.map((v) => [v.id, v]));

  const links: InternalLink[] = [];
  const withPages = new Set(related.flatMap((r) => r.companies));
  for (const c of companies) {
    if (withPages.has(c)) links.push({ id: `company:${slugify(c)}`, label: c, href: `/company/${slugify(c)}`, kind: 'company' });
  }
  if (facts.category) links.push({ id: `category:${facts.category}`, label: `More ${facts.category} news`, href: `/news/category/${facts.category}`, kind: 'category' });
  for (const r of related) {
    const v = byId.get(r.publishedVersionId!);
    if (v) links.push({ id: `story:${r.slug}`, label: v.headline, href: `/news/${r.slug}`, kind: 'story' });
  }
  const background = related
    .slice(0, 3)
    .map((r) => byId.get(r.publishedVersionId!))
    .filter((v): v is { id: string; headline: string; intro: string } => Boolean(v))
    .map((v) => ({ title: v.headline, summary: v.intro }));
  return { background, links };
}
