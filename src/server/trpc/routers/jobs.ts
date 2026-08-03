import { router, permissionProcedure } from '../trpc';
import { z } from 'zod';
import { tenantWhere } from '../../lib/tenant-context';
import { recordAudit } from '../../services/audit.service';
import { TRPCError } from '@trpc/server';

const VisitTypeEnum = z.enum(['CONTRACT', 'SPECIAL']);

/**
 * Multi-visit jobs ("tratamientos"). A job is the piece of work; its visits are
 * the applications that fulfil it.
 *
 * Everything here only ever creates or edits the job itself — the visits are
 * still booked one at a time by the user from Pendientes or the agenda. Closing
 * a job stops the remaining applications from being owed; it never touches the
 * visits that already have a date.
 *
 * Lives under the `agenda` module: whoever can book a visit can open a job.
 */
export const jobsRouter = router({
  /** Open jobs for a client, newest first, with their applications. */
  byClient: permissionProcedure('clients', 'read')
    .input(
      z.object({
        clientId: z.string().uuid(),
        includeClosed: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.job.findMany({
        where: {
          ...tenantWhere(ctx.tenantId),
          clientId: input.clientId,
          ...(input.includeClosed ? {} : { closedAt: null }),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          visits: {
            where: { deletedAt: null },
            orderBy: { applicationNumber: 'asc' },
            select: {
              id: true,
              applicationNumber: true,
              scheduledAt: true,
              status: true,
              price: true,
            },
          },
        },
      });
    }),

  getById: permissionProcedure('agenda', 'read')
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.db.job.findFirst({
        where: { id: input.id, ...tenantWhere(ctx.tenantId) },
        include: {
          client: { select: { id: true, name: true } },
          visits: {
            where: { deletedAt: null },
            orderBy: { applicationNumber: 'asc' },
          },
        },
      });
      if (!job) throw new TRPCError({ code: 'NOT_FOUND' });
      return job;
    }),

  /**
   * Opens a job without booking anything. The applications show up under
   * Pendientes right away, including the first one — which the old shape could
   * not represent, since a job only existed through its visits.
   */
  create: permissionProcedure('agenda', 'write')
    .input(
      z.object({
        clientId: z.string().uuid(),
        requestId: z.string().uuid().nullish(),
        serviceType: z.string().nullish(),
        visitType: VisitTypeEnum.default('SPECIAL'),
        totalApplications: z.number().int().min(2).max(60),
        notes: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.db.client.findFirst({
        where: { id: input.clientId, ...tenantWhere(ctx.tenantId) },
        select: { id: true },
      });
      if (!client) throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });

      const job = await ctx.db.job.create({
        data: {
          tenantId: ctx.tenantId,
          clientId: input.clientId,
          requestId: input.requestId ?? null,
          serviceType: input.serviceType || null,
          visitType: input.visitType,
          totalApplications: input.totalApplications,
          notes: input.notes || null,
        },
      });

      await recordAudit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: 'CREATE',
        entityType: 'job',
        entityId: job.id,
        changes: { totalApplications: input.totalApplications },
      });

      return job;
    }),

  /**
   * Changing `totalApplications` mid-job is the whole point of the entity:
   * raising it asks for the extra applications, lowering it stops asking. The
   * visits already booked are never touched — if the number drops below what is
   * already scheduled, nothing more is owed and nothing is deleted.
   */
  update: permissionProcedure('agenda', 'write')
    .input(
      z.object({
        id: z.string().uuid(),
        serviceType: z.string().nullish(),
        visitType: VisitTypeEnum.optional(),
        totalApplications: z.number().int().min(1).max(60).optional(),
        notes: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const job = await ctx.db.job.findFirst({
        where: { id, ...tenantWhere(ctx.tenantId) },
        select: { totalApplications: true },
      });
      if (!job) throw new TRPCError({ code: 'NOT_FOUND' });

      const updated = await ctx.db.job.update({
        where: { id, tenantId: ctx.tenantId },
        data: {
          ...data,
          ...(data.serviceType !== undefined && { serviceType: data.serviceType || null }),
          ...(data.notes !== undefined && { notes: data.notes || null }),
        },
      });

      if (
        input.totalApplications !== undefined &&
        input.totalApplications !== job.totalApplications
      ) {
        await recordAudit({
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
          action: 'UPDATE',
          entityType: 'job',
          entityId: id,
          changes: {
            totalApplications: {
              old: job.totalApplications,
              new: input.totalApplications,
            },
          },
        });
      }

      return updated;
    }),

  /**
   * Closes a job early: the applications still missing stop being surfaced as
   * pending. Visits already on the calendar stay exactly as they are.
   */
  close: permissionProcedure('agenda', 'write')
    .input(z.object({ id: z.string().uuid(), reason: z.string().max(500).nullish() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.job.findFirst({
        where: { id: input.id, ...tenantWhere(ctx.tenantId) },
        select: { id: true, notes: true },
      });
      if (!job) throw new TRPCError({ code: 'NOT_FOUND' });

      const closed = await ctx.db.job.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: {
          closedAt: new Date(),
          ...(input.reason ? { notes: [job.notes, input.reason].filter(Boolean).join('\n') } : {}),
        },
      });

      await recordAudit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: 'STATUS_CHANGE',
        entityType: 'job',
        entityId: input.id,
        changes: { closed: true, reason: input.reason ?? null },
      });

      return closed;
    }),

  /** Undo of `close`: the missing applications go back to being owed. */
  reopen: permissionProcedure('agenda', 'write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const reopened = await ctx.db.job.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { closedAt: null },
      });

      await recordAudit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: 'STATUS_CHANGE',
        entityType: 'job',
        entityId: input.id,
        changes: { closed: false },
      });

      return reopened;
    }),

  /**
   * Soft-deletes the job. Its visits are deliberately left alone: they are real
   * work that happened, and deleting them is a separate decision the user makes
   * per visit.
   */
  delete: permissionProcedure('agenda', 'write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db.job.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { deletedAt: new Date() },
      });

      await recordAudit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: 'DELETE',
        entityType: 'job',
        entityId: input.id,
      });

      return deleted;
    }),

  /** Bulk deletes multiple jobs by array of IDs, or deletes all legacy jobs */
  deleteMany: permissionProcedure('agenda', 'write')
    .input(z.object({ ids: z.array(z.string().uuid()).optional() }))
    .mutation(async ({ ctx, input }) => {
      const whereClause =
        input.ids && input.ids.length > 0
          ? { id: { in: input.ids }, ...tenantWhere(ctx.tenantId) }
          : { ...tenantWhere(ctx.tenantId) };

      const updated = await ctx.db.job.updateMany({
        where: whereClause,
        data: { deletedAt: new Date(), closedAt: new Date() },
      });

      return { count: updated.count };
    }),
});
