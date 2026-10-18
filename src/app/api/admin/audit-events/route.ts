import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isActiveSuperAdmin } from '@/modules/auth/permissions';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';

export const runtime = 'nodejs';
const pageSize = 50;
const querySchema = z.object({
  before: z.string().min(1).max(64).optional(),
}).strict();

export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!await isActiveSuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsedQuery.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const events = await getPrisma().auditEvent.findMany({
    take: pageSize + 1,
    ...(parsedQuery.data.before ? { cursor: { id: parsedQuery.data.before }, skip: 1 } : {}),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      actorId: true,
      actor: { select: { name: true, email: true } },
      companyId: true,
      action: true,
      entityType: true,
      entityId: true,
      summary: true,
      requestId: true,
      createdAt: true,
    },
  });
  const hasMore = events.length > pageSize;
  const page = events.slice(0, pageSize);
  return NextResponse.json({
    events: page,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
