import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    if (typeof body.isActive !== 'boolean') {
      return NextResponse.json({ success: false, error: 'isActive boolean is required' }, { status: 400 });
    }

    const updatedKey = await prisma.apiKey.update({
      where: { id },
      data: { isActive: body.isActive }
    });

    return NextResponse.json({ success: true, key: updatedKey });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
