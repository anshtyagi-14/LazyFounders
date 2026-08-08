import { NextResponse } from 'next/server';
import { triggerDiscovery } from '@/app/actions';

export async function POST(request: Request) {
  try {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ success: false, error: 'URL is required' }, { status: 400, headers: corsHeaders });
    }

    const result = await triggerDiscovery(url);
    
    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function OPTIONS(request: Request) {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
