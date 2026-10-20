import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { assertDemoSeedEnvironment, DemoSeedSafetyError } from '../src/modules/fleet/demo-seed-safety';

async function main() {
  assertDemoSeedEnvironment({
    nodeEnv: process.env.NODE_ENV,
    appUrl: process.env.APP_URL,
    databaseUrl: process.env.DATABASE_URL,
    confirmed: process.argv.includes('--confirm-demo'),
  });

  const prisma = new PrismaClient();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const companies = await tx.company.findMany({ where: { status: 'ACTIVE' }, take: 2, select: { id: true, name: true } });
      if (companies.length !== 1) throw new Error('Demo seeding requires exactly one active operator company.');
      const company = companies[0];
      const registrationNumber = 'DEMO-GH-001';
      const existing = await tx.vehicle.findUnique({
        where: { companyId_registrationNumber: { companyId: company.id, registrationNumber } },
        select: { id: true, category: true, notes: true },
      });
      if (existing) {
        if (existing.category === 'DEMO — TEST ONLY' && existing.notes?.startsWith('DEMO ONLY — fictional vehicle')) {
          return { created: false, companyName: company.name, vehicleId: existing.id };
        }
        throw new Error('Refusing to overwrite an existing vehicle with the demo registration.');
      }

      const vehicle = await tx.vehicle.create({
        data: {
          companyId: company.id,
          registrationNumber,
          make: 'Demo Make',
          model: 'Synthetic Bus',
          category: 'DEMO — TEST ONLY',
          seatCount: 30,
          fuelType: 'Demo value',
          ownershipType: 'Demo record',
          notes: 'DEMO ONLY — fictional vehicle for local UI testing; never dispatch or use operationally.',
        },
      });
      await tx.auditEvent.create({
        data: {
          companyId: company.id,
          action: 'DEMO_VEHICLE_SEEDED',
          entityType: 'VEHICLE',
          entityId: vehicle.id,
          summary: { demoOnly: true, registrationNumber, note: 'Local development fixture; not a real vehicle.' },
        },
      });
      return { created: true, companyName: company.name, vehicleId: vehicle.id };
    });

    if (result.created) {
      console.log(`Created clearly labelled demo vehicle ${result.vehicleId} for ${result.companyName}. Do not use it operationally.`);
    } else {
      console.log(`Demo vehicle already exists for ${result.companyName}; no changes made.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof DemoSeedSafetyError) {
    console.error(error.message);
  } else {
    console.error(error instanceof Error ? error.message : 'Demo seeding failed.');
  }
  process.exitCode = 1;
});
