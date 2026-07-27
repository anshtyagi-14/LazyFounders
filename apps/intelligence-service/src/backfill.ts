import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

async function main() {
  const prisma = new PrismaClient();
  const redis = new Redis({ host: 'localhost', port: 6379 });
  const intelligenceQueue = new Queue('intelligence-jobs', {
    connection: redis,
    prefix: 'lf',
  });

  const categorizations = await prisma.categorizationResult.findMany({
    select: { id: true },
    skip: 50,
    take: 5 
  });

  console.log(`Pushing ${categorizations.length} jobs to intelligence queue...`);

  for (const cat of categorizations) {
    await intelligenceQueue.add('intelligence-job', {
      categorizationResultId: cat.id
    }, {
      jobId: cat.id,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });
  }

  console.log('Done!');
  process.exit(0);
}

main();
