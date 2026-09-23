-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- AlterTable
ALTER TABLE "sources" ADD COLUMN     "adapter_key" TEXT,
ADD COLUMN     "config_hash" TEXT,
ADD COLUMN     "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "crawl_interval_minutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "default_language" TEXT,
ADD COLUMN     "discovery_methods" TEXT[],
ADD COLUMN     "failure_status" TEXT NOT NULL DEFAULT 'OK',
ADD COLUMN     "feed_urls" TEXT[],
ADD COLUMN     "image_policy" TEXT NOT NULL DEFAULT 'link_with_credit',
ADD COLUMN     "last_change_detected_at" TIMESTAMP(3),
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "last_successful_scan_at" TIMESTAMP(3),
ADD COLUMN     "max_articles_per_scan" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "publishing_policy" JSONB,
ADD COLUMN     "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "registry_key" TEXT,
ADD COLUMN     "render_policy" TEXT NOT NULL DEFAULT 'never',
ADD COLUMN     "robots_required" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "translation_policy" JSONB,
ADD COLUMN     "trust_status" TEXT NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "sitemap_states" ADD COLUMN     "changed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "not_modified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "snapshot_hash" TEXT;

-- AlterTable
ALTER TABLE "url_states" ADD COLUMN     "canonical_url" TEXT,
ADD COLUMN     "last_enqueued_version" TEXT,
ADD COLUMN     "url_fingerprint" TEXT;

-- CreateTable
CREATE TABLE "source_domains" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'primary',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "url_aliases" (
    "id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "canonical_fingerprint" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "url_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_jobs" (
    "id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "timeout_ms" INTEGER NOT NULL DEFAULT 120000,
    "next_run_at" TIMESTAMP(3),
    "last_error" JSONB,
    "replay_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatched_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_snapshots" (
    "id" UUID NOT NULL,
    "sha256" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT,
    "bytes" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "http_status" SMALLINT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_articles" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "url_state_id" UUID,
    "snapshot_id" UUID,
    "correlation_id" TEXT NOT NULL,
    "scrape_key" TEXT,
    "state" TEXT NOT NULL DEFAULT 'DISCOVERED',
    "state_reason" TEXT,
    "original_url" TEXT NOT NULL,
    "final_url" TEXT,
    "canonical_url" TEXT,
    "canonical_fingerprint" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "country" TEXT,
    "language" TEXT,
    "language_confidence" REAL,
    "headline" TEXT,
    "subheadline" TEXT,
    "author" TEXT,
    "published_at" TIMESTAMP(3),
    "modified_at" TIMESTAMP(3),
    "body_text" TEXT,
    "sanitized_html" TEXT,
    "lead_image" TEXT,
    "image_credit" TEXT,
    "categories" TEXT[],
    "tags" TEXT[],
    "structured_meta" JSONB,
    "outbound_links" JSONB,
    "extraction_method" TEXT,
    "content_hash" TEXT,
    "paywalled" BOOLEAN NOT NULL DEFAULT false,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translations" (
    "id" UUID NOT NULL,
    "source_article_id" UUID NOT NULL,
    "source_language" TEXT NOT NULL,
    "target_language" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "model_version" TEXT,
    "prompt_version" TEXT NOT NULL,
    "headline" TEXT,
    "summary" TEXT,
    "body" TEXT,
    "protected_tokens" JSONB,
    "validation" JSONB,
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fact_extractions" (
    "id" UUID NOT NULL,
    "source_article_id" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "payload" JSONB,
    "overall_confidence" REAL,
    "validation_status" TEXT NOT NULL,
    "errors" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fact_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" UUID NOT NULL,
    "story_type" TEXT NOT NULL,
    "event_key" TEXT,
    "primary_entity" TEXT,
    "event_date" TIMESTAMP(3),
    "headline" TEXT NOT NULL,
    "facts" JSONB,
    "embedding" vector(1024),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_sources" (
    "id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "source_article_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SUPPORTING',
    "decision" TEXT NOT NULL,
    "similarity" REAL,
    "reasons" JSONB,
    "contributed_facts" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_claims" (
    "id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'fact',
    "claim_key" TEXT NOT NULL,
    "source_article_ids" TEXT[],
    "evidence" JSONB,
    "confidence" REAL,
    "translated" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL,
    "story_id" UUID,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "current_version_id" UUID,
    "published_version_id" UUID,
    "category" TEXT,
    "tags" TEXT[],
    "companies" TEXT[],
    "legacy_content_id" UUID,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_versions" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "seo_title" TEXT NOT NULL,
    "meta_description" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "body_markdown" TEXT NOT NULL,
    "key_takeaways" JSONB NOT NULL,
    "what_this_means" TEXT,
    "faq" JSONB,
    "social_summary" TEXT,
    "internal_links" JSONB,
    "featured_image" JSONB,
    "generator" JSONB NOT NULL,
    "validation_report" JSONB,
    "created_by" TEXT NOT NULL DEFAULT 'pipeline',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_citations" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "source_article_id" UUID,
    "position" INTEGER NOT NULL,
    "publisher" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "language" TEXT,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "article_citations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editorial_actions" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "version_id" UUID,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "editorial_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "source_domains_domain_key" ON "source_domains"("domain");

-- CreateIndex
CREATE INDEX "source_domains_source_id_idx" ON "source_domains"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "url_aliases_fingerprint_key" ON "url_aliases"("fingerprint");

-- CreateIndex
CREATE INDEX "url_aliases_canonical_fingerprint_idx" ON "url_aliases"("canonical_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_jobs_idempotency_key_key" ON "pipeline_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "pipeline_jobs_status_stage_idx" ON "pipeline_jobs"("status", "stage");

-- CreateIndex
CREATE INDEX "pipeline_jobs_correlation_id_idx" ON "pipeline_jobs"("correlation_id");

-- CreateIndex
CREATE INDEX "pipeline_jobs_subject_type_subject_id_idx" ON "pipeline_jobs"("subject_type", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_idempotency_key_key" ON "outbox_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "outbox_events_dispatched_at_created_at_idx" ON "outbox_events"("dispatched_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "raw_snapshots_sha256_key" ON "raw_snapshots"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "source_articles_scrape_key_key" ON "source_articles"("scrape_key");

-- CreateIndex
CREATE INDEX "source_articles_content_hash_idx" ON "source_articles"("content_hash");

-- CreateIndex
CREATE INDEX "source_articles_state_idx" ON "source_articles"("state");

-- CreateIndex
CREATE INDEX "source_articles_published_at_idx" ON "source_articles"("published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "source_articles_canonical_fingerprint_content_hash_key" ON "source_articles"("canonical_fingerprint", "content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "translations_source_article_id_target_language_prompt_versi_key" ON "translations"("source_article_id", "target_language", "prompt_version");

-- CreateIndex
CREATE UNIQUE INDEX "fact_extractions_source_article_id_prompt_version_schema_ve_key" ON "fact_extractions"("source_article_id", "prompt_version", "schema_version");

-- CreateIndex
CREATE INDEX "stories_event_key_idx" ON "stories"("event_key");

-- CreateIndex
CREATE INDEX "stories_created_at_idx" ON "stories"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "story_sources_source_article_id_key" ON "story_sources"("source_article_id");

-- CreateIndex
CREATE INDEX "story_sources_story_id_idx" ON "story_sources"("story_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_claims_story_id_claim_key_key" ON "story_claims"("story_id", "claim_key");

-- CreateIndex
CREATE UNIQUE INDEX "articles_story_id_key" ON "articles"("story_id");

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_key" ON "articles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "articles_legacy_content_id_key" ON "articles"("legacy_content_id");

-- CreateIndex
CREATE INDEX "articles_status_idx" ON "articles"("status");

-- CreateIndex
CREATE INDEX "articles_published_at_idx" ON "articles"("published_at" DESC);

-- CreateIndex
CREATE INDEX "articles_category_idx" ON "articles"("category");

-- CreateIndex
CREATE UNIQUE INDEX "article_versions_article_id_version_key" ON "article_versions"("article_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "article_versions_article_id_content_hash_key" ON "article_versions"("article_id", "content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "article_citations_version_id_position_key" ON "article_citations"("version_id", "position");

-- CreateIndex
CREATE INDEX "editorial_actions_article_id_created_at_idx" ON "editorial_actions"("article_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sources_registry_key_key" ON "sources"("registry_key");

-- CreateIndex
CREATE UNIQUE INDEX "url_states_url_fingerprint_key" ON "url_states"("url_fingerprint");

-- AddForeignKey
ALTER TABLE "source_domains" ADD CONSTRAINT "source_domains_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_articles" ADD CONSTRAINT "source_articles_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_articles" ADD CONSTRAINT "source_articles_url_state_id_fkey" FOREIGN KEY ("url_state_id") REFERENCES "url_states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_articles" ADD CONSTRAINT "source_articles_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "raw_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translations" ADD CONSTRAINT "translations_source_article_id_fkey" FOREIGN KEY ("source_article_id") REFERENCES "source_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_extractions" ADD CONSTRAINT "fact_extractions_source_article_id_fkey" FOREIGN KEY ("source_article_id") REFERENCES "source_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_sources" ADD CONSTRAINT "story_sources_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_sources" ADD CONSTRAINT "story_sources_source_article_id_fkey" FOREIGN KEY ("source_article_id") REFERENCES "source_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_claims" ADD CONSTRAINT "story_claims_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_citations" ADD CONSTRAINT "article_citations_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "article_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_citations" ADD CONSTRAINT "article_citations_source_article_id_fkey" FOREIGN KEY ("source_article_id") REFERENCES "source_articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_actions" ADD CONSTRAINT "editorial_actions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Trigram index for cross-publisher headline similarity (dedup layer 4)
CREATE INDEX IF NOT EXISTS "source_articles_headline_trgm_idx" ON "source_articles" USING GIN ("headline" gin_trgm_ops);
