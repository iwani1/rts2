import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { getProviderConfig } from '@/modules/finance/provider-payments';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  return NextResponse.json(getProviderConfig());
}
