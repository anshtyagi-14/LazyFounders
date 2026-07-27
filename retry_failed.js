const { Queue } = require('bullmq');
const Redis = require('ioredis');

const redis = new Redis();
const queue = new Queue('categorization-jobs', { connection: redis, prefix: 'lf' });

async function retryAllFailed() {
  console.log('Fetching failed jobs...');
  const failedJobs = await queue.getFailed();
  console.log(`Found ${failedJobs.length} failed jobs. Retrying them now...`);
  
  for (const job of failedJobs) {
    await job.retry();
  }
  
  console.log('Successfully moved all failed jobs back to the wait queue!');
  await queue.close();
  redis.disconnect();
}

retryAllFailed().catch(console.error);
