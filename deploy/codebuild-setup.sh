#!/usr/bin/env bash
# One-time CodeBuild bootstrap for LazyFounders.
#
# Run this ONCE with credentials that can create IAM roles and CodeBuild
# projects (an admin user/role in account 248746142729). The day-to-day
# deploy user (github-action) does not need these permissions - it only needs
# the policy in deploy/deployer-policy.json.
#
#   AWS_PROFILE=<admin-profile> bash deploy/codebuild-setup.sh
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"
ACCOUNT_ID="${ACCOUNT_ID:-248746142729}"
PROJECT_NAME="${PROJECT_NAME:-lazyfounders-build}"
ROLE_NAME="${ROLE_NAME:-lazyfounders-codebuild-role}"
SOURCE_BUCKET="${SOURCE_BUCKET:-lazyfounders-build-source-$ACCOUNT_ID}"

echo "Region=$AWS_REGION Account=$ACCOUNT_ID Project=$PROJECT_NAME"

# --- 1. Source bucket (CodeBuild pulls a zip of the working tree from here) ---
if ! aws s3api head-bucket --bucket "$SOURCE_BUCKET" 2>/dev/null; then
  echo "Creating source bucket $SOURCE_BUCKET"
  aws s3api create-bucket --bucket "$SOURCE_BUCKET" --region "$AWS_REGION" \
    --create-bucket-configuration LocationConstraint="$AWS_REGION"
  aws s3api put-public-access-block --bucket "$SOURCE_BUCKET" \
    --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws s3api put-bucket-encryption --bucket "$SOURCE_BUCKET" \
    --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
  # Source zips are disposable build inputs; expire them so they do not pile up.
  aws s3api put-bucket-lifecycle-configuration --bucket "$SOURCE_BUCKET" \
    --lifecycle-configuration \
    '{"Rules":[{"ID":"expire-source","Status":"Enabled","Filter":{"Prefix":""},"Expiration":{"Days":14}}]}'
else
  echo "Source bucket $SOURCE_BUCKET already exists"
fi

# --- 2. CodeBuild service role ---
if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "Creating role $ROLE_NAME"
  aws iam create-role --role-name "$ROLE_NAME" \
    --description "Build and deploy role for the LazyFounders ECS services" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "codebuild.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }' >/dev/null
else
  echo "Role $ROLE_NAME already exists"
fi

echo "Attaching inline policy to $ROLE_NAME"
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name lazyfounders-build \
  --policy-document "$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Logs",
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:$AWS_REGION:$ACCOUNT_ID:log-group:/aws/codebuild/$PROJECT_NAME*"
    },
    {
      "Sid": "SourceBucket",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:GetObjectVersion"],
      "Resource": "arn:aws:s3:::$SOURCE_BUCKET/*"
    },
    {
      "Sid": "EcrAuth",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "EcrPush",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:CompleteLayerUpload",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer"
      ],
      "Resource": "arn:aws:ecr:$AWS_REGION:$ACCOUNT_ID:repository/lf-*"
    },
    {
      "Sid": "EcsDeploy",
      "Effect": "Allow",
      "Action": ["ecs:UpdateService", "ecs:DescribeServices"],
      "Resource": "arn:aws:ecs:$AWS_REGION:$ACCOUNT_ID:service/lazyfounders-cluster/*"
    }
  ]
}
JSON
)"

ROLE_ARN="arn:aws:iam::$ACCOUNT_ID:role/$ROLE_NAME"

# --- 3. CodeBuild project ---
# Playwright images are large; give the build a big compute class and a long
# timeout. LARGE = 8 vCPU / 15 GB, which keeps six image builds under ~30 min.
COMMON_ARGS=(
  --name "$PROJECT_NAME"
  --description "Builds and deploys all six LazyFounders services"
  --source "type=S3,location=$SOURCE_BUCKET/source.zip,buildspec=deploy/buildspec.yml"
  --artifacts "type=NO_ARTIFACTS"
  --environment "type=LINUX_CONTAINER,image=aws/codebuild/amazonlinux2-x86_64-standard:5.0,computeType=BUILD_GENERAL1_LARGE,privilegedMode=true,environmentVariables=[{name=AWS_ACCOUNT_ID,value=$ACCOUNT_ID},{name=ECS_CLUSTER,value=lazyfounders-cluster}]"
  --service-role "$ROLE_ARN"
  --timeout-in-minutes 60
)

if aws codebuild batch-get-projects --names "$PROJECT_NAME" \
     --query 'projects[0].name' --output text 2>/dev/null | grep -q "$PROJECT_NAME"; then
  echo "Updating existing project $PROJECT_NAME"
  aws codebuild update-project "${COMMON_ARGS[@]}" --query 'project.name' --output text
else
  echo "Creating project $PROJECT_NAME"
  # IAM role propagation lags role creation; retry briefly.
  for attempt in 1 2 3 4 5; do
    if aws codebuild create-project "${COMMON_ARGS[@]}" --query 'project.name' --output text; then
      break
    fi
    echo "create-project failed (attempt $attempt), waiting for role propagation..."
    sleep 10
  done
fi

echo
echo "Done. Now grant the deploy user its policy:"
echo "  aws iam put-user-policy --user-name github-action \\"
echo "    --policy-name lazyfounders-deploy \\"
echo "    --policy-document file://deploy/deployer-policy.json"
echo
echo "Then deploy with:  bash deploy/deploy.sh"
