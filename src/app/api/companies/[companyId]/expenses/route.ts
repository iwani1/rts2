import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { expenseApiError } from '@/modules/finance/expense-api-error';
import { createExpense, listExpenses } from '@/modules/finance/expenses';

export const runtime = 'nodejs';


export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const url = new URL(request.url);
    const result = await listExpenses({
      actorId: session.user.id,
      companyId,
      status: url.searchParams.get('status') ?? undefined,
      category: url.searchParams.get('category') ?? undefined,
      vehicleId: url.searchParams.get('vehicleId') ?? undefined,
      tripId: url.searchParams.get('tripId') ?? undefined,
      fromDate: url.searchParams.get('fromDate') ?? undefined,
      toDate: url.searchParams.get('toDate') ?? undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return expenseApiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const expense = await createExpense({ ...body, actorId: session.user.id, companyId });
    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    return expenseApiError(error);
  }
}
