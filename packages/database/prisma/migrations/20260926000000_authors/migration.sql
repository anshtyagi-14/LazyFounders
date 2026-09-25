-- LazyFounders bylines: an authors table, one default author, and every article credited to it.

CREATE TABLE "authors" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "job_title" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "avatar_url" TEXT,
    "same_as" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "authors_slug_key" ON "authors"("slug");

ALTER TABLE "articles" ADD COLUMN "author_id" UUID;
CREATE INDEX "articles_author_id_idx" ON "articles"("author_id");
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "authors" ("id", "slug", "name", "job_title", "bio", "same_as", "updated_at")
VALUES (
    '7a3f0c52-5e1b-4c8e-9d2a-1f6b4e8c0d11',
    'tarun-mottlia',
    'Tarun Mottlia',
    'Editor',
    'Tarun Mottlia edits LazyFounders, covering Indian startups, funding rounds, AI and product launches. Every story on the site is AI-assisted and checked against its cited sources before publication.',
    ARRAY['https://www.linkedin.com/in/tarunmottlia'],
    CURRENT_TIMESTAMP
);

UPDATE "articles" SET "author_id" = '7a3f0c52-5e1b-4c8e-9d2a-1f6b4e8c0d11' WHERE "author_id" IS NULL;
