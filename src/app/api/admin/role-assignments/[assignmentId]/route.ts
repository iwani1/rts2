import { NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { PermissionDeniedError, revokeRoleAssignment } from '@/modules/auth/permissions';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';

const revokeSchema = z.object({
  reason: z.string().trim().min(8).max(500),
}).strict();

type RouteContext = { params: Promise<{ assignmentId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    const { assignmentId } = await context.params;
    const { reason } = revokeSchema.parse(await request.json());
    const assignment = await revokeRoleAssignment({
      actorId: session.user.id,
      assignmentId,
      reason,
    });
    return NextResponse.json({ assignment });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }
    if (error instanceof PermissionDeniedError) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
  }
}
