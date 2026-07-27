const { Queue } = require('bullmq');
const Redis = require('ioredis');

const redis = new Redis();

async function checkQueue(name) {
  const q = new Queue(name, { connection: redis, prefix: 'lf' });
  const counts = await q.getJobCounts('wait', 'active', 'delayed', 'completed', 'failed');
  console.log(`Queue: ${name} ->`, counts);
  await q.close();
}

async function main() {
  await checkQueue('scraper-jobs');
  await checkQueue('categorization-jobs');
  await checkQueue('intelligence-jobs');
  await checkQueue('publishing-jobs');
  
  redis.disconnect();
}
main();
