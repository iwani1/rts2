import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  EmployeeClientNotFoundError,
  EmployeeCompanyNotFoundError,
  EmployeeReferenceTakenError,
  InvalidEmployeeCursorError,
  createEmployee,
  listEmployees,
} from '@/modules/employees/employees';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check the submitted employee details.' }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  if (error instanceof EmployeeCompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  if (error instanceof EmployeeClientNotFoundError) return NextResponse.json({ error: 'Active client not found in this company.' }, { status: 400 });
  if (error instanceof EmployeeReferenceTakenError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof InvalidEmployeeCursorError) return NextResponse.json({ error: 'Invalid employee page cursor.' }, { status: 400 });
  return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId } = await context.params;
    const url = new URL(request.url);
    const result = await listEmployees({
      actorId: session.user.id,
      companyId,
      search: url.searchParams.get('search') ?? undefined,
      clientId: url.searchParams.get('clientId') ?? undefined,
      transportEligible: url.searchParams.get('transportEligible') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId } = await context.params;
    const employee = await createEmployee(await request.json(), session.user.id, companyId);
    return NextResponse.json({ employee }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
