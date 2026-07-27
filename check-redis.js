const { Queue } = require('bullmq');
const Redis = require('ioredis');
const redis = new Redis({ host: 'localhost', port: 6379 });

async function check() {
  const q = new Queue('categorization-jobs', { connection: redis, prefix: 'lf' });
  const counts = await q.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed');
  console.log('Categorization Queue Counts:', counts);
  process.exit(0);
}
check();
