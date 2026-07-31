import { PrismaClient, UserRole, TenantStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

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
      baseAddress: 'Magallanes 1090, San Isidro, Buenos Aires',
      baseLat: -34.4716,
      baseLng: -58.5298,
      aiProvider: 'groq',
      calendarEventTitlePrefix: 'Lozanor',
      calendarEventDuration: 45,
      visitIntervalDays: 15,
      workingHoursStart: '07:00',
      workingHoursEnd: '15:00',
      adminEmail: 'demo@serviflow.app',
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

  await prisma.subscription.upsert({
    where: { tenantId: demoTenant.id },
    update: {},
    create: {
      tenantId: demoTenant.id,
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

  for (const clientData of demoClients) {
    await prisma.client.create({ data: clientData });
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
