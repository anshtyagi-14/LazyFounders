# LazyFounders news pipeline (v2)

The v2 pipeline collects startup, funding, technology and business news from trusted sources in any country and language. It turns each event into one original LazyFounders story with full source attribution. It runs alongside the legacy pipeline behind feature flags until cutover.

```
Trusted sources (sources/**.yaml -> Source registry)
  -> discover.source    conditional GET of feeds/sitemaps, change detection, per-source lock
  -> article.scrape     robots + rate limit + SSRF-safe fetch (or publisher feed text) -> immutable snapshot -> extraction chain
  -> article.normalize  normalised text, content hash, language, thin/duplicate-version checks
  -> article.extract    Claude structured extraction on the ORIGINAL language + deterministic grounding
  -> article.translate  (only if needed) facts translated, names/amounts/dates validated
  -> story.dedupe       URL identity -> content hash -> event key -> headline trigram -> embeddings
  -> article.generate   LazyFounders template from verified facts only, deterministic Sources section
  -> article.validate   numbers grounded, originality, SEO, safety, attribution
  -> editorial review   DRAFT / NEEDS_REVIEW -> APPROVED (manual by default)
  -> article.publish    gated, idempotent, versioned publish -> public site (JSON-LD, citations, backlinks)
```

## Where things live

| Path | What |
|---|---|
| `packages/database` | Single Prisma schema and migrations. Generates the service client and the dashboard client. |
| `packages/llm` | Claude on Bedrock (`@anthropic-ai/bedrock-sdk`), versioned prompts, zod output schemas, `FakeLlmClient`. |
| `packages/ingestion-core` | Framework-free pipeline code: net safety, registry, discovery, jobs (outbox, workers, DLQ), content extraction, dedup, validation, editorial rules, stage handlers, runtime bootstrap, CLIs. |
| `sources/<cc>/<key>.yaml` | Trusted Source Registry: one file per publisher. |
| `apps/*-service` | Deployables. Each runs the v2 stages it is given, plus its legacy worker until cutover. |
| `apps/api-dashboard` | Public site (published versions only), editorial review, source registry admin, jobs and dead letters. |

## Setup

1. Copy `.env.example` to `.env` and fill it in. At minimum you need `DATABASE_URL`, `REDIS_URL`, `EDITOR_USERS` (or `ADMIN_USER`/`ADMIN_PASSWORD`), `INTERNAL_API_TOKEN`, and the AWS credentials for Bedrock.
2. Run `npm install`, then `npm run db:generate`.
3. Run the database migrations (see [Migrations](#migrations)).
4. Run `npm run sources:validate`, then `npm run sources:sync`.
5. Approve and activate sources (see [Onboarding a source](#onboarding-a-source)).
6. Set `PIPELINE_V2_ENABLED=true` and start the services with `npm run dev:all` or `docker compose up`.

Redis 6.2+ is recommended; docker-compose ships Redis 7. PostgreSQL needs the `vector` and `pg_trgm` extensions; the `pgvector/pgvector` image has both.

## Migrations

The repository used `prisma db push` and had no migration history. The history is now in `packages/database/prisma/migrations`:

| Migration | What |
|---|---|
| `0_init` | The schema as it was before v2 (baseline). |
| `20260922000000_pipeline_v2` | Registry fields, jobs and outbox, snapshots, source articles, translations, extractions, stories, versioned articles, citations, the editorial audit trail, and the `pg_trgm` extension and index. |
| `20260922000100_legacy_article_backfill` | Copies every legacy `OriginalContent` into `Article` + `ArticleVersion` as PUBLISHED, with a citation to its source, so the site keeps serving existing stories. |

**Existing database** (was managed with `db push`):

1. Back up the database first.
2. Run `npm run db:baseline`. This marks `0_init` as already applied.
3. Run `npm run db:migrate`.

**New database:** run `npm run db:migrate`.

## Onboarding a source

1. Add `sources/<country>/<key>.yaml`. Copy an existing file; the schema is in `packages/ingestion-core/src/registry/source-config.ts`. It covers:
   - country and language settings
   - feeds and sitemaps
   - crawl interval and rate limit
   - `contentSource`: `page`, `feed` or `page_then_feed`
   - `renderPolicy`, translation policy, publishing policy, image policy and paywall
2. Run `npm run sources:validate`, then `npm run sources:sync`. New sources start as PENDING and inactive.
3. Run `npm run sources:verify -- <key>`. This is a read-only probe. It reports:
   - robots.txt status and crawl-delay
   - whether each feed or sitemap parses, how many entries it has and the newest date
   - an extraction of one sample article: method, text length, detected language and paywall status
4. Review the publisher's robots.txt and terms. Then approve and activate the source in **Admin → Trusted Sources**. You can also set `trustStatus: APPROVED` and `active: true` in the YAML before the first sync; later syncs never re-approve a source that an editor changed.
5. Optional: write an adapter in `packages/ingestion-core/src/registry/adapters/index.ts` (or call `registerAdapter`). Only needed when the generic chain (JSON-LD → OpenGraph → Readability) gets a site wrong. The core pipeline never changes.

Country and language are plain data; nothing is specific to India or Japan. Some notes on specific sources:

- **YourStory** returns 403 to crawlers on article pages but publishes full text in its RSS feed. It uses `contentSource: feed`, so the article page is never requested.
- **THE BRIDGE** (ja) works with the default page extraction. This was checked live with `sources:verify`.
- **Paywalled items** are detected (`isAccessibleForFree=false`, adapter selectors, teaser text) and skipped. They are never bypassed.

## Scheduling

`discovery-service` runs `DiscoveryScheduler` every `SCHEDULER_TICK_MS`:

- For every APPROVED, active source that is due by `crawlIntervalMinutes`, it writes a `discover.source` outbox event. The event key contains the interval slot, so any number of replicas schedule each source once per interval.
- The scan itself holds a Redis lock per source.
- **Scan now** in the admin UI (or `POST /internal/sources/:id/scan` on discovery-service) queues an immediate scan through the same path.

Change detection:

- It uses conditional GET (`If-None-Match` / `If-Modified-Since`) and a normalised snapshot hash of `(url, lastmod)` pairs.
- An unchanged source records `CrawlRun.status = unchanged` and creates no jobs.
- A changed source enqueues only NEW URLs and UPDATED URLs (lastmod advanced), newest first, capped at `maxArticlesPerScan`.
- If a scan is capped, the feed is re-read on the next scan, so the deferred URLs are not lost.
- Sitemap indexes are walked breadth-first with a visited set, a depth limit, and a limit on children that prefers recently modified ones.

## Workers and scaling

Every service can run any stage. `WORKER_STAGES` picks the stages a process runs; the defaults are listed in `.env.example`.

- **Scaling:** add replicas, and raise `WORKER_CONCURRENCY_<STAGE>` (for example `WORKER_CONCURRENCY_ARTICLE_SCRAPE=8`). No worker count is hard-coded.
- **Transport:** BullMQ queues `v2-<stage>` with prefix `BULLMQ_PREFIX`.
- **Durable state:** the `pipeline_jobs` table holds the real state: attempts, errors, timestamps, correlation id.
- **Transactional outbox:** each stage writes its state change and the next stage's `outbox_events` row in one transaction. Every service runs an outbox dispatcher; `FOR UPDATE SKIP LOCKED` lets several dispatchers run side by side.
- **Idempotency:**
  - Every job has a stable idempotency key, which also derives the BullMQ job id.
  - Handlers upsert on natural keys (scrape key, story source, article per story, version content hash).
  - Redelivering or replaying a job never duplicates articles or publications.
- **Headless rendering:** `scraper-service` uses plain Chromium, only for sources with `renderPolicy: fallback|required`. Every request the page makes is checked against the allowlist and the SSRF guard. There are no stealth plugins, CAPTCHA solving or proxies.

## Retries and dead letters

| Error class | Behaviour |
|---|---|
| `RetryableError`: network, 429, 5xx, timeouts, Bedrock throttling | Exponential backoff `JOB_BACKOFF_BASE_MS · 2^(n-1)` ± 20% jitter, capped at `JOB_BACKOFF_MAX_MS`, up to `JOB_MAX_ATTEMPTS_<STAGE>`. |
| `DeferredError`: per-domain rate limit, LLM daily budget | Rescheduled without using up an attempt. |
| `TerminalError` / `BlockedError`: robots disallow, 401/403/451, CAPTCHA, paywall, unapproved source, parse errors | Goes to `DEAD_LETTER` straight away. It is never retried automatically. |

Some bad outcomes are not failures, so they never reach the DLQ. Invalid LLM output, ungrounded facts, translation mismatches and possible duplicates stop the item in a review state (NEEDS_REVIEW) instead.

**Inspect and replay:**

- **UI:** Admin → Jobs & Dead Letters. Replaying requires the admin role.
- **CLI:**
  - `npm run jobs:list -- --stage article.scrape`
  - `npm run jobs:replay -- <jobId>`
  - `npm run jobs:replay -- --all --stage article.extract`
- A replay resets the attempts and re-enqueues the job with the **same** idempotency key and a fresh transport id.
- Replaying a job that is not dead-lettered is refused.

**Alerts:** set `ALERT_WEBHOOK_URL` (Slack-compatible). Alerts fire for dead letters (throttled per stage and error code), for the DLQ size reaching `ALERT_DLQ_THRESHOLD`, and for sources failing `ALERT_SOURCE_FAILURES` scans in a row.

## LLM usage

- **Provider:** Claude on Amazon Bedrock through the Anthropic Bedrock Mantle client and the default AWS credential chain.
- **Models:** the default is `anthropic.claude-opus-5` for every task. Override with `LLM_MODEL_<TASK>` or `LLM_MODEL_DEFAULT`, and `LLM_EFFORT_<TASK>`.
- **Structured outputs:** `output_config.format` built from zod schemas (`packages/llm/src/schemas.ts`), then validated again locally. There is one repair attempt; after that the output is `INVALID` and goes to editorial review, never downstream.
- **Grounding** (`validate/grounding.ts`):
  - Every claim must quote a verbatim evidence span from the source.
  - Entities, amounts and rounds that are not in the text are dropped or set to null.
  - Unknown values stay null.
- **Provenance:** the model, prompt version and schema version are stored on every `FactExtraction`, `Translation` and `ArticleVersion.generator`.
- **Translation:**
  - Only the extracted facts are translated; the original text stays on `SourceArticle` for review.
  - Protected names must survive unchanged, and every number must keep its value (`30億円` = `3 billion yen`).
  - Machine-translated quotes are marked unverified and rendered as reported speech.
- **Budget:** `LLM_DAILY_TOKEN_BUDGET` is a circuit breaker shared across replicas.

## Editorial workflow

The lifecycle is `GENERATED → VALIDATED → DRAFT → APPROVED → PUBLISHED`, with `NEEDS_REVIEW`, `REJECTED` and `ARCHIVED` as side states. The rules are in `editorial/state-machine.ts`.

In **Admin → Editorial Review**, editors can:

- see the draft next to its sources, including the original-language text, the facts with evidence, the validation report and the full history;
- approve, reject, edit or publish. An edit creates a new version and re-runs validation. Approving with open issues requires a note;
- resolve possible duplicates (keep separate, or merge into an existing story);
- retry or reject source articles stuck on extraction or translation, or accept a translation they have checked by hand.

**Publishing** is done by the publishing service in one transaction, gated by `evaluatePublishGates`:

- The version must be APPROVED and must be the current version.
- The source must be APPROVED.
- There must be at least one citation and all SEO fields must be present.
- Re-publishing the live version is a no-op.
- History is preserved: new versions of a published story stay drafts until they are published, and the live version keeps serving meanwhile.

**Auto-publish** is off. It needs `AUTO_PUBLISH_ENABLED=true`, a source with `publishing.mode: AUTO`, and every gate passing: schema, dedup, confidence, translation, safety, attribution and SEO.

## Public site, SEO, attribution

- Pages read only published versions (`src/lib/articles.ts`).
- Article pages include:
  - `generateMetadata`: canonical URL, OpenGraph, Twitter
  - `NewsArticle` JSON-LD with `isBasedOn` and `citation` for every source, plus a `BreadcrumbList`
  - a Sources section listing every publisher with a direct link, language and date
  - links to company pages
- Internal links come only from an allowlist built from the database; links the LLM invents are dropped.
- `sitemap.xml` lists published stories and categories only. `robots.txt` disallows the admin and API paths.
- The markdown renderer sanitises output (`rehype-sanitize`). Raw HTML is allowed only for the three styled summary boxes.

## Security

| Area | What is in place |
|---|---|
| SSRF | `net/safe-fetch.ts`. Allowed: http/https, ports 80/443, hosts in approved `SourceDomain` entries. Every A/AAAA record must be public unicast; private, loopback, link-local, metadata, CGNAT, ULA, multicast and IPv4-mapped addresses are blocked. The socket is pinned to the validated IP, every redirect hop is re-validated, and size and time are capped after decompression. |
| robots.txt | RFC 9309 behaviour; fails closed when unreachable and the source requires robots. Applies to feeds, sitemaps and articles. |
| Sanitisation | The stored HTML allowlist removes scripts, handlers, iframes, forms and `javascript:`/`data:` URLs. Public markdown is sanitised. |
| Dashboard auth | Basic Auth with scrypt-hashed `EDITOR_USERS` and editor/admin roles. There are no default credentials. News pages are public; admin, editorial and job APIs require login; identity headers from clients are stripped. |
| Services | `INTERNAL_API_TOKEN` protects the discovery admin routes and the scraper, categorization and intelligence stateless APIs. It is mandatory in production. |
| Other | The `/uploads` path traversal is fixed. Error messages are truncated, and article bodies and secrets are never logged. |

## Observability

- **Metrics:** Prometheus endpoints:
  - `discovery-service /metrics/pipeline`
  - `categorization` and `intelligence` `/metrics`
  - `publishing-service :3005/metrics`

  Series: `pipeline_jobs_total{stage,outcome}`, `pipeline_job_duration_seconds`, `source_scans_total`, `pipeline_dead_letters`, `llm_tokens_total`, `llm_validation_failures_total`, `pipeline_articles_total`.
- **Logs:** structured pino logs carry `correlationId`, which follows an item from scan to publish.
- **Source health:** `failureStatus`, `consecutiveFailures`, last error, last successful scan and last change are shown in Admin → Trusted Sources.

## Testing

| Command | What it runs |
|---|---|
| `npm test` | Unit tests: ingestion-core, llm, discovery. |
| `npm run test:int` | PostgreSQL + Redis integration and end-to-end tests. Needs `TEST_DATABASE_URL` (pgvector + pg_trgm, migrated) and optionally `TEST_REDIS_URL`. They run in CI (`.github/workflows/ci.yml`). |
| `npm run pipeline:smoke -- --source thebridge` | The real pipeline (real Bedrock) for one source, in process. It stops at DRAFT. |

The end-to-end test runs Indian (en) and Japanese (ja) sources through every stage. It checks:

- cross-publisher grouping into one story;
- publisher feed text used without fetching the page;
- syndicated exact duplicates;
- unchanged rescans creating no work;
- manual approval and publish, and idempotent re-publish;
- late material coverage creating a new draft version while the published version stays live;
- dead-letter inspection and replay.

## Cutover

1. Run v2 with `PIPELINE_V2_ENABLED=true` next to the legacy pipeline, and review drafts.
2. When editors are satisfied, set `LEGACY_PIPELINE_ENABLED=false` on all services.
3. Keep the legacy tables read-only. Drop them in a later release once nothing reads them. The public site already reads only `Article`.
