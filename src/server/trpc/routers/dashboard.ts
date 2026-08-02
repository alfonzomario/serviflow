import { router, tenantProcedure } from '../trpc';
import { tenantWhere } from '../../lib/tenant-context';

/** Percentage change from `previous` to `current`, null when there is no base. */
const trend = (current: number, previous: number): number | null => {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

export const dashboardRouter = router({
  kpis: tenantProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const scope = tenantWhere(ctx.tenantId);

    const [
      revenueThisMonth,
      revenuePrevMonth,
      pendingVisits,
      completedThisMonth,
      completedPrevMonth,
      activeClients,
      openRequests,
    ] = await Promise.all([
      ctx.db.transaction.aggregate({
        where: {
          ...scope,
          type: 'INCOME',
          transactionDate: { gte: monthStart, lte: monthEnd },
        },
        _sum: { amount: true },
      }),
      ctx.db.transaction.aggregate({
        where: {
          ...scope,
          type: 'INCOME',
          transactionDate: { gte: prevMonthStart, lte: prevMonthEnd },
        },
        _sum: { amount: true },
      }),
      ctx.db.visit.count({
        where: { ...scope, status: { in: ['PENDING_CONFIRM', 'CONFIRMED'] } },
      }),
      ctx.db.visit.count({
        where: { ...scope, status: 'COMPLETED', scheduledAt: { gte: monthStart, lte: monthEnd } },
      }),
      ctx.db.visit.count({
        where: {
          ...scope,
          status: 'COMPLETED',
          scheduledAt: { gte: prevMonthStart, lte: prevMonthEnd },
        },
      }),
      ctx.db.client.count({ where: { ...scope, status: 'ACTIVE' } }),
      ctx.db.serviceRequest.count({
        where: { tenantId: ctx.tenantId, status: 'PENDING' },
      }),
    ]);

    const revenue = Number(revenueThisMonth._sum.amount ?? 0);
    const prevRevenue = Number(revenuePrevMonth._sum.amount ?? 0);

    return {
      revenue: { value: revenue, trend: trend(revenue, prevRevenue) },
      pendingVisits,
      completedVisits: {
        value: completedThisMonth,
        trend: trend(completedThisMonth, completedPrevMonth),
      },
      activeClients,
      openRequests,
    };
  }),

  /** Next visits in the coming 48 hours, for the dashboard panel. */
  upcomingVisits: tenantProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    return ctx.db.visit.findMany({
      where: {
        ...tenantWhere(ctx.tenantId),
        scheduledAt: { gte: now, lte: in48Hours },
        status: { in: ['PENDING_CONFIRM', 'CONFIRMED'] },
      },
      include: { client: { select: { id: true, name: true, address: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: 8,
    });
  }),
});
