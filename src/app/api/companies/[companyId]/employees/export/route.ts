import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  EmployeeCompanyNotFoundError,
  exportEmployeesCsv,
} from '@/modules/employees/employees';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId } = await context.params;
    const url = new URL(request.url);
    const result = await exportEmployeesCsv({
      actorId: session.user.id,
      companyId,
      clientId: url.searchParams.get('clientId') ?? undefined,
    });
    return new NextResponse(result.csv, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: 'Check the export filters.' }, { status: 400 });
    if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    if (error instanceof EmployeeCompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
    return NextResponse.json({ error: 'The export could not be completed.' }, { status: 500 });
  }
}
