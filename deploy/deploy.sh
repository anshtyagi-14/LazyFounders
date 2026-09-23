#!/usr/bin/env bash
# Deploy LazyFounders: zip the committed tree, hand it to CodeBuild, watch the
# build, then wait for the ECS rollout to stabilise.
#
# Prerequisites: deploy/codebuild-setup.sh has been run once by an admin.
#
#   bash deploy/deploy.sh              # build + deploy HEAD
#   SKIP_ECS_DEPLOY=true bash deploy/deploy.sh   # build and push images only
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"
ACCOUNT_ID="${ACCOUNT_ID:-248746142729}"
PROJECT_NAME="${PROJECT_NAME:-lazyfounders-build}"
SOURCE_BUCKET="${SOURCE_BUCKET:-lazyfounders-build-source-$ACCOUNT_ID}"
CLUSTER="${CLUSTER:-lazyfounders-cluster}"

cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "WARNING: working tree is dirty. Only committed files are archived and deployed."
  git status --short | head -20
  echo
fi

SHA="$(git rev-parse HEAD)"
echo "Deploying $SHA ($(git log -1 --format=%s))"

TMP_ZIP="$(mktemp -t lf-source-XXXXXX).zip"
trap 'rm -f "$TMP_ZIP"' EXIT

echo "Archiving tree..."
git archive --format=zip -o "$TMP_ZIP" HEAD
echo "Uploading $(du -h "$TMP_ZIP" | cut -f1) to s3://$SOURCE_BUCKET/source.zip"
aws s3 cp "$TMP_ZIP" "s3://$SOURCE_BUCKET/source.zip" --region "$AWS_REGION"

START_ARGS=(--project-name "$PROJECT_NAME" --region "$AWS_REGION")
if [ "${SKIP_ECS_DEPLOY:-}" = "true" ]; then
  START_ARGS+=(--environment-variables-override "name=SKIP_ECS_DEPLOY,value=true,type=PLAINTEXT")
fi
# The buildspec tags images from CODEBUILD_RESOLVED_SOURCE_VERSION, which S3
# sources do not populate, so pass the sha explicitly.
START_ARGS+=(--source-version "$SHA")

BUILD_ID="$(aws codebuild start-build "${START_ARGS[@]}" --query 'build.id' --output text)"
echo "Build started: $BUILD_ID"
echo "Console: https://$AWS_REGION.console.aws.amazon.com/codesuite/codebuild/$ACCOUNT_ID/projects/$PROJECT_NAME/build/${BUILD_ID//:/%3A}"

PHASE=""
while true; do
  read -r STATUS CURRENT <<<"$(aws codebuild batch-get-builds --ids "$BUILD_ID" --region "$AWS_REGION" \
    --query 'builds[0].[buildStatus,currentPhase]' --output text)"
  if [ "$CURRENT" != "$PHASE" ]; then
    echo "  phase: $CURRENT"
    PHASE="$CURRENT"
  fi
  case "$STATUS" in
    IN_PROGRESS) sleep 15 ;;
    SUCCEEDED)   echo "Build SUCCEEDED"; break ;;
    *)           echo "Build $STATUS - see console link above"; exit 1 ;;
  esac
done

if [ "${SKIP_ECS_DEPLOY:-}" = "true" ]; then
  echo "Images pushed. ECS not touched (SKIP_ECS_DEPLOY=true)."
  exit 0
fi

SERVICES=(
  lf-api-dashboard-task-service
  lf-discovery-service-task
  lf-scraper-service-task
  lf-categorization-service
  lf-intelligence-service-task
  lf-publishing-service-task
)

echo "Waiting for ECS rollout..."
aws ecs wait services-stable --cluster "$CLUSTER" --services "${SERVICES[@]}" --region "$AWS_REGION"

aws ecs describe-services --cluster "$CLUSTER" --services "${SERVICES[@]}" --region "$AWS_REGION" \
  --query 'services[].[serviceName,runningCount,desiredCount,deployments[0].rolloutState]' --output table

echo "Deployed $SHA"
