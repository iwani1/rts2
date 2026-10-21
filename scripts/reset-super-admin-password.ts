import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { z } from 'zod';
import { hashPassword } from 'better-auth/crypto';
import { getPrisma } from '../src/server/prisma';

function readHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Password reset requires an interactive terminal so the password is not echoed.');
  }
  return new Promise((resolve, reject) => {
    let answer = '';
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') {
          cleanup();
          reject(new Error('Password reset cancelled.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(answer);
          return;
        }
        if (char === '\u007f' || char === '\b') {
          answer = answer.slice(0, -1);
        } else if (char >= ' ') {
          answer += char;
        }
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
    };
    stdin.setRawMode(true);
    stdout.write(prompt);
    stdin.resume();
    stdin.on('data', onData);
  });
}

/**
 * Local controlled-environment recovery: resets the password of an
 * existing global Super Administrator (for example after a bootstrap
 * password was mistyped into the hidden prompt). Interactive TTY only,
 * audited, and it revokes the account's existing sessions. Like the
 * bootstrap command, remove operational access to it and protect the
 * database credentials.
 */
async function main() {
  if (!process.argv.includes('--confirm')) {
    throw new Error('Usage: npm run reset:super-admin-password -- --confirm');
  }
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Password reset requires an interactive terminal so the password is not echoed.');
  }
  const prisma = getPrisma();
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const emailInput = await terminal.question('Super Administrator email: ');
    // Close readline before raw-mode input so its terminal echo cannot expose passwords.
    terminal.close();
    const password = await readHidden('New password (minimum 12 characters; input hidden): ');
    const confirmation = await readHidden('Confirm new password: ');
    if (password !== confirmation) throw new Error('Passwords do not match.');
    const details = z.object({
      email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
      password: z.string().min(12).max(128),
    }).parse({ email: emailInput, password });
    const passwordHash = await hashPassword(details.password);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('richie_tms_super_admin_bootstrap'))`;
      const user = await tx.user.findUnique({ where: { email: details.email }, select: { id: true, status: true } });
      if (!user || user.status !== 'ACTIVE') throw new Error('No active account exists for that email.');
      const assignment = await tx.userRoleAssignment.findFirst({
        where: { userId: user.id, roleCode: 'SUPER_ADMIN', companyId: null, revokedAt: null },
        select: { id: true },
      });
      if (!assignment) throw new Error('That account is not a global Super Administrator; refusing to reset it here.');
      const updated = await tx.account.updateMany({
        where: { userId: user.id, providerId: 'credential' },
        data: { password: passwordHash },
      });
      if (updated.count !== 1) throw new Error('No credential account exists for that user.');
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: 'SUPER_ADMIN_PASSWORD_RESET',
          entityType: 'USER',
          entityId: user.id,
          summary: { provisioning: 'interactive_cli', sessionsRevoked: true },
        },
      });
    });
    console.log(`Password reset complete for ${details.email}. Existing sessions were revoked. Remove operational access to this command and protect the database credentials.`);
  } finally {
    terminal.close();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Password reset failed.');
  process.exitCode = 1;
});
