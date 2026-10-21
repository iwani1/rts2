import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { getFinanceReport } from '@/modules/reports/finance-reports';
import { ReportCompanyNotFoundError } from '@/modules/reports/transport-reports';
import { financeReportCsv } from '@/modules/reports/exports';
import { reportFiltersFrom } from '@/modules/reports/report-schema';

export const runtime = 'nodejs';

function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof ReportCompanyNotFoundError) return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
  console.error('Unexpected finance report export API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const report = await getFinanceReport({
      actorId: session.user.id, companyId, ...reportFiltersFrom(new URL(request.url)),
    });
    return new NextResponse(financeReportCsv(report), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="finance-report.csv"',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
