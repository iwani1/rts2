import { redirect } from 'next/navigation';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';
type LoginPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  if ('email' in params || 'password' in params) redirect('/login');

  return <main className="login-shell">
    <section className="login-panel" aria-labelledby="login-title">
      <p className="eyebrow">Richie Transport Services</p>
      <h1 id="login-title">Sign in to operations</h1>
      <p className="muted">Use the account details provided by your administrator.</p>
      <LoginForm />
    </section>
  </main>;
}
