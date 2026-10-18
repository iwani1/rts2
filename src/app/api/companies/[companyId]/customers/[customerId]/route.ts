import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  archiveCustomer,
  CustomerCompanyNotFoundError,
  CustomerNotFoundError,
  getCustomer,
  isUniqueCustomerReferenceError,
  updateCustomer,
} from '@/modules/customers/customers';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; customerId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check the submitted customer details.' }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  if (error instanceof CustomerCompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  if (error instanceof CustomerNotFoundError) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
  if (isUniqueCustomerReferenceError(error)) return NextResponse.json({ error: 'That customer reference is already in use for this company.' }, { status: 409 });
  return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const params = await context.params;
    const result = await getCustomer({ actorId: session.user.id, ...params });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, customerId } = await context.params;
    const customer = await updateCustomer(await request.json(), session.user.id, companyId, customerId);
    return NextResponse.json({ customer }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, customerId } = await context.params;
    const body = await request.json() as { reason?: unknown };
    const result = await archiveCustomer({
      actorId: session.user.id,
      companyId,
      customerId,
      reason: typeof body.reason === 'string' ? body.reason : '',
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
