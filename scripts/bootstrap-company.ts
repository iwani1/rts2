import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { z } from 'zod';
import { bootstrapOperatorCompany } from '../src/modules/auth/company-bootstrap';
import { getPrisma } from '../src/server/prisma';

async function main() {
  if (!process.argv.includes('--confirm')) {
    throw new Error('Usage: npm run bootstrap:company -- --confirm');
  }
  if (!stdin.isTTY) throw new Error('Company bootstrap requires an interactive terminal.');
  const prisma = getPrisma();
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const actorEmail = z.string().trim().email().parse(await terminal.question('Active Super Administrator email: '));
    terminal.close();
    const company = await bootstrapOperatorCompany({ actorEmail });
    console.log(`Created ${company.name} (${company.id}). No settings or operational records were seeded.`);
  } finally {
    terminal.close();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Company bootstrap failed.');
  process.exitCode = 1;
});
