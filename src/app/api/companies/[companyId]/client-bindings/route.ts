import { ZodError } from 'zod';
import { requireApiSession } from '@/modules/auth/api';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  DashboardCompanyNotFoundError,
  DashboardValidationError,
  bindUserClient,
} from '@/modules/clients/dashboard';

function apiError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return Response.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof DashboardCompanyNotFoundError) return Response.json({ error: error.code, message: error.message }, { status: 404 });
  if (error instanceof DashboardValidationError) return Response.json({ error: error.code, message: error.message }, { status: 400 });
  console.error('Unexpected client binding API error', error);
  return Response.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await requireApiSession();
    const { companyId } = await context.params;
    const result = await bindUserClient(await request.json(), session.user.id, companyId);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
