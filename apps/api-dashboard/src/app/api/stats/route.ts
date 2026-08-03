import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Redis from 'ioredis';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let postgresOk = false;
    let redisOk = false;

    try {
      await prisma.$queryRaw`SELECT 1`;
      postgresOk = true;
    } catch (e) {
      console.error('Postgres health check failed', e);
    }

    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      const redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true,
        family: 0, // Critical for Upstash DNS resolution on Vercel
        tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined
      });
      redis.on('error', () => {}); // Catch background connection errors
      const pingRes = await redis.ping();
      if (pingRes === 'PONG') {
        redisOk = true;
      }
      redis.quit();
    } catch (e) {
      console.error('Redis health check failed', e);
    }

    const [originalContent, scrapeResults, categorizationResults, duplicates, categoryData] = await Promise.all([
      prisma.originalContent.count(),
      prisma.scrapeResult.count(),
      prisma.categorizationResult.count(),
      prisma.intelligenceResult.count({
        where: {
          isDuplicate: true
        }
      }),
      prisma.categorizationResult.groupBy({
        by: ['primaryCategory'],
        _count: { primaryCategory: true },
        where: { primaryCategory: { not: null } },
      })
    ]);

    const categories = categoryData
      .filter(c => c.primaryCategory)
      .map(c => ({
        name: c.primaryCategory,
        count: c._count.primaryCategory
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      success: true,
      stats: {
        originalContent,
        scrapeResults,
        categorizationResults,
        duplicates,
        categories,
        health: {
          postgres: postgresOk,
          redis: redisOk
        }
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
