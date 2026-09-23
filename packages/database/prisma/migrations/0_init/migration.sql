-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "crawl_frequency" TEXT NOT NULL DEFAULT '0 */1 * * *',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" SMALLINT NOT NULL DEFAULT 5,
    "category" TEXT,
    "custom_sitemap_urls" TEXT[],
    "proxy_enabled" BOOLEAN NOT NULL DEFAULT false,
    "custom_headers" JSONB,
    "crawl_policy" JSONB,
    "custom_filter_rules" JSONB,
    "recency_window_hours" SMALLINT NOT NULL DEFAULT 72,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_crawled_at" TIMESTAMP(3),

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitemaps" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "discovery_method" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sitemaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitemap_states" (
    "id" UUID NOT NULL,
    "sitemap_id" UUID NOT NULL,
    "etag" TEXT,
    "last_modified" TEXT,
    "content_hash" TEXT,
    "url_count" INTEGER NOT NULL DEFAULT 0,
    "last_fetched_at" TIMESTAMP(3) NOT NULL,
    "fetch_duration_ms" INTEGER,
    "http_status" SMALLINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sitemap_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "url_states" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "url_hash" TEXT NOT NULL,
    "normalized_slug" TEXT,
    "lastmod" TIMESTAMP(3),
    "etag" TEXT,
    "content_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "change_type" TEXT,
    "title_hint" TEXT,
    "news_publication_date" TIMESTAMP(3),
    "priority" REAL,
    "change_freq" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "url_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slug_histories" (
    "id" UUID NOT NULL,
    "url_state_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "normalized_slug" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slug_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_runs" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "trace_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "total_urls" INTEGER NOT NULL DEFAULT 0,
    "new_urls" INTEGER NOT NULL DEFAULT 0,
    "updated_urls" INTEGER NOT NULL DEFAULT 0,
    "removed_urls" INTEGER NOT NULL DEFAULT 0,
    "renamed_urls" INTEGER NOT NULL DEFAULT 0,
    "unchanged_urls" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "sitemaps_processed" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "crawl_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_errors" (
    "id" UUID NOT NULL,
    "crawl_run_id" UUID NOT NULL,
    "url" TEXT,
    "error_type" TEXT NOT NULL,
    "error_message" TEXT NOT NULL,
    "http_status" SMALLINT,
    "strategy" TEXT,
    "retry_count" SMALLINT NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrape_results" (
    "id" UUID NOT NULL,
    "categorization_id" UUID NOT NULL,
    "trace_id" TEXT NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "body_text" TEXT,
    "body_html" TEXT,
    "author" TEXT,
    "published_date" TIMESTAMP(3),
    "language" TEXT,
    "word_count" INTEGER,
    "reading_time_min" REAL,
    "images" JSONB,
    "meta_tags" JSONB,
    "open_graph" JSONB,
    "twitter_card" JSONB,
    "canonical_url" TEXT,
    "json_ld" JSONB,
    "article_schema" JSONB,
    "breadcrumbs" JSONB,
    "content_hash" TEXT,
    "extraction_method" TEXT,
    "fetch_strategy" TEXT,
    "duration_ms" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'success',
    "error_message" TEXT,
    "raw_html_size" INTEGER,
    "scraped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrape_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorization_results" (
    "id" UUID NOT NULL,
    "url_state_id" UUID NOT NULL,
    "primary_category" TEXT,
    "tags" JSONB,
    "summary" TEXT,
    "entities" JSONB,
    "sentiment" TEXT,
    "confidence_score" REAL,
    "embedding" vector(1024),
    "categorized_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorization_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intelligence_results" (
    "id" UUID NOT NULL,
    "categorization_id" UUID NOT NULL,
    "is_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicate_of_id" UUID,
    "deduplicated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intelligence_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "original_contents" (
    "id" UUID NOT NULL,
    "intelligence_result_id" UUID NOT NULL,
    "seo_title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "meta_description" TEXT NOT NULL,
    "keywords" TEXT[],
    "companies" TEXT[],
    "header_image" TEXT,
    "published_to_blog_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "original_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default Key',
    "requests_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sources_domain_key" ON "sources"("domain");

-- CreateIndex
CREATE INDEX "sources_enabled_priority_idx" ON "sources"("enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "sitemaps_source_id_url_key" ON "sitemaps"("source_id", "url");

-- CreateIndex
CREATE INDEX "sitemap_states_sitemap_id_last_fetched_at_idx" ON "sitemap_states"("sitemap_id", "last_fetched_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "url_states_url_hash_key" ON "url_states"("url_hash");

-- CreateIndex
CREATE INDEX "url_states_source_id_status_idx" ON "url_states"("source_id", "status");

-- CreateIndex
CREATE INDEX "url_states_normalized_slug_idx" ON "url_states"("normalized_slug");

-- CreateIndex
CREATE INDEX "url_states_last_seen_at_idx" ON "url_states"("last_seen_at");

-- CreateIndex
CREATE INDEX "slug_histories_normalized_slug_idx" ON "slug_histories"("normalized_slug");

-- CreateIndex
CREATE INDEX "slug_histories_url_state_id_idx" ON "slug_histories"("url_state_id");

-- CreateIndex
CREATE INDEX "crawl_runs_source_id_started_at_idx" ON "crawl_runs"("source_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "crawl_runs_trace_id_idx" ON "crawl_runs"("trace_id");

-- CreateIndex
CREATE INDEX "crawl_errors_crawl_run_id_idx" ON "crawl_errors"("crawl_run_id");

-- CreateIndex
CREATE INDEX "crawl_errors_error_type_idx" ON "crawl_errors"("error_type");

-- CreateIndex
CREATE UNIQUE INDEX "scrape_results_categorization_id_key" ON "scrape_results"("categorization_id");

-- CreateIndex
CREATE INDEX "scrape_results_trace_id_idx" ON "scrape_results"("trace_id");

-- CreateIndex
CREATE INDEX "scrape_results_scraped_at_idx" ON "scrape_results"("scraped_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "categorization_results_url_state_id_key" ON "categorization_results"("url_state_id");

-- CreateIndex
CREATE INDEX "categorization_results_primary_category_idx" ON "categorization_results"("primary_category");

-- CreateIndex
CREATE UNIQUE INDEX "intelligence_results_categorization_id_key" ON "intelligence_results"("categorization_id");

-- CreateIndex
CREATE INDEX "intelligence_results_is_duplicate_idx" ON "intelligence_results"("is_duplicate");

-- CreateIndex
CREATE UNIQUE INDEX "original_contents_intelligence_result_id_key" ON "original_contents"("intelligence_result_id");

-- CreateIndex
CREATE UNIQUE INDEX "original_contents_slug_key" ON "original_contents"("slug");

-- CreateIndex
CREATE INDEX "original_contents_slug_idx" ON "original_contents"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_key" ON "api_keys"("key");

-- AddForeignKey
ALTER TABLE "sitemaps" ADD CONSTRAINT "sitemaps_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitemap_states" ADD CONSTRAINT "sitemap_states_sitemap_id_fkey" FOREIGN KEY ("sitemap_id") REFERENCES "sitemaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "url_states" ADD CONSTRAINT "url_states_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slug_histories" ADD CONSTRAINT "slug_histories_url_state_id_fkey" FOREIGN KEY ("url_state_id") REFERENCES "url_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_errors" ADD CONSTRAINT "crawl_errors_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrape_results" ADD CONSTRAINT "scrape_results_categorization_id_fkey" FOREIGN KEY ("categorization_id") REFERENCES "categorization_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorization_results" ADD CONSTRAINT "categorization_results_url_state_id_fkey" FOREIGN KEY ("url_state_id") REFERENCES "url_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_results" ADD CONSTRAINT "intelligence_results_categorization_id_fkey" FOREIGN KEY ("categorization_id") REFERENCES "categorization_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "original_contents" ADD CONSTRAINT "original_contents_intelligence_result_id_fkey" FOREIGN KEY ("intelligence_result_id") REFERENCES "intelligence_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

