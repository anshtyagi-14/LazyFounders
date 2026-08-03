import { NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    if (!body.text) {
      return NextResponse.json({ success: false, error: 'text is required in request body' }, { status: 400 });
    }

    try {
      const response = await fetch('http://localhost:3003/api/stateless/categorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: body.text }),
      });

      if (!response.ok) {
        throw new Error(`Categorization service responded with status ${response.status}`);
      }

      const result = await response.json();

      return NextResponse.json({
        success: true,
        message: 'Categorization completed via stateless proxy.',
        data: result.data,
        _meta: {
          service: 'CategorizationAI',
          apiKeyName: auth.apiKey?.name
        }
      });
    } catch (error: any) {
      return NextResponse.json({
        success: false,
        error: 'Failed to communicate with stateless Categorization Service',
        details: error.message
      }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
