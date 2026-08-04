import { router, permissionProcedure } from '../trpc';
import { z } from 'zod';
import { tenantWhere } from '../../lib/tenant-context';
import { TRPCError } from '@trpc/server';
import { recordAudit } from '../../services/audit.service';
import type { Prisma } from '@prisma/client';

const TypeEnum = z.enum(['INCOME', 'EXPENSE']);

export const transactionsRouter = router({
  list: permissionProcedure('finance', 'read')
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        type: TypeEnum.optional(),
        clientId: z.string().uuid().optional(),
        category: z.string().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { startDate, endDate, type, clientId, category, page, limit } = input;
      const skip = (page - 1) * limit;

      const whereClause: Prisma.TransactionWhereInput = {
        ...tenantWhere(ctx.tenantId),
        ...(type && { type }),
        ...(clientId && { clientId }),
        ...(category && { category }),
        ...((startDate || endDate) && {
          transactionDate: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate }),
          },
        }),
      };

      const [items, total, totals] = await Promise.all([
        ctx.db.transaction.findMany({
          where: whereClause,
          skip,
          take: limit,
          include: {
            client: { select: { id: true, name: true } },
            visit: { select: { id: true, scheduledAt: true, serviceType: true } },
          },
          orderBy: { transactionDate: 'desc' },
        }),
        ctx.db.transaction.count({ where: whereClause }),
        ctx.db.transaction.groupBy({
          by: ['type'],
          where: whereClause,
          _sum: { amount: true },
        }),
      ]);

      const income = Number(totals.find((t) => t.type === 'INCOME')?._sum.amount ?? 0);
      const expense = Number(totals.find((t) => t.type === 'EXPENSE')?._sum.amount ?? 0);

      return {
        items,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        summary: { income, expense, balance: income - expense },
      };
    }),

  /** Income/expense totals per month, for the finance chart. */
  monthlySummary: permissionProcedure('finance', 'read')
    .input(z.object({ months: z.number().min(1).max(24).default(6) }))
    .query(async ({ ctx, input }) => {
      const since = new Date();
      since.setMonth(since.getMonth() - (input.months - 1), 1);
      since.setHours(0, 0, 0, 0);

      const rows = await ctx.db.$queryRaw<
        { month: Date; type: string; total: string }[]
      >`
        SELECT date_trunc('month', transaction_date) AS month,
               type::text AS type,
               SUM(amount)::text AS total
        FROM transactions
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND deleted_at IS NULL
          AND transaction_date >= ${since}
        GROUP BY 1, 2
        ORDER BY 1 ASC
      `;

      // Seed every month in the window so the chart keeps a fixed number of
      // columns even when a month has no movements at all.
      const byMonth = new Map<string, { month: string; income: number; expense: number }>();
      for (let offset = 0; offset < input.months; offset++) {
        const cursor = new Date(since.getFullYear(), since.getMonth() + offset, 1);
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        byMonth.set(key, { month: key, income: 0, expense: 0 });
      }

      for (const row of rows) {
        const month = new Date(row.month);
        const key = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, '0')}`;
        const entry = byMonth.get(key);
        if (!entry) continue;
        if (row.type === 'INCOME') entry.income = Number(row.total);
        else entry.expense = Number(row.total);
      }

      return Array.from(byMonth.values());
    }),

  create: permissionProcedure('finance', 'write')
    .input(
      z.object({
        type: TypeEnum,
        amount: z.number().positive(),
        category: z.string().nullish(),
        transactionDate: z.date(),
        clientId: z.string().uuid().nullish(),
        visitId: z.string().uuid().nullish(),
        notes: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction.create({
        data: {
          ...input,
          category: input.category || null,
          notes: input.notes || null,
          tenantId: ctx.tenantId,
        },
      });
    }),

  update: permissionProcedure('finance', 'write')
    .input(
      z.object({
        id: z.string().uuid(),
        type: TypeEnum.optional(),
        amount: z.number().positive().optional(),
        category: z.string().nullish(),
        transactionDate: z.date().optional(),
        notes: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.transaction.update({
        where: { id, tenantId: ctx.tenantId },
        data,
      });
    }),

  delete: permissionProcedure('finance', 'write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db.transaction.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { deletedAt: new Date() },
      });

      await recordAudit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: 'DELETE',
        entityType: 'transaction',
        entityId: input.id,
        changes: { type: deleted.type, amount: String(deleted.amount) },
      });

      return deleted;
    }),

  purgePreAugustTransactions: permissionProcedure('finance', 'write')
    .mutation(async ({ ctx }) => {
      const cutoffDate = new Date('2026-08-01T00:00:00.000Z');
      const updated = await ctx.db.transaction.updateMany({
        where: {
          tenantId: ctx.tenantId,
          transactionDate: { lt: cutoffDate },
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });
      return { count: updated.count };
    }),
});
