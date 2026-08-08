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

    // Forward to the stateless microservice endpoint
    try {
      const scraperServiceUrl = process.env.SCRAPER_SERVICE_URL || 'http://localhost:3002';
      const response = await fetch(`${scraperServiceUrl}/api/stateless/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: body.url }),
      });

      if (!response.ok) {
        throw new Error(`Scraper service responded with status ${response.status}`);
      }

      const result = await response.json();

      return NextResponse.json({
        success: true,
        message: 'Scraping completed via stateless proxy.',
        data: result.data,
        _meta: {
          service: 'ScraperEngine',
          apiKeyName: auth.apiKey?.name
        }
      });
    } catch (error: any) {
      return NextResponse.json({
        success: false,
        error: 'Failed to communicate with stateless Scraper Service',
        details: error.message
      }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
