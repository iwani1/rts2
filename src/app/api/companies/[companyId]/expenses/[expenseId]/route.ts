import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { updatePendingExpense } from '@/modules/finance/expenses';
import { expenseApiError } from '@/modules/finance/expense-api-error';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ companyId: string; expenseId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, expenseId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const expense = await updatePendingExpense({ ...body, actorId: session.user.id, companyId, expenseId });
    return NextResponse.json({ expense });
  } catch (error) {
    return expenseApiError(error);
  }
}
