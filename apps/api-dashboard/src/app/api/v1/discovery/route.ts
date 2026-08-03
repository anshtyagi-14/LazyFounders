import { NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    if (!body.url) {
      return NextResponse.json({ success: false, error: 'Target URL is required in request body' }, { status: 400 });
    }

    try {
      const response = await fetch('http://localhost:3001/api/stateless/discovery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: body.url }),
      });

      if (!response.ok) {
        throw new Error(`Discovery service responded with status ${response.status}`);
      }

      const result = await response.json();

      return NextResponse.json({
        success: true,
        message: 'Discovery completed via stateless proxy.',
        data: {
          scannedDomain: body.url,
          totalDiscovered: result.data.length,
          urls: result.data.slice(0, 50).map((u: any) => u.url),
          scanDurationMs: Date.now() // rough estimate since it's synchronous
        },
        _meta: {
          service: 'DiscoveryEngine',
          apiKeyName: auth.apiKey?.name
        }
      });
    } catch (error: any) {
      return NextResponse.json({
        success: false,
        error: 'Failed to communicate with stateless Discovery Service',
        details: error.message
      }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
