import { db } from '../db';
import { tenantWhere } from '../lib/tenant-context';
import type { VisitStatus } from '@prisma/client';

// Valid status transitions (state machine)
const STATUS_TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  PENDING_CONFIRM: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'SKIPPED', 'PENDING_CONFIRM'],
  COMPLETED: [], // Terminal state
  CANCELLED: ['PENDING_CONFIRM'], // Can be re-opened
  SKIPPED: ['PENDING_CONFIRM'], // Can be re-opened
};

export const validateStatusTransition = (
  currentStatus: VisitStatus,
  newStatus: VisitStatus
): boolean => {
  return STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
};

export const onVisitStatusChange = async (
  visitId: string,
  newStatus: VisitStatus,
  tenantId: string
) => {
  if (newStatus === 'COMPLETED') {
    // Auto-create INCOME transaction for the visit
    const visit = await db.visit.findUnique({
      where: { id: visitId },
      select: { price: true, priceWaived: true, clientId: true, scheduledAt: true },
    });

    if (visit && visit.price && Number(visit.price) > 0 && !visit.priceWaived) {
      await db.transaction.create({
        data: {
          tenantId,
          visitId,
          clientId: visit.clientId,
          type: 'INCOME',
          amount: visit.price,
          category: 'Visita',
          transactionDate: visit.scheduledAt,
        },
      });
    }

    // Update completedAt timestamp
    await db.visit.update({
      where: { id: visitId },
      data: { completedAt: new Date() },
    });
  }

  if (newStatus === 'CANCELLED') {
    // Soft-delete associated pending income transactions
    await db.transaction.updateMany({
      where: {
        ...tenantWhere(tenantId),
        visitId,
        type: 'INCOME',
      },
      data: { deletedAt: new Date() },
    });

    // TODO: Delete Google Calendar event via calendar.service.ts
  }
};

/**
 * Get the last price charged to a client for price suggestion.
 */
export const getLastPriceForClient = async (
  tenantId: string,
  clientId: string
): Promise<number | null> => {
  const lastVisit = await db.visit.findFirst({
    where: {
      ...tenantWhere(tenantId),
      clientId,
      status: 'COMPLETED',
      price: { gt: 0 },
    },
    orderBy: { scheduledAt: 'desc' },
    select: { price: true },
  });

  return lastVisit?.price ? Number(lastVisit.price) : null;
};

/**
 * Get pending visits for the current month:
 * 1. CONTRACT clients without a scheduled visit this month
 * 2. Incomplete multi-application treatments
 */
export const getPendingVisits = async (tenantId: string, monthDate: Date) => {
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59);

  // 1. CONTRACT clients without a visit this month
  const contractClientsWithoutVisit = await db.$queryRaw`
    SELECT c.id, c.name, c.address, c.phone, c.service_types
    FROM clients c
    WHERE c.tenant_id = ${tenantId}::uuid
      AND c.relationship_type = 'CONTRACT'
      AND c.status = 'ACTIVE'
      AND c.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM visits v
        WHERE v.client_id = c.id
          AND v.tenant_id = ${tenantId}::uuid
          AND v.status NOT IN ('CANCELLED')
          AND v.deleted_at IS NULL
          AND v.scheduled_at >= ${monthStart}
          AND v.scheduled_at <= ${monthEnd}
      )
  `;

  // 2. Incomplete multi-application treatments
  const incompleteTreatments = await db.$queryRaw`
    SELECT v.id, v.client_id, c.name as client_name, v.application_number,
           v.total_applications, v.service_type, v.completed_at
    FROM visits v
    JOIN clients c ON c.id = v.client_id
    WHERE v.tenant_id = ${tenantId}::uuid
      AND v.total_applications > 1
      AND v.application_number < v.total_applications
      AND v.status = 'COMPLETED'
      AND v.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM visits v2
        WHERE v2.client_id = v.client_id
          AND v2.tenant_id = ${tenantId}::uuid
          AND v2.application_number = v.application_number + 1
          AND v2.deleted_at IS NULL
      )
  `;

  return {
    contractClientsWithoutVisit,
    incompleteTreatments,
  };
};
