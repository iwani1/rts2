import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  EmployeeClientNotFoundError,
  EmployeeCompanyNotFoundError,
  previewEmployeeImport,
} from '@/modules/employees/employees';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId } = await context.params;
    const body = z.object({
      clientId: z.string().trim().min(1).max(128),
      csv: z.string().min(1).max(2_000_000),
    }).strict().parse(await request.json());
    const preview = await previewEmployeeImport({ ...body, actorId: session.user.id, companyId });
    return NextResponse.json({ preview }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Provide a client and a CSV file to preview.' }, { status: 400 });
    }
    if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    if (error instanceof EmployeeCompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
    if (error instanceof EmployeeClientNotFoundError) return NextResponse.json({ error: 'Active client not found in this company.' }, { status: 400 });
    return NextResponse.json({ error: 'The employee CSV could not be previewed.' }, { status: 500 });
  }
}
