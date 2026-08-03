import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

const clientProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const user = await ctx.db.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { clientId: true, tenantId: true },
  });

  if (!user || !user.clientId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Esta cuenta no está vinculada a un cliente.',
    });
  }

  return next({
    ctx: {
      ...ctx,
      clientId: user.clientId,
      tenantId: user.tenantId,
    },
  });
});

export const portalRouter = router({
  getClientSummary: clientProcedure.query(async ({ ctx }) => {
    const client = await ctx.db.client.findUnique({
      where: { id: ctx.clientId },
    });

    const upcomingVisits = await ctx.db.visit.findMany({
      where: {
        clientId: ctx.clientId,
        deletedAt: null,
        scheduledAt: { gte: new Date() },
        status: { in: ['PENDING_CONFIRM', 'CONFIRMED'] },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    const historyVisits = await ctx.db.visit.findMany({
      where: {
        clientId: ctx.clientId,
        deletedAt: null,
        status: 'COMPLETED',
      },
      orderBy: { scheduledAt: 'desc' },
      take: 10,
    });

    const myRequests = await ctx.db.serviceRequest.findMany({
      where: {
        clientId: ctx.clientId,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      client,
      upcomingVisits,
      historyVisits,
      myRequests,
    };
  }),

  createRequest: clientProcedure
    .input(
      z.object({
        notes: z.string().min(3),
        urgency: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
        preferredDate: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.db.serviceRequest.create({
        data: {
          tenantId: ctx.tenantId,
          clientId: ctx.clientId,
          comment: input.notes,
          urgency: input.urgency,
          status: 'PENDING',
        },
      });

      return request;
    }),

});
