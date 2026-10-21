import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  EmployeeClientNotFoundError,
  EmployeeCompanyNotFoundError,
  EmployeeNotFoundError,
  EmployeeReferenceTakenError,
  archiveEmployee,
  getEmployee,
  updateEmployee,
} from '@/modules/employees/employees';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; employeeId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check the submitted employee details.' }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  if (error instanceof EmployeeCompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  if (error instanceof EmployeeNotFoundError) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });
  if (error instanceof EmployeeClientNotFoundError) return NextResponse.json({ error: 'Active client not found in this company.' }, { status: 400 });
  if (error instanceof EmployeeReferenceTakenError) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const params = await context.params;
    const result = await getEmployee({ actorId: session.user.id, ...params });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, employeeId } = await context.params;
    const employee = await updateEmployee(await request.json(), session.user.id, companyId, employeeId);
    return NextResponse.json({ employee }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, employeeId } = await context.params;
    const body = await request.json() as { reason?: unknown };
    const result = await archiveEmployee({
      actorId: session.user.id,
      companyId,
      employeeId,
      reason: typeof body.reason === 'string' ? body.reason : '',
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
