import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { InvalidPricingPreviewError, UnknownPricingModelError } from '@/modules/rentals/pricing-preview';
import { InvalidPricingQuantityError, PricingQuantityMissingError } from '@/modules/rentals/pricing';
import { PricingWorksheetPolicyError, PricingWorksheetUnavailableError, createRentalPricingWorksheet, listRentalPricingWorksheets } from '@/modules/rentals/pricing-worksheets';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; requestId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check the selected models, quantities and reason.' }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  if (error instanceof PricingWorksheetUnavailableError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof PricingWorksheetPolicyError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof PricingQuantityMissingError || error instanceof InvalidPricingQuantityError || error instanceof InvalidPricingPreviewError || error instanceof UnknownPricingModelError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof RangeError) return NextResponse.json({ error: 'Calculated amount exceeds the supported range.' }, { status: 400 });
  return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, requestId } = await context.params;
    const worksheets = await listRentalPricingWorksheets(session.user.id, companyId, requestId);
    return NextResponse.json({ worksheets }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, requestId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const worksheet = await createRentalPricingWorksheet({ ...body, actorId: session.user.id, companyId, requestId });
    return NextResponse.json({ worksheet }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
