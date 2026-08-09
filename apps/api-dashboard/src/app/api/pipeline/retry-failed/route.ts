import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl);

export async function POST() {
  try {
    const queues = [
      'categorization-jobs',
      'scraper-jobs',
      'intelligence-jobs',
      'publishing-jobs'
    ];
    
    let totalRetried = 0;
    
    for (const queueName of queues) {
      const queue = new Queue(queueName, { connection: redis, prefix: 'lf' });
      const failedJobs = await queue.getJobs(['failed']);
      
      for (const job of failedJobs) {
        await job.retry();
        totalRetried++;
      }
      
      await queue.close();
    }
    
    return NextResponse.json({ success: true, message: `Retried ${totalRetried} failed jobs across all queues!` });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return POST(); // Allow GET for easier testing in the browser
}
