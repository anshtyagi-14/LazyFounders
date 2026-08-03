import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

// Queues will be initialized lazily inside the handler to prevent top-level crashes if Redis is down


export async function GET() {
    const redisHost = process.env.REDIS_HOST || '127.0.0.1';
    const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379;

    const redis = new Redis(redisPort, redisHost, { 
      maxRetriesPerRequest: 1, 
      connectTimeout: 2000,
      lazyConnect: true // Prevent immediate crash if down
    });
    redis.on('error', () => {}); // Catch background connection errors
    
    // Check if redis is up before hanging on Queue methods
    let redisUp = false;
    try {
      await redis.connect();
      redisUp = true;
    } catch(e) {
      // redis down
    }

    if (!redisUp) {
      return NextResponse.json({ success: false, error: 'Redis is unreachable' }, { status: 503 });
    }

    const queues = [
      new Queue('scraper-jobs', { connection: redis, prefix: 'lf' }),
      new Queue('categorization-jobs', { connection: redis, prefix: 'lf' }),
      new Queue('intelligence-jobs', { connection: redis, prefix: 'lf' }),
      new Queue('publishing-jobs', { connection: redis, prefix: 'lf' })
    ];

  try {
    const stats = await Promise.all(queues.map(async (q) => {
      const [active, waiting, completed, failed] = await Promise.all([
        q.getActiveCount(),
        q.getWaitingCount(),
        q.getCompletedCount(),
        q.getFailedCount()
      ]);
      return {
        name: q.name,
        active,
        waiting,
        completed,
        failed
      };
    }));

    // Cleanup
    await Promise.all(queues.map(q => q.close()));
    redis.quit();

    return NextResponse.json({ success: true, stats });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
