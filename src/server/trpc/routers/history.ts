import { router, permissionProcedure } from '../trpc';
import { z } from 'zod';
import { tenantOnly } from '../../lib/tenant-context';
import type { Prisma } from '@prisma/client';

/**
 * Reads `audit_logs`. `recordAudit` had been writing to that table since the
 * beginning with nothing on the other end — this is the other end.
 *
 * Append-only by design: there is no create, update or delete here. The log is
 * written as a side effect of the operations it records, never by hand.
 */

const ENTITY_TYPES = ['visit', 'job', 'client', 'request', 'transaction', 'user'] as const;

const ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'STATUS_CHANGE',
  'SCHEDULE',
  'IMPORT',
  'ARCHIVE',
  'LOGIN',
] as const;

export const historyRouter = router({
  list: permissionProcedure('agenda', 'read')
    .input(
      z.object({
        entityType: z.enum(ENTITY_TYPES).optional(),
        action: z.enum(ACTIONS).optional(),
        userId: z.string().uuid().optional(),
        /** Narrows to one record's history — used from a detail page. */
        entityId: z.string().uuid().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, limit } = input;
      const skip = (page - 1) * limit;

      const whereClause: Prisma.AuditLogWhereInput = {
        ...tenantOnly(ctx.tenantId),
        ...(input.entityType && { entityType: input.entityType }),
        ...(input.action && { action: input.action }),
        ...(input.userId && { userId: input.userId }),
        ...(input.entityId && { entityId: input.entityId }),
        ...((input.from || input.to) && {
          createdAt: {
            ...(input.from && { gte: input.from }),
            ...(input.to && { lte: input.to }),
          },
        }),
      };

      const [items, total] = await Promise.all([
        ctx.db.auditLog.findMany({
          where: whereClause,
          skip,
          take: limit,
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        ctx.db.auditLog.count({ where: whereClause }),
      ]);

      return { items, total, page, totalPages: Math.ceil(total / limit) };
    }),

  /** Distinct actors, so the filter dropdown only offers people who did something. */
  actors: permissionProcedure('agenda', 'read').query(async ({ ctx }) => {
    const grouped = await ctx.db.auditLog.groupBy({
      by: ['userId'],
      where: { ...tenantOnly(ctx.tenantId), userId: { not: null } },
      _count: { _all: true },
    });

    const users = await ctx.db.user.findMany({
      where: {
        ...tenantOnly(ctx.tenantId),
        id: { in: grouped.map((row) => row.userId).filter((id): id is string => id !== null) },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return users;
  }),
});
