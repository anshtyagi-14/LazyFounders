import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain');
  
  const discoveryServiceUrl = process.env.DISCOVERY_SERVICE_URL || 'http://localhost:3001';
  const targetUrl = domain 
    ? `${discoveryServiceUrl}/api/admin/live-logs?domain=${domain}`
    : `${discoveryServiceUrl}/api/admin/live-logs`;

  try {
    const response = await fetch(targetUrl);
    
    // We proxy the SSE stream back to the client
    if (!response.body) {
      return new NextResponse('Internal Server Error', { status: 500 });
    }

    return new NextResponse(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
