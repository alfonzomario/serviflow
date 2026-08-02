import { db } from '../db';
import { tenantWhere } from '../lib/tenant-context';
import type { VisitStatus } from '@prisma/client';
import { buildPendingItems, checkApplicationGap } from './pending';

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
          transactionDate: visit.scheduledAt ?? new Date(),
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

/** Business defaults, with the schema fallbacks applied. */
const loadTenantDefaults = async (tenantId: string) => {
  const settings = await db.tenantSettings.findUnique({
    where: { tenantId },
    select: {
      recurrenceUnit: true,
      recurrenceInterval: true,
      recurrenceAnchor: true,
      oneOffSettlesPeriod: true,
      minDaysBetweenApplications: true,
    },
  });

  return {
    recurrenceUnit: settings?.recurrenceUnit ?? 'MONTH',
    recurrenceInterval: settings?.recurrenceInterval ?? 1,
    recurrenceAnchor: settings?.recurrenceAnchor ?? 'CALENDAR',
    oneOffSettlesPeriod: settings?.oneOffSettlesPeriod ?? false,
    minDaysBetweenApplications: settings?.minDaysBetweenApplications ?? 15,
  } as const;
};

/**
 * Loads everything `buildPendingItems` needs and runs it.
 *
 * The rules themselves live in `pending.ts` as a pure function so they can be
 * unit-tested; this only does the data fetching.
 */
export const getPendingVisits = async (tenantId: string, monthDate: Date) => {
  const defaults = await loadTenantDefaults(tenantId);

  const [clients, visits, jobs] = await Promise.all([
    db.client.findMany({
      where: { ...tenantWhere(tenantId), status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        serviceTypes: true,
        relationshipType: true,
        status: true,
        recurrenceUnit: true,
        recurrenceInterval: true,
        minDaysBetweenApplications: true,
      },
      orderBy: { name: 'asc' },
    }),
    // The cadence can reach arbitrarily far back (a semi-annual service due
    // today was last done six months ago), so visits are not windowed here.
    // Archiving keeps this bounded; revisit if a tenant's history grows large.
    db.visit.findMany({
      where: tenantWhere(tenantId),
      select: {
        id: true,
        clientId: true,
        requestId: true,
        jobId: true,
        scheduledAt: true,
        visitType: true,
        status: true,
        serviceType: true,
        applicationNumber: true,
      },
    }),
    db.job.findMany({
      where: tenantWhere(tenantId),
      select: {
        id: true,
        clientId: true,
        requestId: true,
        serviceType: true,
        totalApplications: true,
        closedAt: true,
      },
    }),
  ]);

  const items = buildPendingItems({
    targetMonth: monthDate,
    today: new Date(),
    defaults,
    clients,
    visits,
    jobs: jobs.map(({ closedAt, ...job }) => ({ ...job, closed: closedAt !== null })),
  });

  return {
    items,
    counts: {
      recurring: items.filter((item) => item.kind === 'RECURRING_SERVICE').length,
      missingApplications: items.filter((item) => item.kind === 'MISSING_APPLICATION').length,
      unscheduled: items.filter((item) => item.kind === 'UNSCHEDULED_VISIT').length,
    },
  };
};

/**
 * Advisory gap check for the visit form. Returns null when the date is fine.
 * Never blocks a save — the user always decides.
 */
export const getApplicationGapWarning = async (
  tenantId: string,
  input: {
    jobId: string;
    applicationNumber: number | null;
    scheduledAt: Date;
  }
) => {
  const appNumber = input.applicationNumber ?? 1;
  // The first application of a job has nothing to be too close to.
  if (appNumber <= 1) return null;

  const job = await db.job.findFirst({
    where: { id: input.jobId, ...tenantWhere(tenantId) },
    select: { clientId: true },
  });
  if (!job) return null;

  const [client, defaults, previous] = await Promise.all([
    db.client.findFirst({
      where: { id: job.clientId, ...tenantWhere(tenantId) },
      select: { minDaysBetweenApplications: true },
    }),
    loadTenantDefaults(tenantId),
    // Now a plain lookup inside the job, instead of re-deriving which visits
    // belonged together.
    db.visit.findFirst({
      where: {
        ...tenantWhere(tenantId),
        jobId: input.jobId,
        applicationNumber: appNumber - 1,
        scheduledAt: { not: null },
      },
      orderBy: { scheduledAt: 'desc' },
      select: { scheduledAt: true },
    }),
  ]);

  return checkApplicationGap(
    previous?.scheduledAt ?? null,
    input.scheduledAt,
    client?.minDaysBetweenApplications ?? defaults.minDaysBetweenApplications
  );
};
