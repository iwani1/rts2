/**
 * D-092/7C: production boot validation. Returns hard errors (boot must
 * refuse) and warnings (boot continues, loudly). Pure so it is unit
 * tested without starting a server; src/instrumentation.ts is the only
 * caller. AUTH_SECRET length is also enforced where auth initialises
 * (src/server/auth.ts); this check exists so a misconfigured deploy
 * fails at container start with one clear message, not first request.
 */
export function validateProductionEnv(env: Record<string, string | undefined>): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!env.DATABASE_URL) {
    errors.push('DATABASE_URL is not set; the application cannot reach PostgreSQL.');
  }

  if (!env.AUTH_SECRET) {
    errors.push('AUTH_SECRET is not set; sessions cannot be signed.');
  } else if (env.AUTH_SECRET.length < 32) {
    errors.push('AUTH_SECRET must be at least 32 characters.');
  }

  if (!env.APP_URL) {
    errors.push('APP_URL is not set; auth callbacks and links need the public origin.');
  } else {
    let appUrl: URL | null = null;
    try {
      appUrl = new URL(env.APP_URL);
    } catch {
      errors.push(`APP_URL is not a valid absolute URL: ${env.APP_URL}`);
    }
    if (appUrl && appUrl.protocol !== 'https:') {
      warnings.push(
        `APP_URL uses ${appUrl.protocol}// — production should be served over HTTPS; continuing because a TLS-terminating proxy may sit in front.`,
      );
    }
  }

  return { errors, warnings };
}
