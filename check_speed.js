const { Queue } = require('bullmq');
const Redis = require('ioredis');

const redis = new Redis();

async function getStats(name) {
  const q = new Queue(name, { connection: redis, prefix: 'lf' });
  const counts = await q.getJobCounts('wait', 'active', 'completed', 'failed');
  await q.close();
  return counts;
}

async function main() {
  console.log("Scraper:", await getStats('scraper-jobs'));
  console.log("Categorization:", await getStats('categorization-jobs'));
  console.log("Intelligence:", await getStats('intelligence-jobs'));
  console.log("Publishing:", await getStats('publishing-jobs'));
  redis.disconnect();
}
main();
