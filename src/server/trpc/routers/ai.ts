import { z } from 'zod';
import { router, tenantProcedure } from '../trpc';
import { getPendingVisits } from '../../services/visit.service';

export const aiRouter = router({
  getRecommendations: tenantProcedure.query(async ({ ctx }) => {
    const { items: pendingItems } = await getPendingVisits(ctx.tenantId, new Date());


    const suggestions = pendingItems.slice(0, 5).map((item, idx) => {
      const suggestedDate = new Date();
      suggestedDate.setDate(suggestedDate.getDate() + (idx + 1) * 2);

      const isRecurring = item.kind === 'RECURRING_SERVICE';
      const isMissing = item.kind === 'MISSING_APPLICATION';

      let reason = 'Agendamiento sugerido según historial del cliente.';
      if (isRecurring) {
        if (item.daysOverdue > 0) {
          reason = `Abono atrasado (venció el ${item.dueAt.toLocaleDateString('es-AR')}). Sugerencia para regularizar.`;
        } else {
          reason = `Próximo vencimiento estimado el ${item.dueAt.toLocaleDateString('es-AR')}.`;
        }
      } else if (isMissing) {
        reason = `Aplicación ${item.applicationNumber}/${item.totalApplications} pendiente del tratamiento.`;
      }

      return {
        id: `sug_${item.client.id}_${idx}`,
        clientId: item.client.id,
        clientName: item.client.name,
        clientAddress: item.client.address || 'Sin dirección registrada',
        reason,
        suggestedDate,
        durationMinutes: 45,
        priority: isRecurring && item.daysOverdue > 0 ? ('HIGH' as const) : ('MEDIUM' as const),
      };
    });

    return {
      totalPending: pendingItems.length,
      urgentCount: pendingItems.filter((i) => i.kind === 'RECURRING_SERVICE' && i.daysOverdue > 0).length,
      suggestions,
    };
  }),

  optimizeRoute: tenantProcedure
    .input(
      z.object({
        date: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const targetDate = input.date || new Date();
      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
      const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);

      const visits = await ctx.db.visit.findMany({
        where: {
          tenantId: ctx.tenantId,
          deletedAt: null,
          scheduledAt: { gte: startOfDay, lte: endOfDay },
        },
        include: { client: true },
        orderBy: { scheduledAt: 'asc' },
      });

      const optimized = visits.map((v, idx) => ({
        visitId: v.id,
        sequenceOrder: idx + 1,
        clientName: v.client.name,
        address: v.client.address || 'Sin dirección',
        scheduledAt: v.scheduledAt,
        estimatedArrivalTime: v.scheduledAt
          ? new Date(v.scheduledAt.getTime() + idx * 5 * 60000)
          : null,
      }));

      return {
        date: targetDate,
        totalVisits: visits.length,
        optimizedRoute: optimized,
      };
    }),

  getInsights: tenantProcedure.query(async ({ ctx }) => {
    const clientsCount = await ctx.db.client.count({
      where: { tenantId: ctx.tenantId, status: 'ACTIVE', deletedAt: null },
    });

    const activeJobs = await ctx.db.job.count({
      where: { tenantId: ctx.tenantId, closedAt: null },
    });

    const pendingRequests = await ctx.db.serviceRequest.count({
      where: { tenantId: ctx.tenantId, status: 'PENDING' },
    });

    return {
      activeClients: clientsCount,
      jobsInFollowUp: activeJobs,
      unassignedRequests: pendingRequests,
      healthScore: clientsCount > 0 ? 94 : 100,
    };
  }),
});
