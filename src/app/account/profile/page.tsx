import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { mayStartSession } from '@/modules/auth/policy';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';

export const dynamic = 'force-dynamic';

export default async function AccountProfilePage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const user = await getPrisma().user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, status: true, createdAt: true },
  });
  if (!user || !mayStartSession(user.status)) redirect('/login');

  return <main className="login-shell">
    <section className="login-panel" aria-labelledby="profile-title">
      <p className="eyebrow">Your account</p>
      <h1 id="profile-title">My profile</h1>
      <p className="muted">This page shows the account details associated with your sign-in. Profile editing and login-history views are not available.</p>
      <dl className="account-profile-details">
        <div><dt>Name</dt><dd>{user.name || 'Name not recorded'}</dd></div>
        <div><dt>Email</dt><dd>{user.email}</dd></div>
        <div><dt>Account status</dt><dd>{user.status}</dd></div>
        <div><dt>Account created</dt><dd><time dateTime={user.createdAt.toISOString()}>{new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeZone: 'Africa/Accra' }).format(user.createdAt)}</time></dd></div>
      </dl>
      <p className="form-help"><Link href="/account/security">Change password</Link></p>
      <p className="form-help"><Link href="/">Back to workspace</Link></p>
    </section>
  </main>;
}
