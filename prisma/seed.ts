import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding plans and platform config...');

  // ── Plans (size-based, all features enabled) ──────────────
  const plans = [
    {
      name: 'solo',
      displayName: 'Solo',
      maxUsers: 1,
      maxClients: 30,
      maxVisitsMonth: 80,
      monthlyPriceUsd: 19,
      annualPriceUsd: 190,
      sortOrder: 1,
    },
    {
      name: 'equipo',
      displayName: 'Equipo',
      maxUsers: 10,
      maxClients: 300,
      maxVisitsMonth: 800,
      monthlyPriceUsd: 49,
      annualPriceUsd: 490,
      sortOrder: 2,
    },
    {
      name: 'empresa',
      displayName: 'Empresa',
      maxUsers: 50,
      maxClients: 99999,
      maxVisitsMonth: 99999,
      monthlyPriceUsd: 129,
      annualPriceUsd: 1290,
      sortOrder: 3,
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: plan,
      create: plan,
    });
    console.log(`  ✅ Plan "${plan.displayName}" upserted`);
  }

  // ── PlatformConfig (singleton) ────────────────────────────
  const existing = await prisma.platformConfig.findFirst();
  if (!existing) {
    await prisma.platformConfig.create({
      data: {
        registrationMode: 'closed',
        allowTenantBYOK: false,
        defaultAiMonthlyTokens: 100000,
        arsExchangeRate: 1200,
        salesWhatsappNumber: '+5491100000000',
      },
    });
    console.log('  ✅ PlatformConfig created (registrationMode: closed)');
  } else {
    console.log('  ℹ PlatformConfig already exists, skipping');
  }

  console.log('🌱 Seed complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
