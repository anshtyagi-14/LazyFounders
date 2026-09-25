/**
 * End-to-end pipeline test against a real PostgreSQL (with pgvector + pg_trgm).
 * Network and LLM are faked; everything else (SQL, transactions, outbox, dedup queries,
 * advisory locks, publishing) is the production code path.
 *
 *   TEST_DATABASE_URL=postgresql://postgres@localhost:55432/lf_test npm run test:int -w @lazyfounders/ingestion-core
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@lazyfounders/database';
import { FakeEmbeddingClient, FakeLlmClient, type StructuredRequest } from '@lazyfounders/llm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { articleHtml, fakeResolver, fakeTransport, rss } from '../../src/__tests__/helpers';
import { SAKANA_TRANSLATION, sakanaExtraction, zeptoExtraction } from '../../src/__tests__/fixtures/facts';
import {
  DeadLetterService,
  DomainAllowlist,
  FsSnapshotStorage,
  InMemoryLock,
  InMemoryRateLimiter,
  InMemoryTransport,
  PrismaJobStore,
  RobotsService,
  STAGES,
  createStageHandlers,
  executeJob,
  parseSourceConfig,
  publishArticle,
  runPipelineInline,
  syncSourceConfigs,
  type PipelineDeps,
} from '../../src';

const DB = process.env.TEST_DATABASE_URL;
const suite = DB ? describe : describe.skip;

const T0 = Date.now();
const hoursAgo = (h: number) => new Date(T0 - h * 3600_000).toUTCString();

const YS_URL = 'https://yourstory.com/2026/09/zepto-raises-25-million-series-b';
const INC42_URL = 'https://inc42.com/buzz/zepto-bags-25-mn-series-b-nexus/';
const BRIDGE_URL = 'https://thebridge.jp/2026/09/sakana-ai-series-a';
const BLOCKED_URL = 'https://yourstory.com/2026/09/members-only-interview';
const LATE_URL = 'https://inc42.com/buzz/accel-joins-zepto-series-b/';
const SYND_URL = 'https://syndication.example/2026/09/zepto-series-b';

const YS_TEXT = [
  'Quick-commerce startup Zepto has raised $25 million in a Series B round led by Nexus Venture Partners, the company said on Tuesday.',
  'Existing investor Y Combinator also joined the round.',
  'The company was founded by Aadit Palicha and Kaivalya Vohra and delivers groceries from a network of dark stores.',
  '"We are building the fastest grocery delivery in India," said Aadit Palicha, co-founder and CEO of Zepto.',
  'The startup competes with several well-funded rivals in the fast-growing instant delivery segment across Indian metros.',
];
const INC42_TEXT = [
  'Zepto has bagged $25 Mn in its Series B funding round led by Nexus Venture Partners.',
  'Glade Brook Capital also participated in the round, valuing the startup at $200 Mn.',
  'The Mumbai-based company operates dark stores that promise deliveries within minutes of an order being placed.',
  'Industry watchers said investor appetite for quick commerce remains strong despite concerns over unit economics.',
];
const LATE_TEXT = [
  'Accel has joined the $25 Mn Series B round of quick-commerce startup Zepto alongside Nexus Venture Partners, according to regulatory filings.',
  'The filings show the investment was completed in two tranches over the past month.',
  'Zepto did not respond to a request for comment on the additional participation in its latest round.',
];
const BRIDGE_TEXT = [
  '東京を拠点とするAIスタートアップのSakana AIは、シリーズAラウンドで30億円を調達したと発表した。',
  'ラウンドはグローバル・ブレイン社がリードし、既存投資家も参加した。',
  '同社は2023年に設立され、調達資金を研究開発と採用に充てる。',
  '同社は自然界の仕組みに着想を得た手法で、効率的な基盤モデルの開発に取り組んでいる。',
  '国内では生成AI分野への投資が活発化しており、研究人材の獲得競争も激しさを増している。',
  '同社によれば、今後は海外の研究拠点との連携を強化し、企業向けの応用開発も進める方針だという。',
];

function sourceYaml(key: string, name: string, country: string, lang: string, domain: string, feed: string, adapter: string | null): string {
  return `key: ${key}
name: ${name}
country: ${country}
defaultLanguage: ${lang}
trustStatus: APPROVED
active: true
domains:
  primary: ${domain}
discovery:
  methods: [rss]
  feeds: [${feed}]
  crawlIntervalMinutes: 30
fetch:
  rateLimitPerMinute: 60
adapter: ${adapter ?? 'null'}
`;
}

function llm() {
  return new FakeLlmClient({
    extract: (req: StructuredRequest<unknown>) => {
      if (req.user.includes('Sakana')) return sakanaExtraction();
      if (req.user.includes('Accel has joined')) {
        return zeptoExtraction({
          investors: ['Accel', 'Nexus Venture Partners'],
          people: [],
          funding: { amount: 25_000_000, currency: 'USD', amountText: '$25 Mn', round: 'Series B', valuation: null, leadInvestors: [] },
          claims: [{ text: 'Accel joined the $25 Mn Series B round of Zepto.', kind: 'fact', evidence: 'Accel has joined the $25 Mn Series B round', speaker: null, confidence: 0.9 }],
        });
      }
      if (req.user.includes('Publisher: Inc42')) {
        return zeptoExtraction({
          investors: ['Nexus Venture Partners', 'Glade Brook Capital'],
          people: [],
          funding: { amount: 25_000_000, currency: 'USD', amountText: '$25 Mn', round: 'Series B', valuation: 200_000_000, leadInvestors: ['Nexus Venture Partners'] },
          claims: [
            { text: 'Zepto bagged $25 Mn in its Series B round led by Nexus Venture Partners.', kind: 'fact', evidence: 'bagged $25 Mn in its Series B funding round led by Nexus Venture Partners', speaker: null, confidence: 0.95 },
            { text: 'The round values Zepto at $200 Mn.', kind: 'fact', evidence: 'valuing the startup at $200 Mn', speaker: null, confidence: 0.85 },
          ],
        });
      }
      return zeptoExtraction();
    },
    translate: () => SAKANA_TRANSLATION,
    generate: (req: StructuredRequest<unknown>) =>
      req.user.includes('Sakana') ? sakanaArticle() : zeptoArticle(req.user.includes('Glade Brook'), req.user.includes('Accel')),
  });
}

function zeptoArticle(withValuation: boolean, withAccel = false) {
  return {
    headline: 'Zepto closes $25 million Series B led by Nexus Venture Partners',
    seoTitle: 'Zepto closes $25M Series B led by Nexus Venture Partners',
    metaDescription: 'Quick-commerce player Zepto has secured $25 million in Series B capital from Nexus Venture Partners. What the round signals for instant delivery.',
    slug: 'zepto-closes-series-b',
    intro: 'Zepto has secured fresh capital for its instant grocery business, with Nexus Venture Partners leading a $25 million Series B.',
    summary30s: ['Zepto secured $25 million in a Series B round.', 'Nexus Venture Partners led the investment.'],
    keyHighlights: ['Round size: $25 million', 'Lead investor: Nexus Venture Partners', ...(withValuation ? ['Reported valuation: $200 million'] : [])],
    sections: [
      {
        heading: 'What happened',
        kind: 'reported',
        paragraphs: [
          'According to YourStory, Zepto secured $25 million in its Series B, and Nexus Venture Partners led the investment while Y Combinator returned as an existing backer.',
          ...(withValuation ? ['Inc42 reports that Glade Brook Capital joined too, and that the deal puts the company at a $200 million valuation.'] : []),
          ...(withAccel ? ['Later filings cited by Inc42 show Accel also took part in the round.'] : []),
        ],
      },
    ],
    whatThisMeans: 'Investors still appear willing to back instant delivery, but the capital will likely go into a costly race for dark-store coverage.',
    keyTakeaways: ['Quick commerce keeps attracting venture money.', 'Nexus Venture Partners deepened its bet.'],
    faq: [{ question: 'Who led the round?', answer: 'Nexus Venture Partners led the Series B, according to the reports.' }],
    category: 'funding',
    tags: ['zepto', 'quick commerce', 'series b'],
    socialSummary: 'Zepto lands $25M Series B led by Nexus Venture Partners.',
    internalLinkIds: ['category:funding', 'story:made-up-link'],
  };
}

function sakanaArticle() {
  return {
    headline: 'Sakana AI raises 3 billion yen in Series A funding',
    seoTitle: 'Sakana AI raises 3 billion yen in Series A',
    metaDescription: 'Tokyo-based Sakana AI has raised 3 billion yen in a Series A round led by Global Brain. Here is what the funding means for Japanese AI startups.',
    slug: 'sakana-ai-series-a',
    intro: 'Tokyo-based Sakana AI has raised 3 billion yen in a Series A round, according to Japanese outlet THE BRIDGE.',
    summary30s: ['Sakana AI raised 3 billion yen.', 'Global Brain led the round.'],
    keyHighlights: ['Round size: 3 billion yen', 'Stage: Series A', 'Founded: 2023'],
    sections: [
      {
        heading: 'What happened',
        kind: 'reported',
        paragraphs: ['THE BRIDGE reports that Sakana AI closed a Series A worth 3 billion yen, led by Global Brain, with existing backers also taking part.'],
      },
      { heading: 'About the company', kind: 'background', paragraphs: ['The company was founded in 2023, according to the report.'] },
    ],
    whatThisMeans: 'Japanese AI startups are increasingly able to raise large early rounds at home, which may slow the drift of research talent abroad.',
    keyTakeaways: ['Large Series A rounds are reaching Japanese AI labs.'],
    faq: [],
    category: 'ai',
    tags: ['sakana ai', 'japan', 'ai'],
    socialSummary: 'Sakana AI raises 3 billion yen in a Series A led by Global Brain.',
    internalLinkIds: [],
  };
}

suite('v2 pipeline end-to-end (PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: DB } } });
  let deps: PipelineDeps;
  let handlers: ReturnType<typeof createStageHandlers>;
  let sources: Record<string, string>;
  let lateCoverage = false;

  const transport = fakeTransport({
    'https://yourstory.com/robots.txt': { body: 'User-agent: *\nAllow: /\n', headers: { 'content-type': 'text/plain' } },
    'https://inc42.com/robots.txt': { status: 404 },
    'https://thebridge.jp/robots.txt': { body: 'User-agent: *\nDisallow: /wp-admin/\n', headers: { 'content-type': 'text/plain' } },
    'https://yourstory.com/feed': () => ({
      body: rss([
        { link: `${YS_URL}?utm_source=rss`, title: 'Zepto raises $25M', pubDate: hoursAgo(3) },
        { link: BLOCKED_URL, title: 'Members only', pubDate: hoursAgo(2) },
      ]),
      headers: { 'content-type': 'application/rss+xml', etag: '"ys-1"' },
    }),
    'https://inc42.com/feed/': () => ({
      body: rss([
        { link: INC42_URL, title: 'Zepto Bags $25 Mn', pubDate: hoursAgo(2) },
        ...(lateCoverage ? [{ link: LATE_URL, title: 'Accel joins Zepto round', pubDate: hoursAgo(0.5) }] : []),
      ]),
      headers: { 'content-type': 'application/rss+xml' },
    }),
    'https://syndication.example/robots.txt': { status: 404 },
    'https://syndication.example/feed': {
      // Full text supplied in the feed; the article page itself is never requested.
      body: rss([{ link: SYND_URL, title: 'Zepto raises $25M in Series B', pubDate: hoursAgo(0.2), content: YS_TEXT.map((p) => `<p>${p}</p>`).join('') }]),
      headers: { 'content-type': 'application/rss+xml' },
    },
    [LATE_URL]: {
      body: articleHtml({ lang: 'en', headline: 'Accel Joins Zepto’s $25 Mn Series B', paragraphs: LATE_TEXT, canonical: LATE_URL, publisher: 'Inc42' }),
      headers: { 'content-type': 'text/html' },
    },
    'https://thebridge.jp/feed': { body: rss([{ link: BRIDGE_URL, title: 'Sakana AI、30億円調達', pubDate: hoursAgo(1) }]), headers: { 'content-type': 'application/rss+xml' } },
    [YS_URL]: {
      body: articleHtml({ lang: 'en', headline: 'Zepto raises $25M in Series B led by Nexus Venture Partners', paragraphs: YS_TEXT, canonical: YS_URL, publisher: 'YourStory', image: 'https://yourstory.com/img/zepto.jpg' }),
      headers: { 'content-type': 'text/html; charset=utf-8' },
    },
    // Tracking-param variant from the feed redirects to the clean URL.
    [`${YS_URL}?utm_source=rss`]: { status: 301, headers: { location: YS_URL } },
    [BLOCKED_URL]: { status: 403, body: 'Forbidden' },
    [INC42_URL]: {
      body: articleHtml({ lang: 'en', headline: 'Zepto Bags $25 Mn Series B From Nexus Venture Partners', paragraphs: INC42_TEXT, canonical: INC42_URL, publisher: 'Inc42' }),
      headers: { 'content-type': 'text/html' },
    },
    [BRIDGE_URL]: {
      body: articleHtml({ lang: 'ja', headline: 'Sakana AI、シリーズAで30億円を調達', paragraphs: BRIDGE_TEXT, canonical: BRIDGE_URL, publisher: 'THE BRIDGE' }),
      headers: { 'content-type': 'text/html' },
    },
  });

  const discover = async (tick: string) => {
    for (const id of Object.values(sources)) {
      await executeJob(
        { idempotencyKey: `discover.source:${id}:${tick}`, correlationId: `scan-${tick}`, stage: STAGES.DISCOVER, subjectType: 'source', subjectId: id, payload: { sourceId: id } },
        handlers[STAGES.DISCOVER],
        { store: new PrismaJobStore(prisma) },
      );
    }
    return runPipelineInline(prisma, handlers);
  };

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE editorial_actions, article_citations, article_versions, articles, story_claims, story_sources, stories, fact_extractions, translations, source_articles, raw_snapshots, url_aliases, outbox_events, pipeline_jobs, crawl_errors, crawl_runs, sitemap_states, sitemaps, slug_histories, url_states, source_domains, sources CASCADE',
    );
    const report = await syncSourceConfigs(prisma, [
      parseSourceConfig(sourceYaml('yourstory', 'YourStory', 'IN', 'en', 'yourstory.com', 'https://yourstory.com/feed', 'yourstory')),
      parseSourceConfig(sourceYaml('inc42', 'Inc42', 'IN', 'en', 'inc42.com', 'https://inc42.com/feed/', null)),
      parseSourceConfig(sourceYaml('thebridge', 'THE BRIDGE', 'JP', 'ja', 'thebridge.jp', 'https://thebridge.jp/feed', 'thebridge')),
    ]);
    expect(report.created).toHaveLength(3);
    const rows = await prisma.source.findMany();
    sources = Object.fromEntries(rows.map((r) => [r.registryKey!, r.id]));

    deps = {
      prisma,
      allowlist: DomainAllowlist.fromPrisma(prisma, 0),
      robots: new RobotsService(),
      rateLimiter: new InMemoryRateLimiter(),
      snapshots: new FsSnapshotStorage(mkdtempSync(join(tmpdir(), 'lf-snap-'))),
      llm: llm(),
      embeddings: new FakeEmbeddingClient(),
      config: { publishLanguage: 'en', brand: 'LazyFounders', siteUrl: 'https://lazyfounders.com', autoPublishEnabled: false, dedupWindowDays: 7, defaultAuthorSlug: 'tarun-mottlia' },
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      resolver: fakeResolver(),
      transport,
    };
    handlers = createStageHandlers(deps, new InMemoryLock());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('runs Indian (en) and Japanese (ja) sources through every stage and groups cross-publisher coverage', async () => {
    const run = await discover('t1');
    const dead = run.executed.filter((e) => e.outcome.kind === 'dead_letter');
    // Only the 403 page fails, terminally, without retries.
    expect(dead.map((d) => d.stage)).toEqual([STAGES.SCRAPE]);
    expect(dead[0].outcome).toMatchObject({ error: { code: 'http_blocked', retryable: false } });

    // One SourceArticle per real article; the ?utm_source variant collapsed into the canonical URL.
    const sas = await prisma.sourceArticle.findMany({ orderBy: { createdAt: 'asc' } });
    expect(sas.map((s) => s.canonicalUrl).sort()).toEqual([BRIDGE_URL, INC42_URL.replace(/\/$/, ''), YS_URL].sort());

    // Japanese article: original language, text and URL preserved; facts translated and recorded.
    const ja = sas.find((s) => s.canonicalUrl === BRIDGE_URL)!;
    expect(ja).toMatchObject({ language: 'ja', originalUrl: BRIDGE_URL, state: 'DEDUPED' });
    expect(ja.bodyText).toContain('30億円を調達');
    const tr = await prisma.translation.findFirstOrThrow({ where: { sourceArticleId: ja.id } });
    expect(tr).toMatchObject({ sourceLanguage: 'ja', targetLanguage: 'en', status: 'VALID', model: 'fake-model', promptVersion: 'translate.v1' });
    const fx = await prisma.factExtraction.findFirstOrThrow({ where: { sourceArticleId: ja.id } });
    expect(fx).toMatchObject({ validationStatus: 'VALID', promptVersion: 'extract.v1', schemaVersion: 'extraction.v1' });

    // Cross-publisher: YourStory + Inc42 cover one event -> one story, two sources.
    const stories = await prisma.story.findMany({ include: { sources: true, claims: true } });
    expect(stories).toHaveLength(2);
    const zepto = stories.find((s) => s.primaryEntity === 'Zepto')!;
    expect(zepto.sources.map((s) => s.decision).sort()).toEqual(['SAME_STORY', 'UNIQUE']);
    expect(zepto.sources.find((s) => s.decision === 'SAME_STORY')?.contributedFacts).toBe(true);
    const sakana = stories.find((s) => s.primaryEntity === 'Sakana AI')!;
    expect(sakana.claims.every((c) => c.translated && !c.verified)).toBe(true);
    // Original-language quote passed verbatim grounding -> verified; nothing else is.
    expect(zepto.claims.filter((c) => c.kind === 'quote').every((c) => c.verified)).toBe(true);

    // Articles generated in the template, validated, waiting for an editor (manual policy).
    const articles = await prisma.article.findMany({ include: { versions: { include: { citations: true }, orderBy: { version: 'asc' } } } });
    expect(articles).toHaveLength(2);
    for (const a of articles) expect(a.status).toBe('DRAFT');
    const za = articles.find((a) => a.storyId === zepto.id)!;
    // Both sources were grouped before generation ran; the second (material) revision produced
    // identical content, so the content-hash guard created no duplicate version.
    expect(za.versions).toHaveLength(1);
    const current = za.versions.find((v) => v.id === za.currentVersionId)!;
    expect(current.citations.map((c) => c.publisher).sort()).toEqual(['Inc42', 'YourStory']);
    expect(current.bodyMarkdown).toMatch(/### 30 SEC SUMMARY[\s\S]*### KEY HIGHLIGHTS[\s\S]*## What this means[\s\S]*## Sources/);
    expect(current.bodyMarkdown).toContain('$200 million');
    expect(current.bodyMarkdown).not.toContain('made-up-link');
    expect(current.featuredImage).toMatchObject({ url: 'https://yourstory.com/img/zepto.jpg', publisher: 'YourStory' });
    expect((current.validationReport as { issues: Array<{ severity: string }> }).issues.filter((i) => i.severity === 'error')).toEqual([]);
    const sa = articles.find((a) => a.storyId === sakana.id)!;
    const sv = sa.versions[0];
    expect(sv.citations[0]).toMatchObject({ publisher: 'THE BRIDGE', url: BRIDGE_URL, language: 'ja' });
    // Readers see the citation title: it is the English translation, never the Japanese headline.
    expect(sv.citations[0].title).toBe(tr.headline);
    expect(sv.bodyMarkdown).not.toMatch(/[぀-ヿ㐀-鿿]/);
    expect(sv.generator).toMatchObject({ model: 'fake-model', promptVersion: 'generate.v2' });
    // Every article is credited to the seeded default author.
    const author = await prisma.author.findUniqueOrThrow({ where: { slug: 'tarun-mottlia' } });
    for (const a of articles) expect(a.authorId).toBe(author.id);
  });

  it('an unchanged source creates no new work', async () => {
    const jobsBefore = await prisma.pipelineJob.count();
    const outboxBefore = await prisma.outboxEvent.count();
    const run = await discover('t2');
    expect(run.executed).toHaveLength(0);
    expect(await prisma.pipelineJob.count()).toBe(jobsBefore + 3); // only the three discover jobs themselves
    expect(await prisma.outboxEvent.count()).toBe(outboxBefore);
    const runs = await prisma.crawlRun.findMany({ where: { traceId: 'scan-t2' } });
    expect(runs.map((r) => r.status)).toEqual(['unchanged', 'unchanged', 'unchanged']);
  });

  it('editors approve and publish; re-publish is a no-op; unapproved cannot publish', async () => {
    const article = await prisma.article.findFirstOrThrow({ where: { story: { primaryEntity: 'Zepto' } } });
    const blocked = await publishArticle(prisma, { articleId: article.id, versionId: article.currentVersionId!, actor: 'editor@lf', mode: 'manual' }, deps.config);
    expect(blocked.action).toBe('blocked');
    expect((await prisma.article.findUniqueOrThrow({ where: { id: article.id } })).publishedVersionId).toBeNull();

    await prisma.article.update({ where: { id: article.id }, data: { status: 'APPROVED' } });
    const first = await publishArticle(prisma, { articleId: article.id, versionId: article.currentVersionId!, actor: 'editor@lf', mode: 'manual' }, deps.config);
    expect(first.action).toBe('publish');
    const again = await publishArticle(prisma, { articleId: article.id, versionId: article.currentVersionId!, actor: 'editor@lf', mode: 'manual' }, deps.config);
    expect(again.action).toBe('noop');

    const published = await prisma.article.findUniqueOrThrow({ where: { id: article.id }, include: { actions: { orderBy: { createdAt: 'asc' } } } });
    expect(published).toMatchObject({ status: 'PUBLISHED', publishedVersionId: article.currentVersionId });
    expect(published.actions.map((a) => a.action)).toEqual(expect.arrayContaining(['generate', 'validate', 'publish_blocked', 'publish', 'republish_noop']));
    expect(await prisma.articleVersion.count({ where: { articleId: article.id } })).toBe(1);
  });

  it('late coverage with material facts creates a new draft version while the published one stays live', async () => {
    const before = await prisma.article.findFirstOrThrow({ where: { story: { primaryEntity: 'Zepto' } } });
    lateCoverage = true;
    const run = await discover('t3');
    expect(run.executed.filter((e) => e.outcome.kind === 'dead_letter')).toEqual([]);
    const after = await prisma.article.findUniqueOrThrow({ where: { id: before.id }, include: { versions: { include: { citations: true } } } });
    expect(after.versions).toHaveLength(2);
    expect(after.publishedVersionId).toBe(before.publishedVersionId); // live version untouched
    expect(after.currentVersionId).not.toBe(before.publishedVersionId);
    expect(after.status).toBe('DRAFT'); // back to editorial review for the new version
    const v2 = after.versions.find((v) => v.id === after.currentVersionId)!;
    expect(v2.version).toBe(2);
    expect(v2.citations).toHaveLength(3);
    expect(v2.bodyMarkdown).toContain('Accel');
    // The previous version is still stored unchanged.
    const v1 = after.versions.find((v) => v.id === before.publishedVersionId)!;
    expect(v1.bodyMarkdown).not.toContain('Accel');
  });

  it('publisher-provided feed full text is used without fetching the page; syndicated copies are exact duplicates', async () => {
    await syncSourceConfigs(prisma, [
      parseSourceConfig(
        sourceYaml('syndication', 'Syndication Wire', 'IN', 'en', 'syndication.example', 'https://syndication.example/feed', null).replace(
          'rateLimitPerMinute: 60\n',
          'rateLimitPerMinute: 60\n  contentSource: feed\n',
        ),
      ),
    ]);
    const id = (await prisma.source.findUniqueOrThrow({ where: { registryKey: 'syndication' } })).id;
    await executeJob(
      { idempotencyKey: `discover.source:${id}:synd`, correlationId: 'scan-synd', stage: STAGES.DISCOVER, subjectType: 'source', subjectId: id, payload: { sourceId: id } },
      handlers[STAGES.DISCOVER],
      { store: new PrismaJobStore(prisma) },
    );
    await runPipelineInline(prisma, handlers);
    expect(transport.calls).not.toContain(SYND_URL);
    const sa = await prisma.sourceArticle.findFirstOrThrow({ where: { sourceId: id } });
    expect(sa.extractionMethod).toMatch(/^feed:/);
    expect(sa.publisher).toBe('Syndication Wire');
    expect(sa.state).toBe('ARCHIVED');
    expect(sa.stateReason).toMatch(/^exact_duplicate_of:/);
    expect(await prisma.story.count({ where: { primaryEntity: 'Zepto' } })).toBe(1);
  });

  it('dead-lettered jobs are inspectable and replay without duplicating rows', async () => {
    const jobs = new PrismaJobStore(prisma);
    const transportQ = new InMemoryTransport();
    const dlq = new DeadLetterService(jobs, transportQ);
    const dead = await dlq.list({});
    expect(dead).toHaveLength(1);
    expect(dead[0]).toMatchObject({ stage: STAGES.SCRAPE, status: 'DEAD_LETTER', lastError: { code: 'http_blocked' } });

    const saBefore = await prisma.sourceArticle.count();
    const replay = await dlq.replay(dead[0].id);
    expect(replay.replayed).toBe(true);
    const outcome = await executeJob(transportQ.enqueued[0].envelope, handlers[STAGES.SCRAPE], { store: jobs });
    expect(outcome.kind).toBe('dead_letter'); // still 403: fails again, terminally, no retry storm
    expect(await prisma.sourceArticle.count()).toBe(saBefore);
    expect((await jobs.getById(dead[0].id))?.replayCount).toBe(1);

    // Replaying a successful job is refused.
    const ok = await prisma.pipelineJob.findFirstOrThrow({ where: { status: 'SUCCEEDED' } });
    expect((await dlq.replay(ok.id)).replayed).toBe(false);
  });
});
