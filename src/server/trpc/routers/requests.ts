import { router, permissionProcedure } from '../trpc';
import { z } from 'zod';
import { tenantOnly, tenantWhere } from '../../lib/tenant-context';
import { TRPCError } from '@trpc/server';
import type { Prisma } from '@prisma/client';

const UrgencyEnum = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const RequestStatusEnum = z.enum(['PENDING', 'SCHEDULED', 'CLOSED']);

export const requestsRouter = router({
  list: permissionProcedure('requests', 'read')
    .input(
      z.object({
        status: RequestStatusEnum.optional(),
        urgency: UrgencyEnum.optional(),
        clientId: z.string().uuid().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { status, urgency, clientId, page, limit } = input;
      const skip = (page - 1) * limit;

      // ServiceRequest has no deleted_at column: scope by tenant only.
      const whereClause: Prisma.ServiceRequestWhereInput = {
        ...tenantOnly(ctx.tenantId),
        ...(status && { status }),
        ...(urgency && { urgency }),
        ...(clientId && { clientId }),
      };

      const [items, total] = await Promise.all([
        ctx.db.serviceRequest.findMany({
          where: whereClause,
          skip,
          take: limit,
          include: {
            client: { select: { id: true, name: true, phone: true, address: true } },
            visits: { select: { id: true, scheduledAt: true, status: true } },
          },
          // Urgent first, then oldest — the queue an operator works top-down.
          orderBy: [{ urgency: 'desc' }, { createdAt: 'asc' }],
        }),
        ctx.db.serviceRequest.count({ where: whereClause }),
      ]);

      return { items, total, page, totalPages: Math.ceil(total / limit) };
    }),

  /** Counts per status, for the page tabs. */
  counts: permissionProcedure('requests', 'read').query(async ({ ctx }) => {
    const grouped = await ctx.db.serviceRequest.groupBy({
      by: ['status'],
      where: tenantOnly(ctx.tenantId),
      _count: { _all: true },
    });

    return {
      PENDING: grouped.find((g) => g.status === 'PENDING')?._count._all ?? 0,
      SCHEDULED: grouped.find((g) => g.status === 'SCHEDULED')?._count._all ?? 0,
      CLOSED: grouped.find((g) => g.status === 'CLOSED')?._count._all ?? 0,
    };
  }),

  create: permissionProcedure('requests', 'write')
    .input(
      z.object({
        clientId: z.string().uuid(),
        serviceTypes: z.array(z.string()).default([]),
        urgency: UrgencyEnum.default('MEDIUM'),
        comment: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.db.client.findFirst({
        where: { id: input.clientId, ...tenantWhere(ctx.tenantId) },
        select: { name: true },
      });
      if (!client) throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });

      return ctx.db.serviceRequest.create({
        data: {
          ...input,
          comment: input.comment || null,
          // Denormalised so the request still reads well if the client is renamed.
          clientName: client.name,
          tenantId: ctx.tenantId,
        },
      });
    }),

  update: permissionProcedure('requests', 'write')
    .input(
      z.object({
        id: z.string().uuid(),
        serviceTypes: z.array(z.string()).optional(),
        urgency: UrgencyEnum.optional(),
        status: RequestStatusEnum.optional(),
        comment: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.serviceRequest.update({
        where: { id, tenantId: ctx.tenantId },
        data,
      });
    }),

  /**
   * Turns a request into a scheduled visit: creates the Visit, links it back
   * to the request and flips the request to SCHEDULED in one transaction.
   *
   * With `totalApplications` it opens a multi-visit job instead, and this visit
   * becomes its first application. The rest show up under Pendientes — nothing
   * is ever booked automatically.
   */
  schedule: permissionProcedure('agenda', 'write')
    .input(
      z.object({
        id: z.string().uuid(),
        scheduledAt: z.date(),
        durationMinutes: z.number().min(5).max(600).default(45),
        assignedUserId: z.string().uuid().nullish(),
        price: z.number().min(0).default(0),
        serviceType: z.string().nullish(),
        totalApplications: z.number().int().min(2).max(60).nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.db.serviceRequest.findFirst({
        where: { id: input.id, ...tenantOnly(ctx.tenantId) },
      });
      if (!request) throw new TRPCError({ code: 'NOT_FOUND' });
      if (request.status === 'CLOSED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'La solicitud ya está cerrada',
        });
      }

      const serviceType = input.serviceType || request.serviceTypes[0] || null;

      return ctx.db.$transaction(async (tx) => {
        const job = input.totalApplications
          ? await tx.job.create({
              data: {
                tenantId: ctx.tenantId,
                clientId: request.clientId,
                requestId: request.id,
                serviceType,
                visitType: 'SPECIAL',
                totalApplications: input.totalApplications,
                notes: request.comment,
              },
            })
          : null;

        const visit = await tx.visit.create({
          data: {
            tenantId: ctx.tenantId,
            clientId: request.clientId,
            requestId: request.id,
            jobId: job?.id ?? null,
            applicationNumber: job ? 1 : null,
            scheduledAt: input.scheduledAt,
            durationMinutes: input.durationMinutes,
            assignedUserId: input.assignedUserId ?? null,
            price: input.price,
            serviceType,
            serviceDetails: request.serviceTypes,
            status: 'CONFIRMED',
            notes: request.comment,
          },
        });

        await tx.serviceRequest.update({
          where: { id: request.id },
          data: { status: 'SCHEDULED' },
        });

        return visit;
      });
    }),

  close: permissionProcedure('requests', 'write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.serviceRequest.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { status: 'CLOSED' },
      });
    }),

  delete: permissionProcedure('requests', 'write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.serviceRequest.delete({
        where: { id: input.id, tenantId: ctx.tenantId },
      });
    }),
});
