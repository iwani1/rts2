import { ZodError } from 'zod';
import { requireApiSession } from '@/modules/auth/api';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  ClientBindingNotFoundError,
  DashboardCompanyNotFoundError,
  getCorporateDashboard,
} from '@/modules/clients/dashboard';

function apiError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return Response.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof ClientBindingNotFoundError) return Response.json({ error: error.code, message: error.message }, { status: 403 });
  if (error instanceof DashboardCompanyNotFoundError) return Response.json({ error: error.code, message: error.message }, { status: 404 });
  console.error('Unexpected corporate dashboard API error', error);
  return Response.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await requireApiSession();
    const { companyId } = await context.params;
    const url = new URL(request.url);
    const result = await getCorporateDashboard({
      actorId: session.user.id,
      companyId,
      fromDate: url.searchParams.get('fromDate') ?? undefined,
      toDate: url.searchParams.get('toDate') ?? undefined,
    });
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
