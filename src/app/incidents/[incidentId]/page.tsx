import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  IncidentNotFoundError,
  getIncidentDetail,
} from '@/modules/incidents/incidents';
import { INCIDENT_TYPE_LABELS, type IncidentType } from '@/modules/incidents/incident-transitions';
import { IncidentTransitionForm } from '../incident-actions';
import { IncidentResponseForm } from '../incident-response-form';
import { getIncidentResponsePlan } from '@/modules/incidents/incident-response';

export const dynamic = 'force-dynamic';

function formatWhen(value: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra',
  }).format(value);
}

/** INC-01 (D-071): one incident — facts, affected passengers, governed status. */
export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ incidentId: string }>;
}) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const { incidentId } = await params;
  const prisma = getPrisma();
  const companies = await prisma.company.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
    take: 2,
  });
  if (companies.length !== 1) {
    return <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-10">
      <p className="text-sm text-red-700">Expected exactly one active company before opening an incident.</p>
    </main>;
  }
  const company = companies[0];

  let detail: Awaited<ReturnType<typeof getIncidentDetail>> | null = null;
  let plan: Awaited<ReturnType<typeof getIncidentResponsePlan>> | null = null;
  let notice: string | null = null;
  try {
    detail = await getIncidentDetail({ actorId: session.user.id, companyId: company.id, incidentId });
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      notice = 'Incidents are handled by dispatch and operations managers. Your login does not include that access.';
    } else if (error instanceof IncidentNotFoundError) {
      notice = 'That incident could not be found.';
    } else {
      throw error;
    }
  }

  if (detail) {
    try {
      plan = await getIncidentResponsePlan({ actorId: session.user.id, companyId: company.id, incidentId });
    } catch {
      plan = null;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-10">
      <p className="text-sm"><Link className="font-medium text-slate-900 underline" href="/incidents">← All incidents</Link></p>
      {notice || !detail ? (
        <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-5">
          <p className="text-sm text-amber-900">{notice ?? 'That incident could not be found.'}</p>
        </section>
      ) : (
        <>
          <header className="mt-4">
            <h1 className="text-3xl font-semibold text-slate-950">
              {detail.incident.reference} — {INCIDENT_TYPE_LABELS[detail.incident.incidentType as IncidentType] ?? detail.incident.incidentType}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Status: <strong>{detail.incident.status}</strong> · Severity {detail.incident.severity.toLowerCase()} ·{' '}
              {formatWhen(detail.incident.occurredAt)} (Africa/Accra)
              {detail.incident.locationText ? ` · ${detail.incident.locationText}` : ''}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Reported by {detail.incident.reportedByName}
              {detail.incident.tripReference ? ` · Trip ${detail.incident.tripReference}` : ''}
              {detail.incident.vehicleRegistration ? ` · Vehicle ${detail.incident.vehicleRegistration}` : ''}
              {detail.incident.driverName ? ` · Driver ${detail.incident.driverName}` : ''}
              {detail.incident.assignedResponderName ? ` · Responder ${detail.incident.assignedResponderName}` : ''}
            </p>
          </header>

          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-950">What happened</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">{detail.incident.description}</p>
            {detail.incident.immediateAction ? (
              <p className="mt-2 text-sm text-slate-700"><strong>Immediate action:</strong> {detail.incident.immediateAction}</p>
            ) : null}
            <p className="mt-2 text-sm text-slate-700">
              <strong>People affected (restricted):</strong> {detail.incident.peopleAffected ?? 'Not recorded'}
            </p>
            {detail.incident.resolutionNotes ? (
              <p className="mt-2 text-sm text-slate-700"><strong>Resolution:</strong> {detail.incident.resolutionNotes}</p>
            ) : null}
          </section>

          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-950">
              Affected passengers ({detail.affectedPassengers.length})
            </h2>
            {detail.affectedPassengers.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">
                {detail.incident.tripId
                  ? 'No assigned or boarded passengers on the linked trip.'
                  : 'This incident is not linked to a trip.'}
              </p>
            ) : (
              <ul className="mt-3 grid gap-2 text-sm text-slate-700">
                {detail.affectedPassengers.map((passenger) => (
                  <li className="rounded-md bg-slate-50 px-3 py-2" key={passenger.bookingId}>
                    {passenger.employeeName} — {passenger.reference} ({passenger.status})
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-950">Breakdown response</h2>
            {plan ? (
              <IncidentResponseForm companyId={company.id} plan={plan} />
            ) : (
              <p className="mt-3 text-sm text-slate-600">No response plan is available for this incident.</p>
            )}
          </section>

          <h2 className="mt-8 text-lg font-semibold text-slate-950">Move this incident forward</h2>
          <IncidentTransitionForm
            companyId={company.id}
            incidentId={detail.incident.id}
            status={detail.incident.status}
          />

          <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-950">Status history</h2>
            <ul className="mt-3 grid gap-2 text-sm text-slate-700">
              {detail.history.map((row) => (
                <li className="rounded-md bg-slate-50 px-3 py-2" key={row.sequence}>
                  {row.fromStatus ? `${row.fromStatus} → ` : ''}{row.toStatus} — {row.reason}{' '}
                  <span className="text-slate-500">({row.actorName}, {formatWhen(row.createdAt)})</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
