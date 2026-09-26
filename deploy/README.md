# Deploying LazyFounders

The six services run on ECS (EC2 launch type) in cluster `lazyfounders-cluster`,
region `ap-south-1`, account `248746142729`. The dashboard sits behind the
`lf-dashboard-alb` load balancer. Images live in ECR as `lf-*`.

Images are built on a **throwaway arm64 EC2 host** (`deploy/ec2-build.sh`),
not locally and not on CodeBuild — the `lazyfounders-build` CodeBuild project
was never created on this account. The cluster runs Graviton, so images must
be arm64.

## One-time machine setup

Deploying uses two AWS users:

| Profile | User | Used for |
|---|---|---|
| default | `github-action` | S3 source upload, ECR, ECS rollout |
| `dhando-dev` | `dhando-dev` | launching the build host (`ec2:RunInstances`) |

Add the second one once per machine:

```bash
aws configure --profile dhando-dev    # region ap-south-1
```

`dhando-dev` needs the grant in `deploy/build-host-policy.json`. To use a
different profile, set `EC2_AWS_PROFILE`.

`deploy/codebuild-setup.sh` and `buildspec.yml` are kept in case an admin
bootstraps CodeBuild later; nothing calls them today.

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
# Only if the commit adds a Prisma migration:
DATABASE_URL=<prod-url> npm run db:migrate

bash deploy/deploy.sh
```

That one command builds all six images on EC2 and waits for them (15–25
minutes), registers task definitions with `deploy/.env.production`, rolls every
service once, waits for ECS to stabilise, and smoke-tests
`https://lazyfounder.in`. It exits non-zero at the first step that fails.

`SKIP_ECS_DEPLOY=true` stops after the images are pushed.

`deploy.sh` archives `git HEAD`, not your working tree, so commit before
deploying. Images are tagged with the first 12 characters of the commit sha as
well as `latest`. Task definitions point at `latest`, so switching a service
to an older task definition revision does not bring back old code. To roll
back, check out the older commit and run `deploy.sh` again.

## Domain and HTTPS

`lazyfounder.in` is being moved from GoDaddy DNS to Route53 by
`deploy/route53-setup.sh`. The zone, the certificate request and the records
already exist:

| | |
|---|---|
| Hosted zone | `Z005056223VN82AG864O2` |
| Certificate | `.../certificate/d94691a8-aa80-416f-b527-3a0619fcdfa4` (ap-south-1) |

`https://lazyfounder.in` is live. The GoDaddy nameservers point at Route53,
the certificate is `ISSUED`, the ALB has an HTTPS:443 listener, and
`deploy/.env.production` already uses the domain for `NEXT_PUBLIC_SITE_URL`
and `REVALIDATE_URL`.

As of 2026-09-25 two listener changes are still missing:

- HTTP:80 forwards to the app instead of returning a 301 to HTTPS.
- `www.lazyfounder.in` serves the whole site instead of a 301 to the apex.

Both are in section 6 of the script. Neither `github-action` nor `dhando-dev`
has `elasticloadbalancing:ModifyListener` or `CreateRule`, so apply them in
the console (EC2 → Load Balancers → `lf-dashboard-alb` → Listeners), or grant
those two actions and run:

```bash
L80=arn:aws:elasticloadbalancing:ap-south-1:248746142729:listener/app/lf-dashboard-alb/42c5f49b556f28d8/a24fefa6615ad930
L443=arn:aws:elasticloadbalancing:ap-south-1:248746142729:listener/app/lf-dashboard-alb/42c5f49b556f28d8/50054ca042912e66

aws elbv2 modify-listener --region ap-south-1 --listener-arn "$L80" \
  --default-actions 'Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}'

aws elbv2 create-rule --region ap-south-1 --listener-arn "$L443" --priority 10 \
  --conditions 'Field=host-header,Values=www.lazyfounder.in' \
  --actions 'Type=redirect,RedirectConfig={Protocol=HTTPS,Host=lazyfounder.in,Port=443,Path=/#{path},Query=#{query},StatusCode=HTTP_301}'
```

In Git Bash, set `MSYS_NO_PATHCONV=1` first so the `/#{path}` argument is not
rewritten into a Windows path.

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
