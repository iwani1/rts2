import { ZodError } from 'zod';
import { requireApiSession } from '@/modules/auth/api';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  DispatchCompanyNotFoundError,
  DispatchValidationError,
  getDispatchBoard,
} from '@/modules/dispatch/dispatch';

function apiError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return Response.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof DispatchCompanyNotFoundError) return Response.json({ error: error.code, message: error.message }, { status: 404 });
  if (error instanceof DispatchValidationError) return Response.json({ error: error.code, message: error.message }, { status: 400 });
  console.error('Unexpected dispatch board API error', error);
  return Response.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await requireApiSession();
    const { companyId } = await context.params;
    const date = new URL(request.url).searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
    return Response.json(await getDispatchBoard({ actorId: session.user.id, companyId, date }));
  } catch (error) {
    return apiError(error);
  }
}
