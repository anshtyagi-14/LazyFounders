# LazyFounders architecture

LazyFounders is a Next.js news site plus five background worker services. All six run as Docker containers on AWS ECS in `ap-south-1`. They share one PostgreSQL database and one Redis instance, and each news story moves through the workers in fixed stages.

This page gives the overview. For details see [pipeline.md](pipeline.md) (pipeline setup, sources, retries) and [../deploy/README.md](../deploy/README.md) (deploy steps, domain, credentials).

## 1. Deployment

```
 Developer
   │ git commit  →  bash deploy/deploy.sh
   ▼
 git archive HEAD → S3 (lazyfounders-build-source-<account>)
   ▼
 AWS CodeBuild "lazyfounders-build" (deploy/buildspec.yml)
   │ builds 6 Docker images, tags <sha> + latest
   ▼
 ECR  lf-api-dashboard, lf-discovery-service, lf-scraper-service,
      lf-categorization-service, lf-intelligence-service, lf-publishing-service
   ▼
 node deploy/update-task-defs.mjs --deploy   (env from deploy/.env.production)
   ▼
┌──────────── ECS cluster: lazyfounders-cluster (EC2 launch type) ───────────┐
│                                                                            │
│  Internet ─► ALB lf-dashboard-alb ─► api-dashboard (Next.js :3000)         │
│                                       public site + /admin + APIs          │
│                                                                            │
│  discovery-service   scraper-service   categorization-service              │
│  intelligence-service   publishing-service (:3005/metrics)                 │
│        │                    │                    │                         │
└────────┼────────────────────┼────────────────────┼─────────────────────────┘
         ▼                    ▼                    ▼
   PostgreSQL 16         Redis 7              AWS Bedrock (ap-south-1)
   (pgvector, pg_trgm)   BullMQ queues,       Mistral Large 3 via Converse
   source of truth       locks, LLM budget    S3 lazyfounders-media (images)
```

### Services

| Service | Role | Default pipeline stages |
|---|---|---|
| `api-dashboard` | Public site, admin UI, editorial review, APIs. Behind the ALB. | none |
| `discovery-service` | Scheduler; scans source feeds and sitemaps. | `discover.source` |
| `scraper-service` | Fetches and extracts articles. Has Chromium for sources that need rendering. | `article.scrape`, `article.normalize` |
| `categorization-service` | LLM fact extraction and translation. | `article.extract`, `article.translate` |
| `intelligence-service` | Dedup, article generation, validation. | `story.dedupe`, `article.generate`, `article.validate` |
| `publishing-service` | Publishes approved versions. | `article.publish` |

`WORKER_STAGES` overrides a service's defaults; any service can run any stage.

### CI and deploy

- **CI:** GitHub Actions ([ci.yml](../.github/workflows/ci.yml)) runs on every push to `main` and on PRs. It builds, validates the source registry, runs unit tests, migrations and integration tests (Postgres + Redis), and type-checks the dashboard. CI does not deploy.
- **Deploy order:**
  1. `DATABASE_URL=<prod-url> npm run db:migrate`
  2. `SKIP_ECS_DEPLOY=true bash deploy/deploy.sh` (build and push images)
  3. `node deploy/update-task-defs.mjs --deploy` (register task definitions, roll all services once)
- `deploy.sh` archives `git HEAD`, not the working tree, so commit before deploying.
- **Rollback:** `aws ecs update-service --task-definition <family>:<older-revision>`. Images are also tagged by commit sha.

### Production configuration

- **LLM:** the code defaults to Claude, but this AWS account cannot invoke Anthropic models. Production sets `LLM_MODEL_DEFAULT=mistral.mistral-large-3-675b-instruct` with `BEDROCK_TRANSPORT=converse`.
- **Flags:** `PIPELINE_V2_ENABLED=true` and `LEGACY_PIPELINE_ENABLED=true`, so the legacy and v2 pipelines run side by side until cutover.
- **Snapshots:** `SNAPSHOT_STORAGE=fs`, so raw page snapshots are written to the container's local disk, not S3.
- **Credentials:** the task definitions have no task role, so Bedrock and S3 keys are plaintext environment variables. Moving them to a task role or Secrets Manager is the intended end state.
- **Domain:** `https://lazyfounder.in` is live. DNS is on Route53 (alias A records for the apex and `www` point at the ALB), and the ALB's HTTPS:443 listener uses an issued ACM certificate covering both names. As of 2026-09-25 two ALB changes are still missing: HTTP:80 forwards to the app instead of redirecting to HTTPS, and `www` serves a duplicate copy of the site instead of redirecting to the apex. Section 6 of `deploy/route53-setup.sh` applies both.
- **Open question:** where production Postgres and Redis are hosted (RDS, ElastiCache or self-managed) is not recorded in the repo. Their URLs are kept on the existing task definitions, not in `deploy/.env.production`.

## 2. Pipeline workflow (v2)

```
sources/<country>/<key>.yaml ──npm run sources:sync──► Source table (PENDING)
                                       editor approves in Admin → Trusted Sources
                                                         ▼
① discover.source      [discovery-service]  scheduler tick every 60s
   due sources → conditional GET of feed/sitemap → diff (url, lastmod)
   unchanged → stop │ new/updated URLs → jobs (capped at maxArticlesPerScan)
                                                         ▼
② article.scrape       [scraper-service]
   robots.txt + rate limit + SSRF-safe fetch (Chromium only if renderPolicy says so)
   or feed text (contentSource: feed, e.g. YourStory) → snapshot → extraction
   (adapter → JSON-LD → OpenGraph → Readability); paywalled → skip
③ article.normalize    [scraper-service]
   clean text, content hash, language detection, thin/duplicate-version check
                                                         ▼
④ article.extract      [categorization-service]  LLM
   structured facts in the ORIGINAL language; each claim needs a verbatim evidence span
⑤ article.translate    [categorization-service]  (non-English sources only)
   translates facts only; names and numbers must survive unchanged
                                                         ▼
⑥ story.dedupe         [intelligence-service]
   URL → content hash → event key → headline trigram → embeddings
   the same event from several publishers becomes one Story
⑦ article.generate     [intelligence-service]  LLM
   LazyFounders template from verified facts, plus a Sources section
⑧ article.validate     [intelligence-service]
   numbers grounded, originality, SEO, safety, attribution
                                                         ▼
⑨ Editorial review     [api-dashboard /admin/editorial]
   DRAFT / NEEDS_REVIEW → editor approves, edits (new version) or rejects
   (auto-publish is off unless AUTO_PUBLISH_ENABLED=true and the source's mode is AUTO)
                                                         ▼
⑩ article.publish      [publishing-service]
   gates: approved + current version + approved source + ≥1 citation + SEO fields
   one transaction, idempotent → revalidate call → public site
   (/news, NewsArticle JSON-LD, sitemap, feed.xml)
```

### How stages hand off

- **Transactional outbox:** each stage saves its result and the next stage's `outbox_events` row in the same database transaction. Every service runs a dispatcher that moves outbox rows into the BullMQ queues `v2-<stage>`. `FOR UPDATE SKIP LOCKED` lets several dispatchers run at once.
- **Durable state:** job state (attempts, errors, timestamps, correlation id) lives in the Postgres `pipeline_jobs` table. Redis is only the transport between stages.
- **Scaling:** add replicas or raise `WORKER_CONCURRENCY_<STAGE>`. No worker count is hard-coded.
- **Idempotency:** every job has a stable idempotency key, and handlers upsert on natural keys, so a retry or replay never creates a duplicate article or publication.
- **Scheduling:** the scheduler event key includes the crawl-interval slot, so any number of discovery replicas schedule each source once per interval. A Redis lock guards each scan. "Scan now" in the admin UI uses the same path.

### When a stage fails

| Error | Result |
|---|---|
| Network errors, 429, 5xx, timeouts, Bedrock throttling | Retried with exponential backoff and jitter, up to `JOB_MAX_ATTEMPTS_<STAGE>` |
| Per-domain rate limit, daily LLM token budget reached | Rescheduled without using up an attempt |
| robots.txt disallow, 401/403/451, paywall, CAPTCHA, unapproved source | Sent straight to the dead-letter queue; never retried automatically |
| Invalid LLM output, facts not backed by the source, translation mismatch, possible duplicate | Marked NEEDS_REVIEW for an editor; not treated as an error |

Dead-lettered jobs can be replayed from **Admin → Jobs & Dead Letters** or with `npm run jobs:replay -- <jobId>`.

### Observability

- Structured pino logs carry a `correlationId` that follows an item from scan to publish.
- Prometheus metrics: `discovery-service /metrics/pipeline`, categorization and intelligence `/metrics`, `publishing-service :3005/metrics`.
- Source health (consecutive failures, last error, last successful scan) is shown in **Admin → Trusted Sources**.
- Alerts go to `ALERT_WEBHOOK_URL` (Slack-compatible) for dead letters, DLQ size and repeatedly failing sources.
