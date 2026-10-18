import { NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { isActiveSuperAdmin, PermissionDeniedError } from '@/modules/auth/permissions';
import { getAuth } from '@/server/auth';
import { CompanyNotFoundError, listCompanySettingStatus, setCompanySetting } from '@/modules/settings/registry';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string }> };

const updateSchema = z.object({
  key: z.string().min(1).max(128),
  value: z.unknown(),
  reason: z.string().trim().min(8).max(500),
}).strict();

function errorResponse(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (error instanceof PermissionDeniedError) {
    return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  }
  if (error instanceof CompanyNotFoundError) {
    return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  }
  return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
}

async function authenticatedAdmin(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return { response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  if (!await isActiveSuperAdmin(session.user.id)) {
    return { response: NextResponse.json({ error: 'Access denied.' }, { status: 403 }) };
  }
  return { userId: session.user.id };
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await authenticatedAdmin(request);
  if ('response' in auth) return auth.response;
  try {
    const { companyId } = await context.params;
    const settings = await listCompanySettingStatus(companyId);
    return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await authenticatedAdmin(request);
  if ('response' in auth) return auth.response;
  try {
    const { companyId } = await context.params;
    const body = updateSchema.parse(await request.json());
    const setting = await setCompanySetting({ ...body, actorId: auth.userId, companyId });
    return NextResponse.json({ setting }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
