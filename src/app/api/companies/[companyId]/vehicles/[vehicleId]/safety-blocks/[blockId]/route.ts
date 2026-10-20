import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { releaseVehicleSafetyBlock, SafetyBlockNotFoundError, SafetyBlockReleasePolicyError, SafetyBlockVehicleNotFoundError } from '@/modules/maintenance/vehicle-safety-blocks';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; vehicleId: string; blockId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'A completion time, passed inspection record and reason are required.' }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  if (error instanceof SafetyBlockVehicleNotFoundError || error instanceof SafetyBlockNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
  if (error instanceof SafetyBlockReleasePolicyError) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ error: 'The safety block could not be released.' }, { status: 500 });
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, vehicleId, blockId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const block = await releaseVehicleSafetyBlock({ ...body, actorId: session.user.id, companyId, vehicleId, blockId });
    return NextResponse.json({ block }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
