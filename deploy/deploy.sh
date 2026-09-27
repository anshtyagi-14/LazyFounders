#!/usr/bin/env bash
# Deploy LazyFounders to production (https://lazyfounder.in) in one command:
#
#   1. build all six images on a throwaway arm64 EC2 host (deploy/ec2-build.sh)
#   2. register task definitions with deploy/.env.production and roll every
#      service once (deploy/update-task-defs.mjs --deploy)
#   3. smoke-test the live site
#
#   bash deploy/deploy.sh                    # build + deploy HEAD
#   SKIP_ECS_DEPLOY=true bash deploy/deploy.sh   # build and push images only
#
# Migrations are not run here. If the commit adds one, run
# `DATABASE_URL=<prod-url> npm run db:migrate` first.
#
# Credentials: the default profile (github-action) handles S3, ECR and ECS;
# the dhando-dev profile launches the build host. See deploy/README.md.
set -euo pipefail

SITE_URL="${SITE_URL:-https://lazyfounder.in}"

cd "$(dirname "$0")/.."

if [ ! -f deploy/.env.production ]; then
  echo "Missing deploy/.env.production - copy deploy/.env.production.example and fill it in." >&2
  exit 1
fi

if [ "$(git rev-parse HEAD)" != "$(git rev-parse '@{u}' 2>/dev/null || true)" ]; then
  echo "WARNING: HEAD is not what is on the upstream branch. Deploying local HEAD anyway."
fi

echo "Deploying $(git rev-parse --short HEAD) ($(git log -1 --format=%s))"
echo

# The Docker build has no database. A page that queries Postgres while being
# prerendered passes locally (where .env has DATABASE_URL) and fails only on
# the build host, 5 minutes and one EC2 instance later. Catch it here instead.
if [ "${SKIP_LOCAL_BUILD:-}" != "true" ]; then
  echo "Checking that the dashboard builds without a database..."
  # Own distDir and tsconfig: a running `next dev` rewrites .next/dev mid-build,
  # and type-checking those half-written files fails for reasons unrelated to the code.
  if ! (cd apps/api-dashboard && DATABASE_URL='postgresql://build:build@127.0.0.1:1/none' \
        NEXT_PUBLIC_SITE_URL="$SITE_URL" NEXT_DIST_DIR=.next-check NEXT_TSCONFIG_PATH=tsconfig.deploy-check.json \
        npx next build > "${TMPDIR:-/tmp}/lf-local-build.log" 2>&1); then
    grep -E 'Export encountered|Error occurred prerendering|Type error|Failed to compile' \
      "${TMPDIR:-/tmp}/lf-local-build.log" | head -10 >&2 || true
    echo "Local build failed - full log: ${TMPDIR:-/tmp}/lf-local-build.log (SKIP_LOCAL_BUILD=true to bypass)" >&2
    exit 1
  fi
  echo "  ok"
  echo
fi

bash deploy/ec2-build.sh

if [ "${SKIP_ECS_DEPLOY:-}" = "true" ]; then
  echo "Images pushed. ECS not touched (SKIP_ECS_DEPLOY=true)."
  exit 0
fi

echo
node deploy/update-task-defs.mjs --deploy

echo
echo "Smoke test:"
FAILED=0
for path in / /sitemap.xml /robots.txt /llms.txt; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$SITE_URL$path" || echo 000)"
  echo "  $code $SITE_URL$path"
  [ "$code" = "200" ] || FAILED=1
done
[ "$FAILED" = "0" ] || { echo "Smoke test failed - check the dashboard service logs." >&2; exit 1; }

echo "Deployed $(git rev-parse --short HEAD) to $SITE_URL"
