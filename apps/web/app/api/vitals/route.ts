import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const payload = await request.json();
  console.info('Web vitals metric', payload);
  return NextResponse.json({ received: true });
}
