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

## Domain and HTTPS

`lazyfounder.in` is being moved from GoDaddy DNS to Route53 by
`deploy/route53-setup.sh`. The zone, the certificate request and the records
already exist:

| | |
|---|---|
| Hosted zone | `Z005056223VN82AG864O2` |
| Certificate | `.../certificate/d94691a8-aa80-416f-b527-3a0619fcdfa4` (ap-south-1) |

Nothing is live yet. The domain still resolves through GoDaddy, so the
certificate sits in `PENDING_VALIDATION`. To finish:

1. Set these nameservers on `lazyfounder.in` at GoDaddy:
   `ns-584.awsdns-09.net`, `ns-1767.awsdns-28.co.uk`, `ns-374.awsdns-46.com`,
   `ns-1364.awsdns-42.org`
2. Wait for the certificate to validate, then re-run the script without
   `--dns-only` to add the HTTPS listener and the 80 to 443 redirect.
3. Point the app at the domain in `deploy/.env.production`
   (`NEXT_PUBLIC_SITE_URL`, `REVALIDATE_URL`) and run
   `node deploy/update-task-defs.mjs --deploy`.

Credentials are split on this account: `route53` and `acm` need the `dhando-dev`
keys, `elasticloadbalancing` needs `github-action`. Pass the latter as
`ELB_AWS_PROFILE`, or skip the lookup with `ALB_DNS` and `ALB_ZONE`.

## First deploy against an existing database

A database that predates Prisma migrations has no `_prisma_migrations` table.
Baseline it once before the first `db:migrate`, or `0_init` will try to create
tables that already exist:

```bash
DATABASE_URL=<prod-url> npm run db:baseline   # marks 0_init as applied
DATABASE_URL=<prod-url> npm run db:migrate
```
