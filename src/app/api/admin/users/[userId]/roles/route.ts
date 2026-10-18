import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { assignRole, isActiveSuperAdmin, isUniqueRoleAssignmentError, PermissionDeniedError } from '@/modules/auth/permissions';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';

export const runtime = 'nodejs';

const assignSchema = z.object({
  roleCode: z.string().regex(/^[A-Z_]+$/),
  companyId: z.string().min(1).optional(),
  reason: z.string().trim().min(8).max(500),
}).strict();

type RouteContext = { params: Promise<{ userId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (error instanceof PermissionDeniedError) {
    return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  }
  if (isUniqueRoleAssignmentError(error)) {
    return NextResponse.json({ error: 'This active role is already assigned.' }, { status: 409 });
  }
  return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!await isActiveSuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  }

  const { userId } = await context.params;
  const prisma = getPrisma();
  const [user, roles, assignments] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, status: true },
    }),
    prisma.role.findMany({
      orderBy: { code: 'asc' },
      select: { code: true, name: true },
    }),
    prisma.userRoleAssignment.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        role: { select: { name: true } },
        company: { select: { name: true } },
        assignedBy: { select: { name: true, email: true } },
      },
    }),
  ]);
  if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  return NextResponse.json({ user, roles, assignments }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { userId } = await context.params;
    const body = assignSchema.parse(await request.json());
    const assignment = await assignRole({ ...body, actorId: session.user.id, targetUserId: userId });
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
