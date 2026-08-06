import { z } from 'zod';
import { router, tenantProcedure, ownerProcedure } from '../trpc';

export const subscriptionRouter = router({
  getPlans: tenantProcedure.query(async ({ ctx }) => {
    const plans = await ctx.db.plan.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    if (plans.length === 0) {
      return [
        {
          id: 'free',
          name: 'free',
          displayName: 'Free / Prueba',
          maxUsers: 2,
          maxClients: 50,
          maxVisitsMonth: 100,
          monthlyPriceUsd: 0,
          annualPriceUsd: 0,
          isActive: true,
          sortOrder: 1,
        },
        {
          id: 'pro',
          name: 'pro',
          displayName: 'Pro Profesional',
          maxUsers: 10,
          maxClients: 500,
          maxVisitsMonth: 1000,
          monthlyPriceUsd: 25,
          annualPriceUsd: 250,
          isActive: true,
          sortOrder: 2,
        },
        {
          id: 'business',
          name: 'business',
          displayName: 'Business Empresa',
          maxUsers: 50,
          maxClients: 5000,
          maxVisitsMonth: 10000,
          monthlyPriceUsd: 60,
          annualPriceUsd: 600,
          isActive: true,
          sortOrder: 3,
        },
      ];
    }

    return plans;
  }),

  getCurrent: tenantProcedure.query(async ({ ctx }) => {
    const [sub, clientsCount, visitsCount, usersCount] = await Promise.all([
      ctx.db.subscription.findUnique({
        where: { tenantId: ctx.tenantId },
        include: { plan: true },
      }),
      ctx.db.client.count({ where: { tenantId: ctx.tenantId, deletedAt: null } }),
      ctx.db.visit.count({
        where: {
          tenantId: ctx.tenantId,
          deletedAt: null,
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
      ctx.db.user.count({ where: { tenantId: ctx.tenantId } }),
    ]);

    const planName = sub?.planName || 'free';

    return {
      subscription: sub,
      planName,
      usage: {
        clientsCount,
        maxClients: sub?.plan?.maxClients ?? 50,
        visitsThisMonth: visitsCount,
        maxVisitsMonth: sub?.plan?.maxVisitsMonth ?? 100,
        usersCount,
        maxUsers: sub?.plan?.maxUsers ?? 2,
      },
    };
  }),

  changePlan: ownerProcedure
    .input(
      z.object({
        planName: z.enum(['free', 'pro', 'business']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.db.plan.findUnique({
        where: { name: input.planName },
      });

      const now = new Date();
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const sub = await ctx.db.subscription.upsert({
        where: { tenantId: ctx.tenantId },
        create: {
          tenantId: ctx.tenantId,
          planId: plan?.id,
          planName: input.planName,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: nextMonth,
        },
        update: {
          planId: plan?.id,
          planName: input.planName,
          status: 'active',
          updatedAt: now,
        },
      });

      return sub;
    }),
});
