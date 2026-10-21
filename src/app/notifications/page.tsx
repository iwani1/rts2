import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import {
  getOwnPreferences,
  listOwnNotifications,
  type OwnNotification,
} from '@/modules/notifications/notifications';
import {
  MarkAllReadButton,
  MarkReadButton,
  NotificationPreferencesForm,
} from './notifications-actions';

export const dynamic = 'force-dynamic';

function formatWhen(value: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra',
  }).format(value);
}

function NotificationRow({ companyId, notification }: {
  companyId: string; notification: OwnNotification;
}) {
  const unread = notification.readAt === null;
  return <article className="vehicle-card">
    <div className="vehicle-card-heading">
      <h3>{notification.title}</h3>
      {unread
        ? <span className="status-pill">New</span>
        : <span className="status-pill">Read</span>}
    </div>
    <p className="muted">{notification.body}</p>
    <p className="muted">{formatWhen(notification.createdAt)} (Africa/Accra)</p>
    {unread && <MarkReadButton companyId={companyId} notificationId={notification.notificationId} />}
  </article>;
}

/** NTF-01 (D-068): the signed-in user's own notification inbox. */
export default async function NotificationsPage() {
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
      <p className="text-sm text-red-700">Expected exactly one active company before opening notifications.</p>
    </main>;
  }
  const company = companies[0];
  const [inbox, preferences] = await Promise.all([
    listOwnNotifications({ userId: session.user.id, companyId: company.id }),
    getOwnPreferences({ userId: session.user.id, companyId: company.id }),
  ]);

  return <main className="fleet-page">
    <header className="fleet-page-header">
      <Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Notifications navigation">
        <Link href="/">Workspace</Link>
        <span aria-current="page">Notifications</span>
      </nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row">
        <div>
          <p className="eyebrow">{company.name}</p>
          <h1>Notifications</h1>
          <p className="muted">
            {inbox.unreadCount === 0
              ? 'You are all caught up.'
              : `${inbox.unreadCount} unread notification${inbox.unreadCount === 1 ? '' : 's'}.`}
            {inbox.notifications.length < inbox.totalCount && ` Showing the ${inbox.notifications.length} most recent of ${inbox.totalCount}.`}
          </p>
        </div>
        <div className="client-actions">
          {inbox.unreadCount > 0 && <MarkAllReadButton companyId={company.id} />}
          <Link className="button-link" href="/">Back to workspace</Link>
        </div>
      </div>

      {inbox.notifications.length === 0
        ? <p className="muted">Nothing here yet. Journey confirmations, assignments and rental updates will appear in this inbox.</p>
        : <div className="vehicle-grid">{inbox.notifications.map((notification) => (
          <NotificationRow key={notification.notificationId} companyId={company.id} notification={notification} />
        ))}</div>}

      <section className="fleet-list-panel" aria-labelledby="notification-preferences-title">
        <div className="fleet-list-heading"><div>
          <h2 id="notification-preferences-title">Your notification preferences</h2>
          <p className="muted">Choose how we may reach you. Turning in-app off stops new inbox notifications.</p>
        </div></div>
        <NotificationPreferencesForm companyId={company.id} initial={preferences} />
      </section>
    </div>
  </main>;
}
