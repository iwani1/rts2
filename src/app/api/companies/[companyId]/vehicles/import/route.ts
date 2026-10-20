import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { FleetCompanyNotFoundError, VehicleImportValidationError, importVehiclesFromCsv } from '@/modules/fleet/vehicles';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId } = await context.params;
    const body = z.object({
      csv: z.string().min(1).max(2_000_000),
      reason: z.string().trim().min(8).max(500),
    }).strict().parse(await request.json());
    const result = await importVehiclesFromCsv({ ...body, actorId: session.user.id, companyId });
    return NextResponse.json({ result }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Provide a CSV file and a reason of at least eight characters.' }, { status: 400 });
    }
    if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    if (error instanceof FleetCompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
    if (error instanceof VehicleImportValidationError) {
      return NextResponse.json({ error: error.message, preview: error.preview }, { status: 422 });
    }
    return NextResponse.json({ error: 'The vehicle CSV could not be imported.' }, { status: 500 });
  }
}
