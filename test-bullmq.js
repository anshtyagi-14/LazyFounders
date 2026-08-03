const { Queue } = require('bullmq');
const Redis = require('ioredis');
const redis = new Redis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });
const q = new Queue('publishing-jobs', { connection: redis, prefix: 'lf' });
async function run() {
  const counts = await q.getJobCounts();
  console.log('Publishing Jobs Counts:', counts);
  process.exit(0);
}
run();
