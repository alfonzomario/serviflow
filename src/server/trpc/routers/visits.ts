import { router, tenantProcedure } from '../trpc';
import { z } from 'zod';
import { tenantWhere } from '../../lib/tenant-context';
import { validateStatusTransition, onVisitStatusChange } from '../../services/visit.service';
import { TRPCError } from '@trpc/server';

const VisitStatusEnum = z.enum(['PENDING_CONFIRM', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);

export const visitsRouter = router({
  list: tenantProcedure
    .input(z.object({
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      clientId: z.string().optional(),
      status: VisitStatusEnum.optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const { startDate, endDate, clientId, status, page, limit } = input;
      const skip = (page - 1) * limit;
      
      const whereClause = {
        ...tenantWhere(ctx.tenantId),
        ...(clientId && { clientId }),
        ...(status && { status }),
        ...((startDate || endDate) && {
          scheduledAt: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate })
          }
        })
      };

      const [items, total] = await Promise.all([
        ctx.db.visit.findMany({
          where: whereClause,
          skip,
          take: limit,
          include: { client: { select: { name: true } } },
          orderBy: { scheduledAt: 'asc' }
        }),
        ctx.db.visit.count({ where: whereClause })
      ]);

      return { items, total, page, totalPages: Math.ceil(total / limit) };
    }),

  getById: tenantProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const visit = await ctx.db.visit.findFirst({
        where: { id: input.id, ...tenantWhere(ctx.tenantId) },
        include: { client: true, assignedUser: true }
      });
      if (!visit) throw new TRPCError({ code: 'NOT_FOUND' });
      return visit;
    }),

  create: tenantProcedure
    .input(z.object({
      clientId: z.string(),
      scheduledAt: z.date(),
      notes: z.string().optional(),
      status: VisitStatusEnum.default('PENDING_CONFIRM'),
      price: z.number().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.visit.create({
        data: {
          ...input,
          tenantId: ctx.tenantId,
        }
      });
    }),

  update: tenantProcedure
    .input(z.object({
      id: z.string(),
      scheduledAt: z.date().optional(),
      notes: z.string().optional(),
      price: z.number().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.visit.update({
        where: { id, tenantId: ctx.tenantId },
        data
      });
    }),

  updateStatus: tenantProcedure
    .input(z.object({
      id: z.string(),
      status: VisitStatusEnum
    }))
    .mutation(async ({ ctx, input }) => {
      const visit = await ctx.db.visit.findFirst({
        where: { id: input.id, ...tenantWhere(ctx.tenantId) }
      });
      
      if (!visit) throw new TRPCError({ code: 'NOT_FOUND' });
      
      // Temporary ignore TS error since VisitStatus is mocked
      if (!validateStatusTransition(visit.status as any, input.status as any)) {
        throw new TRPCError({ 
          code: 'BAD_REQUEST', 
          message: `Invalid status transition from ${visit.status} to ${input.status}` 
        });
      }
      
      const updated = await ctx.db.visit.update({
        where: { id: input.id },
        data: { status: input.status }
      });
      
      await onVisitStatusChange(visit.id, input.status as any, ctx.tenantId);
      
      return updated;
    }),

  delete: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.visit.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { deletedAt: new Date() }
      });
    })
});
