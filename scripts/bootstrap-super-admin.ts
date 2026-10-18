import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { z } from 'zod';
import { hashPassword } from 'better-auth/crypto';
import { getPrisma } from '../src/server/prisma';

function readHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Bootstrap requires an interactive terminal so the password is not echoed.');
  }
  return new Promise((resolve, reject) => {
    let answer = '';
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') {
          cleanup();
          reject(new Error('Bootstrap cancelled.'));
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

async function main() {
  if (!process.argv.includes('--confirm')) {
    throw new Error('Usage: npm run bootstrap:super-admin -- --confirm');
  }
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Bootstrap requires an interactive terminal so the password is not echoed.');
  }
  const prisma = getPrisma();
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const name = await terminal.question('Administrator full name: ');
    const email = await terminal.question('Administrator email: ');
    // Close readline before raw-mode input so its terminal echo cannot expose passwords.
    terminal.close();
    const password = await readHidden('Password (minimum 12 characters; input hidden): ');
    const confirmation = await readHidden('Confirm password: ');
    if (password !== confirmation) throw new Error('Passwords do not match.');
    const details = z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
      password: z.string().min(12).max(128),
    }).parse({ name, email, password });
    const passwordHash = await hashPassword(details.password);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('richie_tms_super_admin_bootstrap'))`;
      const existingAdmin = await tx.userRoleAssignment.count({
        where: { roleCode: 'SUPER_ADMIN', companyId: null, revokedAt: null },
      });
      if (existingAdmin > 0) throw new Error('A Super Administrator already exists; bootstrap is one-time only.');
      const user = await tx.user.create({
        data: { name: details.name, email: details.email, status: 'ACTIVE' },
      });
      await tx.account.create({
        data: {
          accountId: user.id,
          providerId: 'credential',
          userId: user.id,
          password: passwordHash,
        },
      });
      const assignment = await tx.userRoleAssignment.create({
        data: {
          userId: user.id,
          roleCode: 'SUPER_ADMIN',
          assignedById: user.id,
          reason: 'One-time first-admin bootstrap through local interactive CLI',
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: 'SUPER_ADMIN_BOOTSTRAPPED',
          entityType: 'USER_ROLE_ASSIGNMENT',
          entityId: assignment.id,
          summary: { roleCode: 'SUPER_ADMIN', provisioning: 'interactive_cli' },
        },
      });
    });
    console.log(`Bootstrap complete for ${details.email}. Remove operational access to this command and protect the database credentials.`);
  } finally {
    terminal.close();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Bootstrap failed.');
  process.exitCode = 1;
});
