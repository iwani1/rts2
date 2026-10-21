import { validateProductionEnv } from '@/server/production-env';

/**
 * D-092/7C: fail-fast production boot. Runs once when the server
 * starts (never during the production build's data collection).
 * Development and test environments are untouched.
 */
export async function register(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const { errors, warnings } = validateProductionEnv(process.env);
  for (const warning of warnings) {
    console.warn(`[richie-tms] WARNING: ${warning}`);
  }
  if (errors.length > 0) {
    throw new Error(
      `Refusing to start with an invalid production environment:\n${errors.map((error) => ` - ${error}`).join('\n')}`,
    );
  }
  console.info('[richie-tms] Production environment validated.');
}
