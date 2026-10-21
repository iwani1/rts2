import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { getFinanceReport } from '@/modules/reports/finance-reports';
import { renderPdf } from '@/modules/reports/pdf';
import { financeReportPdfModel } from '@/modules/reports/pdf-reports';
import { ReportCompanyNotFoundError } from '@/modules/reports/transport-reports';
import { reportFiltersFrom } from '@/modules/reports/report-schema';

export const runtime = 'nodejs';

/** RPT-05 / D-088: PDF of exactly the RPT-03 finance report. */
export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const report = await getFinanceReport({
      actorId: session.user.id, companyId, ...reportFiltersFrom(new URL(request.url)),
    });
    return new NextResponse(new Uint8Array(renderPdf(financeReportPdfModel(report))), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="finance-report.pdf"',
      },
    });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
    if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
    if (error instanceof ReportCompanyNotFoundError) return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
    console.error('Unexpected finance PDF export API error', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
  }
}
