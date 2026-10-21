import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  ContractClientNotFoundError,
  ContractCompanyNotFoundError,
  ContractNotFoundError,
  ContractPolicyError,
  ContractTransitionNotAllowedError,
  transitionContract,
} from '@/modules/contracts/contracts';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; contractId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check the submitted contract transition.' }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  if (error instanceof ContractCompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  if (error instanceof ContractNotFoundError) return NextResponse.json({ error: 'Contract not found.' }, { status: 404 });
  if (error instanceof ContractClientNotFoundError) return NextResponse.json({ error: 'Active client not found in this company.' }, { status: 400 });
  if (error instanceof ContractTransitionNotAllowedError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof ContractPolicyError) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, contractId } = await context.params;
    const contract = await transitionContract(await request.json(), session.user.id, companyId, contractId);
    return NextResponse.json({ contract }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
