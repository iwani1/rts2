import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { ActiveSafetyBlockExistsError, applyVehicleSafetyBlock, SafetyBlockVehicleNotFoundError } from '@/modules/maintenance/vehicle-safety-blocks';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; vehicleId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check the safety status and reason.' }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  if (error instanceof SafetyBlockVehicleNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
  if (error instanceof ActiveSafetyBlockExistsError) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ error: 'The safety block could not be applied.' }, { status: 500 });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, vehicleId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const block = await applyVehicleSafetyBlock({ ...body, actorId: session.user.id, companyId, vehicleId });
    return NextResponse.json({ block }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
