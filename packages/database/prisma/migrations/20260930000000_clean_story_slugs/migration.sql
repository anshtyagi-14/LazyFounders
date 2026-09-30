-- Story URLs become plain words from the headline: no id or hex suffix.
-- Our articles drop their "-<6 hex of the story id>" suffix (the old slug is kept in
-- previous_slugs and 301s to the new one). Syndicated stories get a stored slug,
-- filled by a trigger on insert; their old "-<8 hex of the id>" URLs still resolve
-- by id and 301 to the new slug. Headlines that collide get -2, -3, ...

ALTER TABLE "articles" ADD COLUMN "previous_slugs" TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX "articles_previous_slugs_idx" ON "articles" USING GIN ("previous_slugs");

ALTER TABLE "source_articles" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX "source_articles_slug_key" ON "source_articles"("slug");

-- Headline -> slug, like the app's slugify(): tags and HTML entities dropped, lowercase
-- ASCII words joined by hyphens, cut at a word boundary within 70 characters.
CREATE OR REPLACE FUNCTION lf_story_slug_base(headline TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN length(s) <= 70 THEN s ELSE regexp_replace(left(s, 71), '-[^-]*$', '') END
  FROM (
    SELECT coalesce(nullif(trim(BOTH '-' FROM regexp_replace(lower(
      regexp_replace(regexp_replace(coalesce(headline, ''), '<[^>]+>', ' ', 'g'), '&(#x?[0-9a-f]+|[a-z]+);', ' ', 'gi')
    ), '[^a-z0-9]+', '-', 'g')), ''), 'story') AS s
  ) t
$$;

-- The first free slug for a headline: not an article's current or previous slug, and
-- not another syndicated story's.
CREATE OR REPLACE FUNCTION lf_unique_story_slug(base TEXT, self_id UUID) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  candidate TEXT := base;
  n INT := 1;
BEGIN
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM "articles" WHERE "slug" = candidate OR "previous_slugs" @> ARRAY[candidate])
          AND NOT EXISTS (SELECT 1 FROM "source_articles" WHERE "slug" = candidate AND "id" IS DISTINCT FROM self_id);
    n := n + 1;
    candidate := base || '-' || n;
  END LOOP;
  RETURN candidate;
END
$$;

-- 1. Our articles first: they are the indexed URLs, so they get first claim on a slug.
DO $$
DECLARE
  r RECORD;
  base TEXT;
BEGIN
  FOR r IN
    SELECT "id", "slug", "story_id" FROM "articles"
    WHERE "story_id" IS NOT NULL
      AND "slug" ~ ('-' || left("story_id"::TEXT, 6) || '(-[0-9a-z]{6,})?$')
    ORDER BY coalesce("published_at", "created_at"), "id"
  LOOP
    base := regexp_replace(r."slug", '-' || left(r."story_id"::TEXT, 6) || '(-[0-9a-z]{6,})?$', '');
    CONTINUE WHEN base = '';
    UPDATE "articles"
      SET "slug" = lf_unique_story_slug(base, NULL), "previous_slugs" = array_append("previous_slugs", r."slug")
      WHERE "id" = r."id";
  END LOOP;
END
$$;

-- 2. Every syndicated story with a headline, oldest first so the original keeps the plain slug.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT "id", "headline" FROM "source_articles"
    WHERE "headline" IS NOT NULL AND "slug" IS NULL
    ORDER BY coalesce("published_at", "fetched_at"), "id"
  LOOP
    UPDATE "source_articles" SET "slug" = lf_unique_story_slug(lf_story_slug_base(r."headline"), r."id") WHERE "id" = r."id";
  END LOOP;
END
$$;

-- 3. New syndicated stories get their slug on insert (or when a headline first arrives).
CREATE OR REPLACE FUNCTION lf_source_article_slug() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."slug" IS NULL AND NEW."headline" IS NOT NULL THEN
    NEW."slug" := lf_unique_story_slug(lf_story_slug_base(NEW."headline"), NEW."id");
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "source_articles_slug"
  BEFORE INSERT OR UPDATE OF "headline" ON "source_articles"
  FOR EACH ROW EXECUTE FUNCTION lf_source_article_slug();
