import { NextResponse } from 'next/server';
export function GET() {
  return NextResponse.json({ status: 'ok', service: 'richie-tms' }, { status: 200 });
}
