import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { mayStartSession } from '@/modules/auth/policy';
import { getPrisma } from '@/server/prisma';

function createAuth() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must be configured with at least 32 characters');
  }
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error('APP_URL must be configured');
  const prisma = getPrisma();

  return betterAuth({
    appName: 'Richie Transport Services TMS',
    baseURL: appUrl,
    secret,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    trustedOrigins: [appUrl],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false,
    },
    session: {
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 10,
      storage: 'database',
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': false,
        '/request-password-reset': { window: 60, max: 3 },
        '/reset-password': { window: 60, max: 5 },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { status: true } });
            if (!mayStartSession(user?.status)) return false;
          },
          after: async (session) => {
            await prisma.auditEvent.create({
              data: {
                actorId: session.userId,
                action: 'AUTH_SESSION_CREATED',
                entityType: 'SESSION',
                entityId: session.id,
                summary: { action: 'sign_in' },
              },
            });
          },
        },
        delete: {
          after: async (session) => {
            await prisma.auditEvent.create({
              data: {
                actorId: session.userId,
                action: 'AUTH_SESSION_DELETED',
                entityType: 'SESSION',
                entityId: session.id,
                summary: { operation: 'session_delete' }
              },
            });
          },
        },
      },
    },
    advanced: { useSecureCookies: process.env.NODE_ENV === 'production' },
  });
}

let authInstance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  authInstance ??= createAuth();
  return authInstance;
}
