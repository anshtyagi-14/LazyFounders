import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const keys = await prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json({ success: true, keys });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = body.name || 'New API Key';
    
    // Generate a secure API key: 'blogy_' + 32 random hex chars
    const rawKey = crypto.randomBytes(16).toString('hex');
    const apiKey = `blogy_${rawKey}`;
    
    const keyRecord = await prisma.apiKey.create({
      data: {
        key: apiKey,
        name
      }
    });
    
    return NextResponse.json({ success: true, key: keyRecord });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
