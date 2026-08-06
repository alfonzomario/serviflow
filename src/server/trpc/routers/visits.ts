import { router, permissionProcedure } from '../trpc';
import { z } from 'zod';
import { tenantWhere } from '../../lib/tenant-context';
import {
  validateStatusTransition,
  onVisitStatusChange,
  getLastPriceForClient,
  getPendingVisits,
  getApplicationGapWarning,
} from '../../services/visit.service';
import { syncVisitToGoogle, deleteCalendarEvent } from '../../services/google-calendar.service';

/** Awaits the Google sync and reduces it to a warning string the client can toast — null when it worked or there was legitimately nothing to sync. */
async function syncAndWarn(visitId: string, tenantId: string): Promise<string | null> {
  const result = await syncVisitToGoogle(visitId, tenantId);
  return result.ok ? null : result.reason;
}
import { recordAudit } from '../../services/audit.service';
import { TRPCError } from '@trpc/server';
import type { Prisma } from '@prisma/client';

const VisitStatusEnum = z.enum([
  'PENDING_CONFIRM',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'SKIPPED',
]);
const PaymentStatusEnum = z.enum(['PENDING', 'PAID', 'WAIVED']);
const VisitTypeEnum = z.enum(['CONTRACT', 'SPECIAL']);

export const visitsRouter = router({
  list: permissionProcedure('agenda', 'read')
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        clientId: z.string().uuid().optional(),
        assignedUserId: z.string().uuid().optional(),
        status: VisitStatusEnum.optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(500).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { startDate, endDate, clientId, assignedUserId, status, page, limit } = input;
      const skip = (page - 1) * limit;

      const whereClause: Prisma.VisitWhereInput = {
        ...tenantWhere(ctx.tenantId),
        ...(clientId && { clientId }),
        ...(assignedUserId && { assignedUserId }),
        ...(status && { status }),
        ...((startDate || endDate) && {
          scheduledAt: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate }),
          },
        }),
      };

      const [items, total] = await Promise.all([
        ctx.db.visit.findMany({
          where: whereClause,
          skip,
          take: limit,
          include: {
            client: { select: { id: true, name: true, address: true, phone: true } },
            assignedUser: { select: { id: true, name: true } },
            // Para que la agenda pueda decir "2/5": sin esto, una aplicación
            // suelta y una de un tratamiento se ven exactamente igual.
            job: { select: { id: true, totalApplications: true } },
          },
          orderBy: { scheduledAt: 'asc' },
        }),
        ctx.db.visit.count({ where: whereClause }),
      ]);

      return { items, total, page, totalPages: Math.ceil(total / limit) };
    }),

  getById: permissionProcedure('agenda', 'read')
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const visit = await ctx.db.visit.findFirst({
        where: { id: input.id, ...tenantWhere(ctx.tenantId) },
        include: { client: true, assignedUser: true, transactions: true, job: true },
      });
      if (!visit) throw new TRPCError({ code: 'NOT_FOUND' });
      return visit;
    }),

  /** Suggests the price last charged to this client, for the visit form. */
  suggestedPrice: permissionProcedure('agenda', 'read')
    .input(z.object({ clientId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const price = await getLastPriceForClient(ctx.tenantId, input.clientId);
      return { price };
    }),

  /**
   * Advisory check for the visit form: warns when an application is booked too
   * soon after the previous one. Purely informational — saving is never blocked.
   */
  applicationGapWarning: permissionProcedure('agenda', 'read')
    .input(
      z.object({
        jobId: z.string().uuid(),
        applicationNumber: z.number().int().min(1).nullish(),
        scheduledAt: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getApplicationGapWarning(ctx.tenantId, {
        jobId: input.jobId,
        applicationNumber: input.applicationNumber ?? null,
        scheduledAt: input.scheduledAt,
      });
    }),

  pending: permissionProcedure('agenda', 'read')
    .input(z.object({ month: z.date().optional() }))
    .query(async ({ ctx, input }) => {
      return getPendingVisits(ctx.tenantId, input.month ?? new Date());
    }),

  /**
   * Settles a recurring period without booking anything: records a SKIPPED
   * visit for it, which is how the period stops being owed. Deleting that row
   * later brings the pendiente back, same as any other visit.
   */
  settlePeriod: permissionProcedure('agenda', 'write')
    .input(
      z.object({
        clientId: z.string().uuid(),
        /** The date the period was owed from. */
        dueAt: z.date(),
        reason: z.string().max(500).nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.db.client.findFirst({
        where: { id: input.clientId, ...tenantWhere(ctx.tenantId) },
        select: { id: true },
      });
      if (!client) throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });

      const visit = await ctx.db.visit.create({
        data: {
          tenantId: ctx.tenantId,
          clientId: input.clientId,
          scheduledAt: input.dueAt,
          visitType: 'CONTRACT',
          status: 'SKIPPED',
          price: 0,
          notes: input.reason || 'Período saldado sin visita',
        },
      });

      await recordAudit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: 'STATUS_CHANGE',
        entityType: 'visit',
        entityId: visit.id,
        changes: { settledWithoutVisit: true, dueAt: input.dueAt.toISOString() },
      });

      return visit;
    }),

  create: permissionProcedure('agenda', 'write')
    .input(
      z.object({
        clientId: z.string().uuid(),
        // Null files the visit under Pendientes until it gets a slot.
        scheduledAt: z.date().nullish(),
        visitType: VisitTypeEnum.default('SPECIAL'),
        durationMinutes: z.number().min(5).max(600).default(45),
        assignedUserId: z.string().uuid().nullish(),
        requestId: z.string().uuid().nullish(),
        serviceType: z.string().nullish(),
        serviceDetails: z.array(z.string()).default([]),
        status: VisitStatusEnum.default('PENDING_CONFIRM'),
        price: z.number().min(0).default(0),
        priceWaived: z.boolean().default(false),
        applicationNumber: z.number().int().min(1).nullish(),
        // Books this visit as an application of a job that already exists —
        // how Pendientes clears a "falta la aplicación N".
        jobId: z.string().uuid().nullish(),
        // Opens a new multi-visit job with this visit as its first application.
        // Mutually exclusive with `jobId`.
        newJobApplications: z.number().int().min(2).max(60).nullish(),
        notes: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { jobId, newJobApplications, ...visitData } = input;

      if (jobId && newJobApplications) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Una visita se suma a un trabajo existente o abre uno nuevo, no las dos',
        });
      }

      const client = await ctx.db.client.findFirst({
        where: { id: input.clientId, ...tenantWhere(ctx.tenantId) },
        select: { id: true },
      });
      if (!client) throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });

      // Joining an existing job: the job owns the request link, so the visit
      // inherits it instead of the caller having to pass it along.
      if (jobId) {
        const job = await ctx.db.job.findFirst({
          where: { id: jobId, ...tenantWhere(ctx.tenantId) },
          select: { id: true, clientId: true, requestId: true, visitType: true },
        });
        if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
        if (job.clientId !== input.clientId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'El trabajo pertenece a otro cliente',
          });
        }

        const visit = await ctx.db.visit.create({
          data: {
            ...visitData,
            serviceType: input.serviceType || null,
            notes: input.notes || null,
            jobId: job.id,
            requestId: visitData.requestId ?? job.requestId,
            visitType: job.visitType,
            tenantId: ctx.tenantId,
          },
        });
        const googleSyncWarning = await syncAndWarn(visit.id, ctx.tenantId);
        return { ...visit, googleSyncWarning };
      }

      // Opening a new job: the job and its first application are one action for
      // the user, so they are one transaction here.
      if (newJobApplications) {
        const visit = await ctx.db.$transaction(async (tx) => {
          const job = await tx.job.create({
            data: {
              tenantId: ctx.tenantId,
              clientId: input.clientId,
              requestId: visitData.requestId ?? null,
              serviceType: input.serviceType || null,
              visitType: visitData.visitType,
              totalApplications: newJobApplications,
            },
          });

          const v = await tx.visit.create({
            data: {
              ...visitData,
              serviceType: input.serviceType || null,
              notes: input.notes || null,
              jobId: job.id,
              applicationNumber: visitData.applicationNumber ?? 1,
              tenantId: ctx.tenantId,
            },
          });

          return v;
        });
        const googleSyncWarning = await syncAndWarn(visit.id, ctx.tenantId);
        return { ...visit, googleSyncWarning };
      }

      const visit = await ctx.db.visit.create({
        data: {
          ...visitData,
          serviceType: input.serviceType || null,
          notes: input.notes || null,
          tenantId: ctx.tenantId,
        },
      });
      const googleSyncWarning = await syncAndWarn(visit.id, ctx.tenantId);
      return { ...visit, googleSyncWarning };
    }),

  update: permissionProcedure('agenda', 'write')
    .input(
      z.object({
        id: z.string().uuid(),
        clientId: z.string().uuid().optional(),
        scheduledAt: z.date().nullish(),
        visitType: VisitTypeEnum.optional(),
        durationMinutes: z.number().min(5).max(600).optional(),
        assignedUserId: z.string().uuid().nullish(),
        serviceType: z.string().nullish(),
        serviceDetails: z.array(z.string()).optional(),
        price: z.number().min(0).optional(),
        priceWaived: z.boolean().optional(),
        paymentStatus: PaymentStatusEnum.optional(),
        applicationNumber: z.number().int().min(1).nullish(),
        newJobApplications: z.number().int().min(2).max(60).nullish(),
        notes: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, newJobApplications, clientId, ...data } = input;

      const visit = await ctx.db.visit.findFirst({
        where: { id, ...tenantWhere(ctx.tenantId) },
        select: { id: true, clientId: true, jobId: true, serviceType: true, visitType: true },
      });
      if (!visit) throw new TRPCError({ code: 'NOT_FOUND' });

      const updateData: Record<string, any> = {
        ...data,
        ...(clientId && { clientId }),
      };

      if (newJobApplications) {
        if (visit.jobId) {
          await ctx.db.job.update({
            where: { id: visit.jobId },
            data: { totalApplications: newJobApplications },
          });
        } else {
          const job = await ctx.db.job.create({
            data: {
              tenantId: ctx.tenantId,
              clientId: clientId ?? visit.clientId,
              serviceType: data.serviceType ?? visit.serviceType,
              visitType: data.visitType ?? visit.visitType,
              totalApplications: newJobApplications,
            },
          });
          updateData.job = { connect: { id: job.id } };
          updateData.applicationNumber = 1;
        }
      }

      const updated = await ctx.db.visit.update({
        where: { id, tenantId: ctx.tenantId },
        data: updateData as Prisma.VisitUpdateInput,
      });

      const googleSyncWarning = await syncAndWarn(updated.id, ctx.tenantId);
      return { ...updated, googleSyncWarning };
    }),

  /** Drag-and-drop rescheduling from the calendar. */
  reschedule: permissionProcedure('agenda', 'write')
    .input(
      z.object({
        id: z.string().uuid(),
        scheduledAt: z.date(),
        durationMinutes: z.number().min(5).max(600).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const visit = await ctx.db.visit.findFirst({
        where: { id: input.id, ...tenantWhere(ctx.tenantId) },
        select: { status: true, scheduledAt: true },
      });

      if (!visit) throw new TRPCError({ code: 'NOT_FOUND' });
      if (visit.status === 'COMPLETED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No se puede reprogramar una visita completada',
        });
      }

      const updated = await ctx.db.visit.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: {
          scheduledAt: input.scheduledAt,
          ...(input.durationMinutes && { durationMinutes: input.durationMinutes }),
        },
      });

      await recordAudit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: 'SCHEDULE',
        entityType: 'visit',
        entityId: input.id,
        changes: { scheduledAt: { old: visit.scheduledAt, new: input.scheduledAt } },
      });

      const googleSyncWarning = await syncAndWarn(updated.id, ctx.tenantId);
      return { ...updated, googleSyncWarning };
    }),


  updateStatus: permissionProcedure('agenda', 'write')
    .input(z.object({ id: z.string().uuid(), status: VisitStatusEnum }))
    .mutation(async ({ ctx, input }) => {
      const visit = await ctx.db.visit.findFirst({
        where: { id: input.id, ...tenantWhere(ctx.tenantId) },
      });

      if (!visit) throw new TRPCError({ code: 'NOT_FOUND' });

      if (!validateStatusTransition(visit.status, input.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid status transition from ${visit.status} to ${input.status}`,
        });
      }

      const updated = await ctx.db.visit.update({
        where: { id: input.id },
        data: { status: input.status },
      });

      await onVisitStatusChange(visit.id, input.status, ctx.tenantId);

      await recordAudit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: 'STATUS_CHANGE',
        entityType: 'visit',
        entityId: visit.id,
        changes: { status: { old: visit.status, new: input.status } },
      });

      return updated;
    }),

  updatePayment: permissionProcedure('agenda', 'write')
    .input(z.object({ id: z.string().uuid(), paymentStatus: PaymentStatusEnum }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.visit.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: {
          paymentStatus: input.paymentStatus,
          priceWaived: input.paymentStatus === 'WAIVED',
        },
      });
    }),

  delete: permissionProcedure('agenda', 'write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db.visit.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { deletedAt: new Date() },
      });

      // También eliminamos de finanzas cualquier transacción vinculada a esta visita
      await ctx.db.transaction.updateMany({
        where: { visitId: input.id, tenantId: ctx.tenantId },
        data: { deletedAt: new Date() },
      });

      await recordAudit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: 'DELETE',
        entityType: 'visit',
        entityId: input.id,
      });

      if (deleted.calendarEventId) {
        deleteCalendarEvent(deleted.calendarEventId, ctx.tenantId).catch(console.error);
      }

      return deleted;
    }),
});
