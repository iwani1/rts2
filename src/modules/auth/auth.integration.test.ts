import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from 'better-auth/crypto';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';

const appUrl = process.env.APP_URL;
const prisma = getPrisma();
const password = 'Integration-test-passphrase-2026!';
let email = '';
let userId = '';

function authRequest(path: string, init: RequestInit = {}) {
  if (!appUrl) throw new Error('APP_URL is required for auth integration tests');
  return getAuth().handler(new Request(`${appUrl}/api/auth${path}`, {
    ...init,
    headers: {
      origin: appUrl,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  }));
}

describe('Better Auth with PostgreSQL persistence', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL || !appUrl) {
      throw new Error('Set DATABASE_URL and APP_URL and apply migrations before auth integration tests');
    }
    email = `auth-test-${randomUUID()}@example.invalid`;
    const user = await prisma.user.create({
      data: { name: 'Integration Test User', email, emailVerified: true, status: 'ACTIVE' },
    });
    userId = user.id;
    await prisma.account.create({
      data: {
        accountId: user.id,
        providerId: 'credential',
        userId: user.id,
        password: await hashPassword(password),
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('signs in, persists an expiring session, serves it, signs out, and audits both events', async () => {
    const signIn = await authRequest('/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(signIn.status).toBe(200);

    const setCookies = signIn.headers.getSetCookie();
    const sessionCookie = setCookies
      .map((cookie) => cookie.split(';', 1)[0])
      .find((cookie) => cookie.includes('session_token='));
    expect(sessionCookie).toBeTruthy();
    const cookieHeader = sessionCookie as string;

    const sessionResponse = await authRequest('/get-session', {
      headers: { cookie: cookieHeader },
    });
    expect(sessionResponse.status).toBe(200);
    const sessionBody = await sessionResponse.json() as { user?: { id?: string }; session?: { expiresAt?: string } };
    expect(sessionBody.user?.id).toBe(userId);
    expect(Date.parse(sessionBody.session?.expiresAt ?? '')).toBeGreaterThan(Date.now());

    const persisted = await prisma.session.findFirst({ where: { userId } });
    expect(persisted).not.toBeNull();
    expect(persisted?.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const signOut = await authRequest('/sign-out', {
      method: 'POST',
      headers: { cookie: cookieHeader },
      body: JSON.stringify({}),
    });
    expect(signOut.status).toBe(200);
    expect(await prisma.session.findMany({ where: { userId } })).toHaveLength(0);

    const authAudit = await prisma.auditEvent.findMany({
      where: { actorId: userId, entityType: 'SESSION' },
      orderBy: { createdAt: 'asc' },
    });
    expect(authAudit.map((event) => event.action)).toEqual([
      'AUTH_SESSION_CREATED',
      'AUTH_SESSION_DELETED',
    ]);
    await expect(prisma.auditEvent.update({
      where: { id: authAudit[0]!.id },
      data: { action: 'TAMPERED' },
    })).rejects.toThrow('append-only');
  });

  it('denies session creation for a suspended account', async () => {
    const suspendedEmail = `suspended-${randomUUID()}@example.invalid`;
    const suspended = await prisma.user.create({
      data: { name: 'Suspended Account', email: suspendedEmail, emailVerified: true, status: 'SUSPENDED' },
    });
    await prisma.account.create({
      data: {
        accountId: suspended.id,
        providerId: 'credential',
        userId: suspended.id,
        password: await hashPassword(password),
      },
    });
    const response = await authRequest('/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: suspendedEmail, password }),
    });
    expect(await prisma.session.findMany({ where: { userId: suspended.id } })).toHaveLength(0);
    expect(response.headers.getSetCookie().some((cookie) => cookie.includes('session_token='))).toBe(false);
  });

  it('rate limits repeated email sign-in attempts through the database backend', async () => {
    const forwardedIp = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
    const responses: Response[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      responses.push(await authRequest('/sign-in/email', {
        method: 'POST',
        headers: { 'x-forwarded-for': forwardedIp },
        body: JSON.stringify({ email, password: 'Incorrect-test-password-000!' }),
      }));
    }
    expect(responses.slice(0, 5).every((response) => response.status >= 400)).toBe(true);
    expect(responses[5]?.status).toBe(429);
  });

  it('does not allow public email/password registration', async () => {
    const response = await authRequest('/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Should Not Exist',
        email: `blocked-${randomUUID()}@example.invalid`,
        password,
      }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
