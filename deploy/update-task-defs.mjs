#!/usr/bin/env node
/**
 * Merge production environment variables into the six LazyFounders ECS task
 * definitions and register new revisions.
 *
 *   node deploy/update-task-defs.mjs                 # register revisions, print a diff
 *   node deploy/update-task-defs.mjs --deploy        # ...and roll the services
 *   node deploy/update-task-defs.mjs --dry-run       # show the diff, change nothing
 *
 * Values come from deploy/.env.production (gitignored). Existing values on the
 * task definition are kept unless the file overrides them, so this is safe to
 * re-run. Set a key to an empty value to remove it.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGION = process.env.AWS_REGION || 'ap-south-1';
const CLUSTER = process.env.ECS_CLUSTER || 'lazyfounders-cluster';
const ENV_FILE = process.env.ENV_FILE || resolve(ROOT, 'deploy/.env.production');

const DEPLOY = process.argv.includes('--deploy');
const DRY_RUN = process.argv.includes('--dry-run');

/** service name -> task definition family, plus env only that service needs. */
const SERVICES = [
  { service: 'lf-api-dashboard-task-service', family: 'lf-api-dashboard-task', env: { PORT: '3000' } },
  {
    service: 'lf-discovery-service-task',
    family: 'lf-discovery-service-task',
    // The scheduler must run in exactly one process or sources get crawled twice.
    env: { PORT: '3001', PIPELINE_SCHEDULER_ENABLED: 'true' },
  },
  { service: 'lf-scraper-service-task', family: 'lf-scraper-service-task', env: { PORT: '3002', PIPELINE_SCHEDULER_ENABLED: 'false' } },
  { service: 'lf-categorization-service', family: 'lf-categorization-service-task', env: { PORT: '3003', PIPELINE_SCHEDULER_ENABLED: 'false' } },
  { service: 'lf-intelligence-service-task', family: 'lf-intelligence-service-task', env: { PORT: '3004', PIPELINE_SCHEDULER_ENABLED: 'false' } },
  { service: 'lf-publishing-service-task', family: 'lf-publishing-service-task', env: { PORT: '3005', PIPELINE_SCHEDULER_ENABLED: 'false' } },
];

/** Keys whose values must never be printed. */
const SECRET = /(SECRET|TOKEN|PASSWORD|ACCESS_KEY|DATABASE_URL|REDIS_URL|EDITOR_USERS)/i;
const show = (k, v) => (SECRET.test(k) ? `<${v ? 'set' : 'empty'}>` : v);

/** Editor credentials are only ever read by the dashboard; workers never see them. */
const DASHBOARD_ONLY = ['EDITOR_USERS', 'ADMIN_USER', 'ADMIN_PASSWORD'];

function aws(args) {
  return execFileSync('aws', [...args, '--region', REGION, '--output', 'json'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: 'UTF-8' },
  });
}

function parseEnvFile(path) {
  if (!existsSync(path)) {
    console.error(`Missing ${path}. Copy deploy/.env.production.example and fill it in.`);
    process.exit(1);
  }
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    let value = line.slice(eq + 1).trim();
    // Strip one layer of surrounding quotes, so values with spaces survive.
    if (value.length > 1 && /^(".*"|'.*')$/s.test(value)) value = value.slice(1, -1);
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

const shared = parseEnvFile(ENV_FILE);
console.log(`Loaded ${Object.keys(shared).length} keys from ${ENV_FILE}\n`);

const registered = [];

for (const { service, family, env: extra } of SERVICES) {
  const td = JSON.parse(aws(['ecs', 'describe-task-definition', '--task-definition', family])).taskDefinition;
  const container = td.containerDefinitions[0];
  const isDashboard = family === 'lf-api-dashboard-task';

  const current = new Map((container.environment || []).map((e) => [e.name, e.value]));
  const desired = new Map(current);
  for (const [k, v] of Object.entries({ ...shared, ...extra })) {
    if (!isDashboard && DASHBOARD_ONLY.includes(k)) continue;
    if (v === '') desired.delete(k);
    else desired.set(k, v);
  }
  // Strip them from workers that picked them up in an earlier run.
  if (!isDashboard) for (const k of DASHBOARD_ONLY) desired.delete(k);

  const added = [...desired].filter(([k]) => !current.has(k));
  const changed = [...desired].filter(([k, v]) => current.has(k) && current.get(k) !== v);
  const removed = [...current.keys()].filter((k) => !desired.has(k));

  console.log(`=== ${service}  (${family}:${td.revision})`);
  for (const [k, v] of added) console.log(`  + ${k}=${show(k, v)}`);
  for (const [k, v] of changed) console.log(`  ~ ${k}: ${show(k, current.get(k))} -> ${show(k, v)}`);
  for (const k of removed) console.log(`  - ${k}`);
  if (!added.length && !changed.length && !removed.length) console.log('  (no change)');

  if (DRY_RUN) {
    console.log();
    continue;
  }

  container.environment = [...desired].map(([name, value]) => ({ name, value }));

  // describe-task-definition returns read-only fields that register rejects.
  for (const k of [
    'taskDefinitionArn', 'revision', 'status', 'requiresAttributes',
    'compatibilities', 'registeredAt', 'registeredBy', 'deregisteredAt',
  ]) delete td[k];

  const result = JSON.parse(aws([
    'ecs', 'register-task-definition',
    '--cli-input-json', JSON.stringify(td),
  ]));
  const rev = result.taskDefinition.revision;
  console.log(`  registered ${family}:${rev}\n`);
  registered.push({ service, family, revision: rev });
}

if (DRY_RUN) {
  console.log('Dry run - nothing registered.');
  process.exit(0);
}

if (!DEPLOY) {
  console.log('Revisions registered but NOT deployed. Re-run with --deploy, or deploy images first.');
  process.exit(0);
}

console.log('Rolling services...');
for (const { service, family, revision } of registered) {
  aws(['ecs', 'update-service', '--cluster', CLUSTER, '--service', service, '--task-definition', `${family}:${revision}`, '--force-new-deployment']);
  console.log(`  ${service} -> ${family}:${revision}`);
}

console.log('\nWaiting for services to stabilise...');
aws(['ecs', 'wait', 'services-stable', '--cluster', CLUSTER, '--services', ...SERVICES.map((s) => s.service)]);
console.log('All services stable.');
