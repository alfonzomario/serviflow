import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { hasRole } from '../../lib/permissions';
import bcrypt from 'bcryptjs';
import { encrypt } from '@/server/lib/encryption';

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'negocio';

const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!hasRole(ctx.session, 'SUPER_ADMIN')) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Requiere permisos de SUPER_ADMIN',
    });
  }
  return next({ ctx });
});

export const superadminRouter = router({
  getStats: superAdminProcedure.query(async ({ ctx }) => {
    const totalTenants = await ctx.db.tenant.count();
    const activeTenants = await ctx.db.tenant.count({ where: { status: 'ACTIVE' } });
    const suspendedTenants = await ctx.db.tenant.count({ where: { status: 'SUSPENDED' } });
    const totalUsers = await ctx.db.user.count();
    const totalVisits = await ctx.db.visit.count();
    const totalClients = await ctx.db.client.count();

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const visitsThisMonth = await ctx.db.visit.count({
      where: {
        scheduledAt: { gte: firstDayOfMonth }
      }
    });

    const activeSubscriptions = await ctx.db.subscription.findMany({
      where: { tenant: { status: 'ACTIVE' }, status: 'ACTIVE' },
      include: { plan: true },
    });
    const monthlyRevenueUsd = activeSubscriptions.reduce((sum, sub) => sum + Number(sub.plan?.monthlyPriceUsd || 0), 0);

    return {
      totalTenants,
      activeTenants,
      suspendedTenants,
      totalUsers,
      totalVisits,
      visitsThisMonth,
      totalClients,
      monthlyRevenueUsd,
    };
  }),

  listTenants: superAdminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.enum(['ACTIVE', 'SUSPENDED', 'CANCELLED']).optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: any = {};
      if (input.search) {
        where.OR = [
          { name: { contains: input.search, mode: 'insensitive' } },
          { slug: { contains: input.search, mode: 'insensitive' } },
        ];
      }
      if (input.status) {
        where.status = input.status;
      }

      const [items, totalCount] = await Promise.all([
        ctx.db.tenant.findMany({
          where,
          include: {
            _count: {
              select: { users: true, clients: true, visits: true },
            },
            subscription: {
              include: { plan: true }
            },
            settings: {
              select: { onboardedAt: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        ctx.db.tenant.count({ where })
      ]);

      return {
        items,
        totalCount,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(totalCount / input.pageSize),
      };
    }),

  getTenantDetail: superAdminProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tenant = await ctx.db.tenant.findUnique({
        where: { id: input.tenantId },
        include: {
          settings: true,
          subscription: { include: { plan: true } },
          users: {
            select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true }
          },
          _count: {
            select: { clients: true, visits: true, jobs: true }
          }
        }
      });

      if (!tenant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant not found' });

      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const visitsThisMonth = await ctx.db.visit.count({
        where: {
          tenantId: input.tenantId,
          scheduledAt: { gte: firstDayOfMonth }
        }
      });

      const maxUsers = tenant.subscription?.overrideMaxUsers ?? tenant.subscription?.plan?.maxUsers ?? 0;
      const maxClients = tenant.subscription?.overrideMaxClients ?? tenant.subscription?.plan?.maxClients ?? 0;
      const maxVisitsMonth = tenant.subscription?.overrideMaxVisitsMonth ?? tenant.subscription?.plan?.maxVisitsMonth ?? 0;

      const usersUsage = maxUsers > 0 ? (tenant.users.length / maxUsers) * 100 : 0;
      const clientsUsage = maxClients > 0 ? (tenant._count.clients / maxClients) * 100 : 0;
      const visitsUsage = maxVisitsMonth > 0 ? (visitsThisMonth / maxVisitsMonth) * 100 : 0;

      return {
        ...tenant,
        usage: {
          usersUsage,
          clientsUsage,
          visitsUsage,
          visitsThisMonth
        }
      };
    }),

  createTenant: superAdminProcedure
    .input(z.object({
      name: z.string().min(2),
      slug: z.string().optional(),
      industry: z.string().optional(),
      ownerEmail: z.string().email(),
      ownerName: z.string().min(2),
      ownerPassword: z.string().min(8),
      planName: z.string(),
      billingCycle: z.enum(['MONTHLY', 'YEARLY']).optional().default('MONTHLY'),
      periodMonths: z.number().optional().default(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const email = input.ownerEmail.toLowerCase().trim();
      const existingUser = await ctx.db.user.findFirst({ where: { email } });
      if (existingUser) {
        throw new TRPCError({ code: 'CONFLICT', message: 'User email already exists' });
      }

      let slug = input.slug || slugify(input.name);
      for (let i = 2; await ctx.db.tenant.findUnique({ where: { slug } }); i++) {
        slug = `${slugify(input.name)}-${i}`;
      }

      const plan = await ctx.db.plan.findUnique({ where: { name: input.planName } });
      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      }

      const passwordHash = await bcrypt.hash(input.ownerPassword, 10);
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + input.periodMonths);

      const tenant = await ctx.db.$transaction(async (tx) => {
        const t = await tx.tenant.create({
          data: {
            name: input.name,
            slug,
            industry: input.industry,
            users: {
              create: {
                email,
                name: input.ownerName,
                passwordHash,
                role: 'OWNER',
              }
            },
            settings: {
              create: { adminEmail: email }
            },
            subscription: {
              create: {
                planId: plan.id,
                billingCycle: input.billingCycle,
                status: 'ACTIVE',
                currentPeriodStart: new Date(),
                currentPeriodEnd: periodEnd,
              }
            }
          }
        });

        await tx.auditLog.create({
          data: {
            scope: 'PLATFORM',
            entityType: 'TENANT',
            entityId: t.id,
            action: 'CREATE',
            userId: ctx.session.user.id,
            changes: { name: input.name, slug, ownerEmail: email, plan: input.planName }
          }
        });

        return t;
      });

      return { success: true, tenantId: tenant.id };
    }),

  updateStatus: superAdminProcedure
    .input(z.object({
      tenantId: z.string().uuid(),
      status: z.enum(['ACTIVE', 'SUSPENDED', 'CANCELLED']),
    }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db.$transaction(async (tx) => {
        const t = await tx.tenant.update({
          where: { id: input.tenantId },
          data: { status: input.status },
        });

        await tx.auditLog.create({
          data: {
            scope: 'PLATFORM',
            entityType: 'TENANT',
            entityId: t.id,
            action: 'UPDATE',
            userId: ctx.session.user.id,
            changes: { status: input.status }
          }
        });

        return t;
      });

      return updated;
    }),

  assignPlan: superAdminProcedure
    .input(z.object({
      tenantId: z.string().uuid(),
      planName: z.string(),
      billingCycle: z.enum(['MONTHLY', 'YEARLY']).optional().default('MONTHLY'),
      overrideMaxUsers: z.number().optional(),
      overrideMaxClients: z.number().optional(),
      overrideMaxVisitsMonth: z.number().optional(),
      periodMonths: z.number().optional().default(1),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.db.plan.findUnique({ where: { name: input.planName } });
      if (!plan) throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });

      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + input.periodMonths);

      const subscription = await ctx.db.$transaction(async (tx) => {
        const existingSub = await tx.subscription.findUnique({ where: { tenantId: input.tenantId } });

        const sub = await tx.subscription.upsert({
          where: { tenantId: input.tenantId },
          create: {
            tenantId: input.tenantId,
            planId: plan.id,
            billingCycle: input.billingCycle,
            status: 'ACTIVE',
            currentPeriodStart: new Date(),
            currentPeriodEnd: periodEnd,
            overrideMaxUsers: input.overrideMaxUsers,
            overrideMaxClients: input.overrideMaxClients,
            overrideMaxVisitsMonth: input.overrideMaxVisitsMonth,
          },
          update: {
            planId: plan.id,
            billingCycle: input.billingCycle,
            status: 'ACTIVE',
            currentPeriodStart: new Date(),
            currentPeriodEnd: periodEnd,
            overrideMaxUsers: input.overrideMaxUsers,
            overrideMaxClients: input.overrideMaxClients,
            overrideMaxVisitsMonth: input.overrideMaxVisitsMonth,
          }
        });

        await tx.auditLog.create({
          data: {
            scope: 'PLATFORM',
            entityType: 'SUBSCRIPTION',
            entityId: sub.id,
            tenantId: input.tenantId,
            action: existingSub ? 'UPDATE' : 'CREATE',
            userId: ctx.session.user.id,
            changes: { plan: input.planName, billingCycle: input.billingCycle, notes: input.notes }
          }
        });

        return sub;
      });

      return subscription;
    }),

  getPlatformConfig: superAdminProcedure.query(async ({ ctx }) => {
    return ctx.db.platformConfig.findFirst();
  }),

  updatePlatformConfig: superAdminProcedure
    .input(z.object({
      registrationMode: z.string().optional(),
      salesWhatsappNumber: z.string().optional(),
      salesFormUrl: z.string().optional(),
      arsExchangeRate: z.number().optional(),
      globalAiProvider: z.string().optional(),
      globalAiKeyEncrypted: z.string().optional(),
      allowTenantBYOK: z.boolean().optional(),
      defaultAiMonthlyTokens: z.number().optional(),
      smtpHost: z.string().optional(),
      smtpPort: z.number().optional(),
      smtpUser: z.string().optional(),
      smtpPassEncrypted: z.string().optional(),
      smtpFromEmail: z.string().optional(),
      waApiUrl: z.string().optional(),
      waApiKeyEncrypted: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const data: any = { ...input };

      if (data.globalAiKeyEncrypted) data.globalAiKeyEncrypted = encrypt(data.globalAiKeyEncrypted);
      if (data.smtpPassEncrypted) data.smtpPassEncrypted = encrypt(data.smtpPassEncrypted);
      if (data.waApiKeyEncrypted) data.waApiKeyEncrypted = encrypt(data.waApiKeyEncrypted);

      const existing = await ctx.db.platformConfig.findFirst();

      if (existing) {
        return ctx.db.platformConfig.update({
          where: { id: existing.id },
          data
        });
      } else {
        return ctx.db.platformConfig.create({
          data
        });
      }
    }),

  getAuditLogs: superAdminProcedure
    .input(z.object({
      scope: z.string().optional(),
      tenantId: z.string().uuid().optional(),
      action: z.string().optional(),
      entityType: z.string().optional(),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const where: any = {};
      if (input.scope) where.scope = input.scope;
      if (input.tenantId) where.tenantId = input.tenantId;
      if (input.action) where.action = input.action;
      if (input.entityType) where.entityType = input.entityType;

      const [items, totalCount] = await Promise.all([
        ctx.db.auditLog.findMany({
          where,
          include: {
            user: { select: { name: true, email: true } },
            tenant: { select: { name: true, slug: true } }
          },
          orderBy: { createdAt: 'desc' },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        ctx.db.auditLog.count({ where })
      ]);

      return {
        items,
        totalCount,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(totalCount / input.pageSize),
      };
    }),

  listPlans: superAdminProcedure.query(async ({ ctx }) => {
    return ctx.db.plan.findMany({
      orderBy: { sortOrder: 'asc' }
    });
  }),

  upsertPlan: superAdminProcedure
    .input(z.object({
      name: z.string(),
      displayName: z.string(),
      monthlyPriceUsd: z.number(),
      annualPriceUsd: z.number().optional().default(0),
      maxUsers: z.number().optional(),
      maxClients: z.number().optional(),
      maxVisitsMonth: z.number().optional(),
      isActive: z.boolean().default(true),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.plan.upsert({
        where: { name: input.name },
        create: input,
        update: input,
      });
    }),
});
