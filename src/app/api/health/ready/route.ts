import { NextResponse } from 'next/server';
import { getPrisma } from '@/server/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: 'ok',
      service: 'richie-tms',
      dependencies: { database: 'ok' },
    }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({
      status: 'unavailable',
      service: 'richie-tms',
      dependencies: { database: 'unavailable' },
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
