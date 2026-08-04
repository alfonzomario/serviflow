/**
 * Limit enforcement middleware for tRPC.
 *
 * Checks whether a tenant has reached the capacity limit for a given resource
 * (users, clients, visits) according to their subscription plan.
 *
 * Usage:
 *   enforceLimits('clients').mutation(async ({ ctx }) => { ... })
 */
import { TRPCError } from '@trpc/server';
import { PrismaClient } from '@prisma/client';
import { tenantProcedure } from '../trpc';

type LimitResource = 'users' | 'clients' | 'visits';

async function countResource(
  db: PrismaClient,
  tenantId: string,
  resource: LimitResource
): Promise<number> {
  switch (resource) {
    case 'users':
      return db.user.count({ where: { tenantId, isActive: true } });
    case 'clients':
      return db.client.count({ where: { tenantId, deletedAt: null } });
    case 'visits': {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return db.visit.count({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: startOfMonth },
        },
      });
    }
  }
}

const RESOURCE_LABELS: Record<LimitResource, string> = {
  users: 'usuarios',
  clients: 'clientes',
  visits: 'visitas este mes',
};

/**
 * Returns a tRPC procedure that enforces the plan limit for the given resource.
 * The procedure adds `usage: { current, max, resource }` to the context.
 */
export function enforceLimits(resource: LimitResource) {
  return tenantProcedure.use(async ({ ctx, next }) => {
    const sub = await ctx.db.subscription.findUnique({
      where: { tenantId: ctx.tenantId },
      include: { plan: true },
    });

    // No subscription = no limits enforced (legacy tenants)
    if (!sub || !sub.plan) {
      return next({
        ctx: { ...ctx, usage: { current: 0, max: Infinity, resource } },
      });
    }

    const max = {
      users: sub.overrideMaxUsers ?? sub.plan.maxUsers,
      clients: sub.overrideMaxClients ?? sub.plan.maxClients,
      visits: sub.overrideMaxVisitsMonth ?? sub.plan.maxVisitsMonth,
    }[resource];

    const current = await countResource(ctx.db as unknown as PrismaClient, ctx.tenantId, resource);

    if (current >= max) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Alcanzaste el límite de tu plan: ${current}/${max} ${RESOURCE_LABELS[resource]}. Contactá a ventas para ampliar tu cuenta.`,
      });
    }

    return next({
      ctx: { ...ctx, usage: { current, max, resource } },
    });
  });
}

/**
 * Query-only version: doesn't block, just provides usage info in context.
 * Useful for showing progress bars / banners in the UI.
 */
export function withUsageInfo(resource: LimitResource) {
  return tenantProcedure.use(async ({ ctx, next }) => {
    const sub = await ctx.db.subscription.findUnique({
      where: { tenantId: ctx.tenantId },
      include: { plan: true },
    });

    if (!sub || !sub.plan) {
      return next({
        ctx: { ...ctx, usage: { current: 0, max: Infinity, resource, percentage: 0 } },
      });
    }

    const max = {
      users: sub.overrideMaxUsers ?? sub.plan.maxUsers,
      clients: sub.overrideMaxClients ?? sub.plan.maxClients,
      visits: sub.overrideMaxVisitsMonth ?? sub.plan.maxVisitsMonth,
    }[resource];

    const current = await countResource(ctx.db as unknown as PrismaClient, ctx.tenantId, resource);
    const percentage = max > 0 ? Math.round((current / max) * 100) : 0;

    return next({
      ctx: { ...ctx, usage: { current, max, resource, percentage } },
    });
  });
}
