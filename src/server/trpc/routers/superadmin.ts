import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { hasRole } from '../../lib/permissions';

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
    const totalUsers = await ctx.db.user.count();
    const totalVisits = await ctx.db.visit.count();

    return {
      totalTenants,
      activeTenants,
      totalUsers,
      totalVisits,
    };
  }),

  listTenants: superAdminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.enum(['ACTIVE', 'SUSPENDED', 'CANCELLED']).optional(),
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

      const tenants = await ctx.db.tenant.findMany({
        where,
        include: {
          _count: {
            select: { users: true, clients: true, visits: true },
          },
          subscription: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return tenants;
    }),

  updateStatus: superAdminProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        status: z.enum(['ACTIVE', 'SUSPENDED', 'CANCELLED']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db.tenant.update({
        where: { id: input.tenantId },
        data: { status: input.status },
      });

      return updated;
    }),
});
