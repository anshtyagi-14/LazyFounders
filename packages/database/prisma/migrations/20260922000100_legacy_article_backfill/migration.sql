-- Backfill legacy OriginalContent rows into the versioned Article model so the
-- public site keeps serving existing stories after it switches to Article.
-- Legacy tables are left untouched (read-only) and dropped in a later release.

INSERT INTO "articles" ("id", "slug", "status", "category", "tags", "companies", "legacy_content_id", "published_at", "created_at", "updated_at")
SELECT gen_random_uuid(), oc."slug", 'PUBLISHED', cr."primary_category", oc."keywords", oc."companies", oc."id",
       COALESCE(oc."published_to_blog_at", oc."created_at"), oc."created_at", now()
FROM "original_contents" oc
JOIN "intelligence_results" ir ON ir."id" = oc."intelligence_result_id"
JOIN "categorization_results" cr ON cr."id" = ir."categorization_id"
ON CONFLICT DO NOTHING;

INSERT INTO "article_versions" ("id", "article_id", "version", "content_hash", "headline", "seo_title", "meta_description",
                                "intro", "body_markdown", "key_takeaways", "featured_image", "generator", "created_by", "created_at")
SELECT gen_random_uuid(), a."id", 1, md5(oc."body_html"), oc."seo_title", oc."seo_title", oc."meta_description",
       oc."meta_description", oc."body_html", '[]'::jsonb,
       CASE WHEN oc."header_image" IS NULL THEN NULL ELSE jsonb_build_object('url', oc."header_image") END,
       '{"model":"legacy","promptVersion":"legacy"}'::jsonb, 'legacy-backfill', oc."created_at"
FROM "articles" a
JOIN "original_contents" oc ON oc."id" = a."legacy_content_id"
ON CONFLICT DO NOTHING;

UPDATE "articles" a
SET "current_version_id" = v."id", "published_version_id" = v."id"
FROM "article_versions" v
WHERE v."article_id" = a."id" AND v."version" = 1 AND a."legacy_content_id" IS NOT NULL AND a."published_version_id" IS NULL;

INSERT INTO "article_citations" ("id", "version_id", "position", "publisher", "url", "title", "published_at")
SELECT gen_random_uuid(), v."id", 1, s."name", COALESCE(sr."canonical_url", us."url"), sr."title", sr."published_date"
FROM "articles" a
JOIN "article_versions" v ON v."id" = a."published_version_id"
JOIN "original_contents" oc ON oc."id" = a."legacy_content_id"
JOIN "intelligence_results" ir ON ir."id" = oc."intelligence_result_id"
JOIN "categorization_results" cr ON cr."id" = ir."categorization_id"
JOIN "url_states" us ON us."id" = cr."url_state_id"
JOIN "sources" s ON s."id" = us."source_id"
LEFT JOIN "scrape_results" sr ON sr."categorization_id" = cr."id"
ON CONFLICT DO NOTHING;
