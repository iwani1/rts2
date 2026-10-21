import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import {
  getRentalPortalHome,
  RentalPortalNotLinkedError,
  type RentalPortalRequestSummary,
} from '@/modules/rental-portal/portal';
import { RentalDraftActions, RentalEnquiryForm } from './portal-actions';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function RequestCard({ companyId, request }: { companyId: string; request: RentalPortalRequestSummary }) {
  return <article className="vehicle-card">
    <div className="vehicle-card-heading">
      <h3>{request.pickupLocation ?? 'Pickup to be confirmed'} → {request.destination ?? 'Destination to be confirmed'}</h3>
      <span className="status-pill">{request.status}</span>
    </div>
    <dl className="vehicle-specs">
      <div><dt>Service date</dt><dd>{formatDate(request.serviceDate)}</dd></div>
      <div><dt>Departure</dt><dd>{request.departureTime ?? '—'}</dd></div>
      <div><dt>Return</dt><dd>{request.returnTime ?? (request.durationMinutes ? `${request.durationMinutes} minutes` : '—')}</dd></div>
      <div><dt>Passengers</dt><dd>{request.passengerCount ?? '—'}</dd></div>
      <div><dt>Vehicle type</dt><dd>{request.requestedVehicleType ?? 'To be advised'}</dd></div>
      <div><dt>Purpose</dt><dd>{request.purpose ?? '—'}</dd></div>
    </dl>
    {(request.canEdit || request.canSubmit || request.canWithdraw) && (
      <RentalDraftActions companyId={companyId} request={request} />
    )}
    {request.status === 'Under Review' && (
      <p className="form-help">Our team is reviewing this request. It can no longer be changed or withdrawn online — contact us if anything changes.</p>
    )}
    {request.status === 'Declined' && (
      <p className="form-help">We could not take this request on. Contact us and we will help you find an alternative.</p>
    )}
  </article>;
}

/** RNT-09 (D-066): the rental customer portal — own profile, enquiries, requests. */
export default async function RentalPortalPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const prisma = getPrisma();
  const companies = await prisma.company.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
    take: 2,
  });
  if (companies.length !== 1) {
    return <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
      <p className="text-sm text-red-700">Expected exactly one active company before opening the rental portal.</p>
    </main>;
  }
  const company = companies[0];

  let home = null;
  let notLinked = false;
  try {
    home = await getRentalPortalHome({ actorId: session.user.id, companyId: company.id });
  } catch (error) {
    if (error instanceof RentalPortalNotLinkedError) notLinked = true;
    else throw error;
  }

  return <main className="fleet-page">
    <header className="fleet-page-header">
      <Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Rental portal navigation">
        <Link href="/">Workspace</Link>
        <span aria-current="page">My rentals</span>
      </nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row">
        <div>
          <p className="eyebrow">{company.name}</p>
          <h1>My rentals</h1>
          <p className="muted">Send rental enquiries, track your requests, and withdraw a request before our team starts reviewing it.</p>
        </div>
        <Link className="button-link" href="/">Back to workspace</Link>
      </div>

      {notLinked || !home ? (
        <section className="fleet-list-panel">
          <h2>Your account is not linked yet</h2>
          <p className="muted">
            This login is not yet connected to a customer record, so we cannot show your requests.
            Ask Richie Transport to link your account, then refresh this page.
          </p>
        </section>
      ) : <>
        <section className="fleet-list-panel" aria-labelledby="rental-profile-title">
          <div className="fleet-list-heading"><div>
            <h2 id="rental-profile-title">{home.profile.displayName}</h2>
            <p className="muted">Your customer profile as held by {company.name}. Contact us to correct anything.</p>
          </div></div>
          <dl className="vehicle-specs">
            <div><dt>Reference</dt><dd>{home.profile.reference ?? '—'}</dd></div>
            <div><dt>Contact person</dt><dd>{home.profile.contactPerson ?? '—'}</dd></div>
            <div><dt>Telephone</dt><dd>{home.profile.telephone ?? '—'}</dd></div>
            <div><dt>Email</dt><dd>{home.profile.email ?? '—'}</dd></div>
            <div><dt>Customer type</dt><dd>{home.profile.customerType ?? '—'}</dd></div>
            <div><dt>Billing details</dt><dd>{home.profile.billingDetails ?? '—'}</dd></div>
          </dl>
        </section>

        <section className="fleet-list-panel" aria-labelledby="rental-enquiry-title">
          <div className="fleet-list-heading"><div>
            <h2 id="rental-enquiry-title">New rental enquiry</h2>
            <p className="muted">Start with what you know; you can edit a Draft any time before submitting it.</p>
          </div></div>
          <RentalEnquiryForm companyId={company.id} />
        </section>

        <section aria-labelledby="rental-requests-title">
          <h2 id="rental-requests-title">Your requests</h2>
          {home.requests.length === 0
            ? <p className="muted">You have not sent any rental requests yet.</p>
            : <div className="vehicle-grid">{home.requests.map((request) => (
              <RequestCard key={request.requestId} companyId={company.id} request={request} />
            ))}</div>}
        </section>

        <section className="fleet-list-panel" aria-labelledby="rental-money-title">
          <div className="fleet-list-heading"><div><h2 id="rental-money-title">Quotations and payments</h2></div></div>
          <p className="muted">{home.quotations.message}</p>
          <p className="muted">{home.payments.message}</p>
        </section>
      </>}
    </div>
  </main>;
}
