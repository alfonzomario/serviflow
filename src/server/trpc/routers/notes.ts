import { router, permissionProcedure } from '../trpc';
import { z } from 'zod';
import { tenantWhere } from '../../lib/tenant-context';
import { TRPCError } from '@trpc/server';

export const notesRouter = router({
  list: permissionProcedure('notes', 'read')
    .input(
      z.object({
        withReminder: z.boolean().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { withReminder, page, limit } = input;
      const skip = (page - 1) * limit;

      const whereClause = {
        ...tenantWhere(ctx.tenantId),
        ...(withReminder !== undefined && {
          reminderAt: withReminder ? { not: null } : null,
        }),
      };

      const [items, total] = await Promise.all([
        ctx.db.note.findMany({
          where: whereClause,
          skip,
          take: limit,
          include: { createdBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        ctx.db.note.count({ where: whereClause }),
      ]);

      return { items, total, page, totalPages: Math.ceil(total / limit) };
    }),

  /** Notes whose reminder is due and not yet notified — shown in the header. */
  dueReminders: permissionProcedure('notes', 'read').query(async ({ ctx }) => {
    return ctx.db.note.findMany({
      where: {
        ...tenantWhere(ctx.tenantId),
        reminderAt: { lte: new Date() },
        reminderSentAt: null,
      },
      orderBy: { reminderAt: 'asc' },
      take: 20,
    });
  }),

  create: permissionProcedure('notes', 'write')
    .input(
      z.object({
        content: z.string().min(1),
        reminderAt: z.date().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.note.create({
        data: {
          content: input.content,
          reminderAt: input.reminderAt ?? null,
          tenantId: ctx.tenantId,
          createdById: ctx.session.user.id,
        },
      });
    }),

  update: permissionProcedure('notes', 'write')
    .input(
      z.object({
        id: z.string().uuid(),
        content: z.string().min(1).optional(),
        reminderAt: z.date().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const note = await ctx.db.note.findFirst({
        where: { id, ...tenantWhere(ctx.tenantId) },
        select: { createdById: true },
      });
      if (!note) throw new TRPCError({ code: 'NOT_FOUND' });

      return ctx.db.note.update({ where: { id, tenantId: ctx.tenantId }, data });
    }),

  markReminderSent: permissionProcedure('notes', 'write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.note.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { reminderSentAt: new Date() },
      });
    }),

  delete: permissionProcedure('notes', 'write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.note.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { deletedAt: new Date() },
      });
    }),
});
