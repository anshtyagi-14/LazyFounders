import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const discoveryServiceUrl = process.env.DISCOVERY_SERVICE_URL || 'http://localhost:3001';
    const response = await fetch(`${discoveryServiceUrl}/api/admin/sources`);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
