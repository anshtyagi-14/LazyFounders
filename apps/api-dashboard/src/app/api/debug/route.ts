import { NextResponse } from 'next/server';

export async function GET() {
  const redisUrl = process.env.REDIS_URL || 'NOT_SET';
  const masked = redisUrl === 'NOT_SET' ? 'NOT_SET' : redisUrl.substring(0, 12) + '...' + redisUrl.slice(-15);
  return NextResponse.json({ 
    redisUrl: masked,
    envCount: Object.keys(process.env).length
  });
}
