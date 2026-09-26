#!/usr/bin/env bash
# Build all six service images on a throwaway EC2 host and push them to ECR.
#
# The ECS cluster runs on Graviton (t4g.medium), so the build host and the AMI
# must both be arm64 - an x86 image will not run on it at all.
#
# This account has no CodeBuild project and there is no local Docker, so this
# is how images get built. The instance terminates itself when the build
# finishes or fails; this script waits for that and exits non-zero on failure.
#
#   bash deploy/ec2-build.sh              # build HEAD and wait for the result
#   NO_WAIT=true bash deploy/ec2-build.sh # launch and return immediately
#
# Credentials: ECR and S3 use the default profile (github-action). Launching
# the instance needs ec2:RunInstances, which only dhando-dev has, so
# EC2_AWS_PROFILE defaults to "dhando-dev". Set it to another profile, or set
# EC2_AWS_ACCESS_KEY_ID / EC2_AWS_SECRET_ACCESS_KEY instead.
#
# Nothing long-lived is placed on the instance: it receives a 12-hour ECR
# authorization token and a presigned URL for the source archive.
set -euo pipefail

if [ -z "${EC2_AWS_ACCESS_KEY_ID:-}" ]; then
  EC2_AWS_PROFILE="${EC2_AWS_PROFILE:-dhando-dev}"
fi

AWS_REGION="${AWS_REGION:-ap-south-1}"
ACCOUNT_ID="${ACCOUNT_ID:-248746142729}"
REGISTRY="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

SRC_BUCKET="${SRC_BUCKET:-lazyfounders-blog-images}"
SRC_KEY="${SRC_KEY:-_build/source.zip}"

AMI_ID="${AMI_ID:-}"
INSTANCE_TYPE="${INSTANCE_TYPE:-c7g.2xlarge}"
SUBNET_ID="${SUBNET_ID:-}"
VOLUME_GB="${VOLUME_GB:-80}"

SITE_URL="${SITE_URL:-https://lazyfounder.in}"

cd "$(dirname "$0")/.."

# aws for ECR/S3, ec2_aws for launching the instance.
ec2_aws() {
  if [ -n "${EC2_AWS_PROFILE:-}" ]; then
    aws --profile "$EC2_AWS_PROFILE" "$@"
  elif [ -n "${EC2_AWS_ACCESS_KEY_ID:-}" ]; then
    AWS_ACCESS_KEY_ID="$EC2_AWS_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$EC2_AWS_SECRET_ACCESS_KEY" aws "$@"
  else
    aws "$@"
  fi
}

# Fail before archiving anything if the launch credentials are missing.
if ! ec2_aws sts get-caller-identity --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "Cannot use the EC2 launch credentials (profile: ${EC2_AWS_PROFILE:-<keys from env>})." >&2
  echo "Create the profile once with:  aws configure --profile ${EC2_AWS_PROFILE:-dhando-dev}" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "WARNING: working tree is dirty; only committed files are built."
fi
SHA="$(git rev-parse HEAD)"
TAG="${SHA:0:12}"
echo "Building $SHA"

# --- source archive ----------------------------------------------------------
TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

echo "Archiving and uploading source..."
git archive --format=zip -o "$TMPD/source.zip" HEAD
aws s3 cp "$(native "$TMPD/source.zip")" "s3://$SRC_BUCKET/$SRC_KEY" --region "$AWS_REGION" >/dev/null
SRC_URL="$(aws s3 presign "s3://$SRC_BUCKET/$SRC_KEY" --region "$AWS_REGION" --expires-in 43200)"

# --- short-lived ECR token ---------------------------------------------------
# The Windows CLI terminates output with CRLF, which base64 rejects as input.
ECR_TOKEN="$(aws ecr get-authorization-token --region "$AWS_REGION" \
  --query 'authorizationData[0].authorizationToken' --output text \
  | tr -d '\r\n ' | base64 -d | cut -d: -f2-)"
[ -n "$ECR_TOKEN" ] || { echo "Could not obtain an ECR token." >&2; exit 1; }

# --- instance placement ------------------------------------------------------
if [ -z "$AMI_ID" ]; then
  AMI_ID="$(ec2_aws ec2 describe-images --owners amazon --region "$AWS_REGION" \
    --filters "Name=name,Values=al2023-ami-2023*-kernel-6.12-arm64" "Name=state,Values=available" \
    --query 'reverse(sort_by(Images,&CreationDate))[0].ImageId' --output text)"
fi
if [ -z "$SUBNET_ID" ]; then
  VPC_ID="$(ec2_aws ec2 describe-vpcs --region "$AWS_REGION" \
    --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
  SUBNET_ID="$(ec2_aws ec2 describe-subnets --region "$AWS_REGION" \
    --filters Name=vpc-id,Values=$VPC_ID Name=map-public-ip-on-launch,Values=true \
    --query 'Subnets[0].SubnetId' --output text)"
fi
echo "AMI=$AMI_ID Subnet=$SUBNET_ID Type=$INSTANCE_TYPE"

# --- user data ---------------------------------------------------------------
# Everything is echoed to the serial console so `aws ec2 get-console-output`
# can be used to follow or post-mortem the build.
cat > "$TMPD/user-data.sh" <<USERDATA
#!/bin/bash
# ASCII only on the console: the Windows AWS CLI v1 crashes decoding
# characters like the arrows in Next.js build output.
exec > >(tee -a /var/log/lf-build.log | tr -cd '\11\12\40-\176' > /dev/console) 2>&1
set -x

REGISTRY="$REGISTRY"
TAG="$TAG"
SITE_URL="$SITE_URL"

SERVICES="api-dashboard:lf-api-dashboard
discovery-service:lf-discovery-service
scraper-service:lf-scraper-service
categorization-service:lf-categorization-service
intelligence-service:lf-intelligence-service
publishing-service:lf-publishing-service"

finish() {
  echo "=== LF-BUILD-RESULT: \$1 ==="
  sleep 30
  shutdown -h now
  exit 0
}

dnf install -y docker unzip || finish FAILED_DEPS
systemctl start docker || finish FAILED_DOCKER

echo "$ECR_TOKEN" | docker login --username AWS --password-stdin "$REGISTRY" || finish FAILED_LOGIN

curl -sSL --retry 5 --retry-delay 10 -o /tmp/source.zip "$SRC_URL" || finish FAILED_FETCH
mkdir -p /build && cd /build && unzip -q /tmp/source.zip || finish FAILED_UNZIP

# Build everything before pushing anything, so a late failure cannot leave a
# half-updated set of :latest tags in ECR.
while IFS=: read -r APP_DIR REPO; do
  [ -z "\$APP_DIR" ] && continue
  echo "=== building \$APP_DIR ==="
  EXTRA=""
  if [ "\$APP_DIR" = "api-dashboard" ]; then
    EXTRA="--build-arg NEXT_PUBLIC_SITE_URL=\$SITE_URL"
  fi
  docker build \$EXTRA -t "\$REPO:\$TAG" -f "apps/\$APP_DIR/Dockerfile" . || finish "FAILED_BUILD_\$APP_DIR"
  docker tag "\$REPO:\$TAG" "\$REGISTRY/\$REPO:\$TAG"
  docker tag "\$REPO:\$TAG" "\$REGISTRY/\$REPO:latest"
done <<< "\$SERVICES"

while IFS=: read -r APP_DIR REPO; do
  [ -z "\$APP_DIR" ] && continue
  echo "=== pushing \$REPO ==="
  docker push "\$REGISTRY/\$REPO:\$TAG" || finish "FAILED_PUSH_\$REPO"
  docker push "\$REGISTRY/\$REPO:latest" || finish "FAILED_PUSH_\$REPO"
done <<< "\$SERVICES"

finish SUCCESS
USERDATA

# --- launch ------------------------------------------------------------------
echo "Launching build instance..."
INSTANCE_ID="$(ec2_aws ec2 run-instances --region "$AWS_REGION" \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --subnet-id "$SUBNET_ID" \
  --associate-public-ip-address \
  --instance-initiated-shutdown-behavior terminate \
  --metadata-options "HttpTokens=required,HttpEndpoint=enabled" \
  --block-device-mappings "[{\"DeviceName\":\"/dev/xvda\",\"Ebs\":{\"VolumeSize\":$VOLUME_GB,\"VolumeType\":\"gp3\",\"DeleteOnTermination\":true}}]" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=lf-build},{Key=Purpose,Value=image-build}]" \
  --user-data "file://$(native "$TMPD/user-data.sh")" \
  --query 'Instances[0].InstanceId' --output text)"

echo "Instance: $INSTANCE_ID"
echo "Console:  aws --profile ${EC2_AWS_PROFILE:-default} ec2 get-console-output --instance-id $INSTANCE_ID --output text"
echo "TAG=$TAG"

if [ "${NO_WAIT:-}" = "true" ]; then
  exit 0
fi

# --- wait --------------------------------------------------------------------
# Success means every repo has the new tag. Images are pushed only after all
# six build, so a partial set means the push step failed.
REPOS="lf-api-dashboard lf-discovery-service lf-scraper-service lf-categorization-service lf-intelligence-service lf-publishing-service"
all_pushed() {
  for r in $REPOS; do
    aws ecr describe-images --region "$AWS_REGION" --repository-name "$r" \
      --image-ids "imageTag=$TAG" >/dev/null 2>&1 || return 1
  done
}

echo "Waiting for the build (usually 15-25 minutes)..."
DEADLINE=$(( $(date +%s) + ${BUILD_TIMEOUT_MIN:-60} * 60 ))
while true; do
  if all_pushed; then
    echo "All six images pushed as $TAG."
    exit 0
  fi
  STATE="$(ec2_aws ec2 describe-instances --region "$AWS_REGION" --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].State.Name' --output text 2>/dev/null | tr -d '\r')"
  case "$STATE" in
    shutting-down|terminated|stopped)
      # The last push can land just before shutdown; check once more.
      sleep 20
      all_pushed && { echo "All six images pushed as $TAG."; exit 0; }
      echo "Build host $INSTANCE_ID is $STATE but images are missing." >&2
      # EC2 posts console output a few minutes after shutdown; poll for it.
      echo "Fetching its console log (can take up to 5 minutes)..." >&2
      for _ in 1 2 3 4 5 6 7 8 9 10; do
        LOG="$(ec2_aws ec2 get-console-output --region "$AWS_REGION" --instance-id "$INSTANCE_ID" \
          --output text 2>/dev/null | tr -d '\r' || true)"
        if grep -q 'LF-BUILD-RESULT' <<<"$LOG"; then
          grep -m1 'LF-BUILD-RESULT' <<<"$LOG" >&2
          grep -E 'Error|error:|ERR!|failed' <<<"$LOG" | head -25 >&2 || true
          exit 1
        fi
        sleep 30
      done
      echo "Console log not available yet. Later: aws --profile ${EC2_AWS_PROFILE:-default} ec2 get-console-output --instance-id $INSTANCE_ID --output text" >&2
      exit 1 ;;
  esac
  if [ "$(date +%s)" -gt "$DEADLINE" ]; then
    echo "Timed out waiting for $INSTANCE_ID; terminating it." >&2
    ec2_aws ec2 terminate-instances --region "$AWS_REGION" --instance-ids "$INSTANCE_ID" >/dev/null || true
    exit 1
  fi
  echo "  $(date +%H:%M:%S) host $STATE, images not all pushed yet"
  sleep 60
done
