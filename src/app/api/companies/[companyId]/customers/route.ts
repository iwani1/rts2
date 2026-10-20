import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  createCustomer,
  CustomerCompanyNotFoundError,
  InvalidCustomerCursorError,
  isUniqueCustomerReferenceError,
  listCustomers,
} from '@/modules/customers/customers';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check the submitted customer details.' }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  if (error instanceof CustomerCompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  if (error instanceof InvalidCustomerCursorError) return NextResponse.json({ error: 'Invalid customer page cursor.' }, { status: 400 });
  if (isUniqueCustomerReferenceError(error)) return NextResponse.json({ error: 'That customer reference is already in use for this company.' }, { status: 409 });
  return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId } = await context.params;
    const url = new URL(request.url);
    const result = await listCustomers({
      actorId: session.user.id,
      companyId,
      search: url.searchParams.get('search') ?? undefined,
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
    const customer = await createCustomer(await request.json(), session.user.id, companyId);
    return NextResponse.json({ customer }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
