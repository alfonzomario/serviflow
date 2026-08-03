import { PrismaClient, UserRole, TenantStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** Tiers from the monetisation table in docs/implementation_plan.md. */
const PLANS = [
  {
    name: 'free',
    displayName: 'Free',
    maxUsers: 2,
    maxClients: 50,
    maxVisitsMonth: 100,
    aiEnabled: false,
    calendarSync: false,
    clientPortal: false,
    customBranding: false,
    apiAccess: false,
    historyYears: 1,
    monthlyPriceArs: 0,
    annualPriceArs: 0,
    sortOrder: 1,
  },
  {
    name: 'pro',
    displayName: 'Pro',
    maxUsers: 10,
    maxClients: 500,
    maxVisitsMonth: 1000,
    aiEnabled: true,
    calendarSync: true,
    clientPortal: true,
    customBranding: false,
    apiAccess: false,
    historyYears: 3,
    monthlyPriceArs: 15000,
    annualPriceArs: 150000,
    sortOrder: 2,
  },
  {
    name: 'business',
    displayName: 'Business',
    // -1 stands for "unlimited" so the columns stay non-nullable ints.
    maxUsers: -1,
    maxClients: -1,
    maxVisitsMonth: -1,
    aiEnabled: true,
    calendarSync: true,
    clientPortal: true,
    customBranding: true,
    apiAccess: true,
    historyYears: -1,
    monthlyPriceArs: 35000,
    annualPriceArs: 350000,
    sortOrder: 3,
  },
];

async function main() {
  console.log('🌱 Seeding database...');

  // 0. Subscription plans
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: plan,
      create: plan,
    });
  }

  // 1. Create the platform tenant (for super admin)
  const platformTenant = await prisma.tenant.upsert({
    where: { id: '00000000-0000-0000-0000-000000000000' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'ServiFlow Platform',
      slug: 'serviflow',
      industry: 'platform',
      status: TenantStatus.ACTIVE,
    },
  });

  // 2. Create Super Admin user (no tenant)
  const superAdminPassword = await bcrypt.hash('admin123', 12);
  const superAdmin = await prisma.user.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@serviflow.app',
      name: 'Super Admin',
      passwordHash: superAdminPassword,
      role: UserRole.SUPER_ADMIN,
      tenantId: '00000000-0000-0000-0000-000000000000', // Platform tenant
    },
  });

  // 3. Create a demo tenant (Lozanor Fumigaciones)
  const demoTenant = await prisma.tenant.upsert({
    where: { slug: 'lozanor-demo' },
    update: {},
    create: {
      name: 'Lozanor Fumigaciones',
      slug: 'lozanor-demo',
      industry: 'fumigacion',
      timezone: 'America/Argentina/Buenos_Aires',
      country: 'AR',
      currency: 'ARS',
      status: TenantStatus.ACTIVE,
    },
  });

  // 4. Create demo tenant settings
  await prisma.tenantSettings.upsert({
    where: { tenantId: demoTenant.id },
    update: {},
    create: {
      tenantId: demoTenant.id,
      baseAddress: 'Laprida 365, San Isidro',
      baseLat: -34.4716,
      baseLng: -58.5298,
      aiProvider: 'groq',
      calendarEventTitlePrefix: 'Lozanor',
      calendarEventDuration: 45,
      workingHoursStart: '07:00',
      workingHoursEnd: '15:00',
      adminEmail: 'demo@serviflow.app',
      // Fumigation preset: monthly abono, 15 days between applications.
      recurrenceUnit: 'MONTH',
      recurrenceInterval: 1,
      minDaysBetweenApplications: 15,
      labelRecurringAgreement: 'Abono',
      labelMultiVisitJob: 'Tratamiento',
      defaultDurationMinutes: 45,
      onboardedAt: new Date(),
    },
  });

  // 5. Create demo OWNER user
  const ownerPassword = await bcrypt.hash('demo1234', 12);
  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: demoTenant.id,
        email: 'owner@lozanor.com',
      },
    },
    update: {},
    create: {
      tenantId: demoTenant.id,
      email: 'owner@lozanor.com',
      name: 'Javier (Owner)',
      passwordHash: ownerPassword,
      role: UserRole.OWNER,
    },
  });

  // 6. Create demo OPERATOR user
  const operatorPassword = await bcrypt.hash('oper1234', 12);
  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: demoTenant.id,
        email: 'operador@lozanor.com',
      },
    },
    update: {},
    create: {
      tenantId: demoTenant.id,
      email: 'operador@lozanor.com',
      name: 'Carlos (Fumigador)',
      passwordHash: operatorPassword,
      role: UserRole.OPERATOR,
    },
  });

  // 7. Create demo subscription
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const proPlan = await prisma.plan.findUnique({ where: { name: 'pro' } });

  await prisma.subscription.upsert({
    where: { tenantId: demoTenant.id },
    update: { planId: proPlan?.id },
    create: {
      tenantId: demoTenant.id,
      planId: proPlan?.id,
      status: 'active',
      planName: 'pro',
      monthlyPrice: 15000,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });

  // 8. Create demo clients
  const demoClients = [
    {
      tenantId: demoTenant.id,
      name: 'María García',
      email: 'maria@example.com',
      phone: '(11) 5555-0001',
      address: 'Av. Libertador 1500, San Isidro',
      lat: -34.4710,
      lng: -58.5120,
      relationshipType: 'CONTRACT' as const,
      status: 'ACTIVE' as const,
      serviceTypes: ['Fumigación Control', 'Desratización'],
      preferredDays: ['Lunes', 'Miércoles'],
      preferredSlots: ['Mañana'],
    },
    {
      tenantId: demoTenant.id,
      name: 'Roberto López',
      email: 'roberto@example.com',
      phone: '(11) 5555-0002',
      address: 'Calle 25 de Mayo 800, Martínez',
      lat: -34.4920,
      lng: -58.5050,
      relationshipType: 'CONTRACT' as const,
      status: 'ACTIVE' as const,
      serviceTypes: ['Fumigación Control'],
      preferredDays: ['Martes', 'Jueves'],
      preferredSlots: ['Mañana'],
    },
    {
      tenantId: demoTenant.id,
      name: 'Ana Fernández',
      email: 'ana@example.com',
      phone: '(11) 5555-0003',
      address: 'Ruta 202 Km 5, Boulogne',
      lat: -34.5050,
      lng: -58.5600,
      relationshipType: 'ON_DEMAND' as const,
      status: 'ACTIVE' as const,
      serviceTypes: ['Fumigación Especial', 'Cucarachas'],
      preferredDays: [],
      preferredSlots: ['Tarde'],
    },
  ];

  // Seeding is re-runnable: clients have no natural unique key, so match on
  // (tenantId, name) before inserting.
  const clients = [];
  for (const clientData of demoClients) {
    const existing = await prisma.client.findFirst({
      where: { tenantId: demoTenant.id, name: clientData.name },
    });
    clients.push(existing ?? (await prisma.client.create({ data: clientData })));
  }

  // 9. Demo visits. Deliberately shaped so Pendientes has something to show:
  //    - María: contract covered this month
  //    - Roberto: contract last covered 3 months ago -> carried over, overdue
  //    - Ana: a 3-application treatment with only the first one scheduled
  const visitCount = await prisma.visit.count({ where: { tenantId: demoTenant.id } });
  if (visitCount === 0) {
    const at = (dayOffset: number, hour: number) => {
      const date = new Date();
      date.setDate(date.getDate() + dayOffset);
      date.setHours(hour, 0, 0, 0);
      return date;
    };

    const monthsAgo = (months: number, day: number, hour: number) => {
      const now = new Date();
      const date = new Date(now.getFullYear(), now.getMonth() - months, day);
      date.setHours(hour, 0, 0, 0);
      return date;
    };

    // Ana's treatment is a Job row; its applications point at it. Application 1
    // is done, 2 and 3 are what Pendientes asks for.
    const anaTreatment = await prisma.job.create({
      data: {
        tenantId: demoTenant.id,
        clientId: clients[2].id,
        serviceType: 'Cucarachas',
        visitType: 'SPECIAL',
        totalApplications: 3,
      },
    });

    await prisma.visit.createMany({
      data: [
        {
          tenantId: demoTenant.id,
          clientId: clients[0].id,
          scheduledAt: at(-7, 9),
          visitType: 'CONTRACT',
          serviceType: 'Fumigación Control',
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          price: 25000,
          completedAt: at(-7, 10),
        },
        {
          tenantId: demoTenant.id,
          clientId: clients[0].id,
          scheduledAt: at(2, 11),
          visitType: 'CONTRACT',
          serviceType: 'Desratización',
          status: 'CONFIRMED',
          price: 28000,
        },
        // Roberto: last contract visit three months back, nothing since.
        {
          tenantId: demoTenant.id,
          clientId: clients[1].id,
          scheduledAt: monthsAgo(3, 12, 9),
          visitType: 'CONTRACT',
          serviceType: 'Fumigación Control',
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          price: 25000,
          completedAt: monthsAgo(3, 12, 10),
        },
        // Ana: application 1 of 3 done, 2 and 3 still to be scheduled.
        {
          tenantId: demoTenant.id,
          clientId: clients[2].id,
          jobId: anaTreatment.id,
          scheduledAt: at(-10, 14),
          visitType: 'SPECIAL',
          serviceType: 'Cucarachas',
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          price: 32000,
          applicationNumber: 1,
          completedAt: at(-10, 15),
        },
        // A special job filed without a slot yet.
        {
          tenantId: demoTenant.id,
          clientId: clients[2].id,
          scheduledAt: null,
          visitType: 'SPECIAL',
          serviceType: 'Fumigación Especial',
          status: 'PENDING_CONFIRM',
          price: 0,
        },
      ],
    });
  }

  // 10. Income for the completed visit. In the app this row is created by
  // onVisitStatusChange when a visit is marked COMPLETED; the seed inserts
  // visits directly, so it has to mirror that here.
  const completedVisit = await prisma.visit.findFirst({
    where: { tenantId: demoTenant.id, status: 'COMPLETED' },
  });

  if (completedVisit) {
    const alreadyRecorded = await prisma.transaction.findFirst({
      where: { visitId: completedVisit.id },
    });

    if (!alreadyRecorded) {
      await prisma.transaction.create({
        data: {
          tenantId: demoTenant.id,
          visitId: completedVisit.id,
          clientId: completedVisit.clientId,
          type: 'INCOME',
          amount: completedVisit.price,
          category: 'Visita',
          transactionDate: completedVisit.scheduledAt ?? new Date(),
        },
      });
    }
  }

  console.log('✅ Database seeded successfully!');
  console.log('');
  console.log('Demo credentials:');
  console.log('  Super Admin:  admin@serviflow.app / admin123');
  console.log('  Owner:        owner@lozanor.com / demo1234');
  console.log('  Operator:     operador@lozanor.com / oper1234');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
