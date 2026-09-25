-- Public-site V1: early-access email capture and the site error log.

CREATE TABLE "email_signups" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "signup_location" TEXT NOT NULL,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "referrer" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_signups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_signups_email_key" ON "email_signups"("email");
CREATE INDEX "email_signups_created_at_idx" ON "email_signups"("created_at");

CREATE TABLE "site_errors" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "site_errors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "site_errors_fingerprint_key" ON "site_errors"("fingerprint");
CREATE INDEX "site_errors_last_seen_at_idx" ON "site_errors"("last_seen_at");
CREATE INDEX "site_errors_type_last_seen_at_idx" ON "site_errors"("type", "last_seen_at");
