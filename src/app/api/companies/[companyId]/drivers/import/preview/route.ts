import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { DriverCompanyNotFoundError, previewDriverImport } from '@/modules/fleet/drivers';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId } = await context.params;
    const body = z.object({ csv: z.string().min(1).max(2_000_000) }).strict().parse(await request.json());
    const preview = await previewDriverImport({ ...body, actorId: session.user.id, companyId });
    return NextResponse.json({ preview }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Provide a CSV file to preview.' }, { status: 400 });
    if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    if (error instanceof DriverCompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
    return NextResponse.json({ error: 'The driver CSV could not be previewed.' }, { status: 500 });
  }
}
