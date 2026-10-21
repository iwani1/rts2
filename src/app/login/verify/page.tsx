import { VerifyForm } from './verify-form';

export const dynamic = 'force-dynamic';

/** AUTH-06 (D-076): the second-factor challenge after password sign-in. */
export default function VerifyPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Richie TMS</p>
      <h1 className="mt-1 text-3xl font-semibold text-slate-950">Two-factor verification</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Enter the 6-digit code from your authenticator app. You can also use one of your
        one-time backup codes.
      </p>
      <VerifyForm />
    </main>
  );
}
