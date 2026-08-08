import { NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    if (!body.text || !body.category) {
      return NextResponse.json({ success: false, error: 'text and category are required in request body' }, { status: 400 });
    }

    try {
      const intelligenceServiceUrl = process.env.INTELLIGENCE_SERVICE_URL || 'http://localhost:3004';
      const response = await fetch(`${intelligenceServiceUrl}/api/stateless/intelligence`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: body.text, category: body.category }),
      });

      if (!response.ok) {
        throw new Error(`Intelligence service responded with status ${response.status}`);
      }

      const result = await response.json();

      return NextResponse.json({
        success: true,
        message: 'Intelligence Rewrite completed via stateless proxy.',
        data: result.data,
        _meta: {
          service: 'IntelligenceEngine',
          apiKeyName: auth.apiKey?.name
        }
      });
    } catch (error: any) {
      return NextResponse.json({
        success: false,
        error: 'Failed to communicate with stateless Intelligence Service',
        details: error.message
      }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
