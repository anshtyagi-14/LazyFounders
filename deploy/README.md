# Deploying LazyFounders

The six services run on ECS (EC2 launch type) in cluster `lazyfounders-cluster`,
region `ap-south-1`, account `248746142729`. The dashboard sits behind the
`lf-dashboard-alb` load balancer. Images live in ECR as `lf-*`.

Images are built by **AWS CodeBuild**, not locally — the build needs Docker and
pulls two large Playwright base images.

## One-time bootstrap (needs admin credentials)

The day-to-day deploy user (`github-action`) cannot create CodeBuild projects or
IAM roles. Someone with admin on the account runs this once:

```bash
AWS_PROFILE=<admin-profile> bash deploy/codebuild-setup.sh

aws iam put-user-policy --user-name github-action \
  --policy-name lazyfounders-deploy \
  --policy-document file://deploy/deployer-policy.json
```

That creates the source bucket, a scoped CodeBuild role, and the
`lazyfounders-build` project, then grants `github-action` just enough to start
builds and watch the rollout.

## Environment

Task definition environment lives in `deploy/.env.production` (gitignored).
Start from the example:

```bash
cp deploy/.env.production.example deploy/.env.production
# fill in INTERNAL_API_TOKEN, REVALIDATE_SECRET, EDITOR_USERS, Bedrock keys
node deploy/update-task-defs.mjs --dry-run
```

Values already on a task definition are preserved unless the file overrides
them, so the script is safe to re-run. An empty value deletes the key.

Two things to know:

- **Bedrock.** This account cannot invoke `anthropic.*` models — they return
  `AccessDeniedException`. `mistral.mistral-large-3-675b-instruct` works over
  the Converse API in `ap-south-1`, which is why `BEDROCK_TRANSPORT=converse`.
- **No task role.** The task definitions have `taskRoleArn: null`, so Bedrock
  and S3 credentials are passed as plaintext environment variables. Anyone with
  `ecs:DescribeTaskDefinition` can read them. Creating a task role and moving
  these to it (or to Secrets Manager) is the better end state.

## Deploying

```bash
# 1. Migrations first - additive, but the new code expects the v2 tables.
DATABASE_URL=<prod-url> npm run db:migrate

# 2. Build and push images, but do not roll the services yet.
SKIP_ECS_DEPLOY=true bash deploy/deploy.sh

# 3. Register task definitions with current env and roll everything once.
node deploy/update-task-defs.mjs --deploy
```

Running step 2 without `SKIP_ECS_DEPLOY` also works, but then the services roll
twice — once onto the new images with the old environment, and again in step 3.

`deploy.sh` archives `git HEAD`, not your working tree, so commit before
deploying. It tags each image with the commit sha as well as `latest`, so a
rollback is `aws ecs update-service --task-definition <family>:<older-revision>`.

## First deploy against an existing database

A database that predates Prisma migrations has no `_prisma_migrations` table.
Baseline it once before the first `db:migrate`, or `0_init` will try to create
tables that already exist:

```bash
DATABASE_URL=<prod-url> npm run db:baseline   # marks 0_init as applied
DATABASE_URL=<prod-url> npm run db:migrate
```
