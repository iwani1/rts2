import { LoginForm } from './login-form';

export default function LoginPage() {
  return <main className="login-shell">
    <section className="login-panel" aria-labelledby="login-title">
      <p className="eyebrow">Richie Transport Services</p>
      <h1 id="login-title">Sign in to operations</h1>
      <p className="muted">Use the account details provided by your administrator.</p>
      <LoginForm />
    </section>
  </main>;
}
