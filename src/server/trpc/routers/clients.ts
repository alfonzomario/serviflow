import { router, tenantProcedure } from '../trpc';
import { z } from 'zod';
import { tenantWhere } from '../../lib/tenant-context';
import { TRPCError } from '@trpc/server';
import { checkPermission } from '../../lib/permissions';

export const clientsRouter = router({
  list: tenantProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(50),
      search: z.string().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
      type: z.enum(['CONTRACT', 'ON_DEMAND']).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { page, limit, search, status, type } = input;
      const skip = (page - 1) * limit;
      
      const whereClause = {
        ...tenantWhere(ctx.tenantId),
        ...(status && { status }),
        ...(type && { type }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } }
          ]
        })
      };

      const [items, total] = await Promise.all([
        ctx.db.client.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy: { name: 'asc' }
        }),
        ctx.db.client.count({ where: whereClause })
      ]);

      return {
        items,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    }),
    
  getById: tenantProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const client = await ctx.db.client.findFirst({
        where: { id: input.id, ...tenantWhere(ctx.tenantId) },
        include: { _count: { select: { visits: true } } }
      });
      if (!client) throw new TRPCError({ code: 'NOT_FOUND' });
      return client;
    }),
    
  create: tenantProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email().optional().nullable(),
      phone: z.string().optional().nullable(),
      address: z.string().optional().nullable(),
      type: z.enum(['CONTRACT', 'ON_DEMAND']),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!checkPermission(ctx.session, 'clients', 'write')) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      
      return ctx.db.client.create({
        data: {
          ...input,
          tenantId: ctx.tenantId,
        }
      });
    }),
    
  update: tenantProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      email: z.string().email().optional().nullable(),
      phone: z.string().optional().nullable(),
      address: z.string().optional().nullable(),
      type: z.enum(['CONTRACT', 'ON_DEMAND']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!checkPermission(ctx.session, 'clients', 'write')) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      
      const { id, ...data } = input;
      return ctx.db.client.update({
        where: { id, tenantId: ctx.tenantId },
        data
      });
    }),
    
  delete: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!checkPermission(ctx.session, 'clients', 'delete')) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      
      return ctx.db.client.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { deletedAt: new Date() }
      });
    })
});
