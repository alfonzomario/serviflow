/**
 * Pendientes: the list of work that still needs to be **scheduled**.
 *
 * This is a reminder queue, not a "not done yet" report. The rules:
 *
 *  - Giving a visit a date takes it out of pendientes, whatever its status.
 *  - COMPLETED and CANCELLED both take it out for good.
 *  - Deleting a visit from the calendar puts it back — that is the only way
 *    something returns to the queue.
 *  - A recurring agreement comes due every `recurrenceInterval` units after the
 *    last one. If it was never covered it stays on the list, flagged with how
 *    late it is, rather than disappearing when the month rolls over.
 *  - Multi-visit jobs surface only the *next* missing application, never the
 *    whole tail, and carry the earliest date it should be done on.
 *
 * Nothing here schedules anything: it computes what is owed and when it becomes
 * due, and the user does the booking.
 *
 * (Three deliberate departures from the legacy Apps Script: it dropped
 * CANCELLED visits from the job group, which made a cancelled application
 * reappear as missing; its 15-day rule existed only as a sentence inside the AI
 * prompt, never as data; and a job was inferred by grouping visits on
 * client + length + request instead of being a row, so it split in two the
 * moment its length changed.)
 *
 * Kept free of Prisma so it can be unit-tested directly.
 */

export type RecurrenceUnit = 'DAY' | 'WEEK' | 'MONTH';

export type PendingClient = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  serviceTypes: string[];
  relationshipType: 'CONTRACT' | 'ON_DEMAND';
  status: 'ACTIVE' | 'INACTIVE';
  /** Null inherits the business default. */
  recurrenceUnit: RecurrenceUnit | null;
  recurrenceInterval: number | null;
  minDaysBetweenApplications: number | null;
};

export type PendingVisit = {
  id: string;
  clientId: string;
  requestId: string | null;
  /** Set when this visit is one application of a multi-visit job. */
  jobId: string | null;
  /** null means "created but never scheduled" — the row is itself a pendiente. */
  scheduledAt: Date | null;
  visitType: 'CONTRACT' | 'SPECIAL';
  status: 'PENDING_CONFIRM' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'SKIPPED';
  serviceType: string | null;
  applicationNumber: number | null;
};

/**
 * A job that takes several visits. It is a row of its own, so it can be short
 * or long, can change length mid-way, and can exist before its first visit is
 * scheduled — none of which the old "group the visits and hope" approach could
 * express.
 */
export type PendingJob = {
  id: string;
  clientId: string;
  requestId: string | null;
  serviceType: string | null;
  totalApplications: number;
  /** Closed early: the remaining applications stop being owed. */
  closed: boolean;
};

/**
 * Where the next due date is counted from.
 *
 * CALENDAR — the commitment belongs to a period: "el abono de agosto". Once the
 * period has a visit it is settled, and the next one is owed at the start of the
 * following period. A multi-visit job is expected to fit inside the period.
 * LAST_VISIT — the clock runs from the last visit: go on the 20th and the next
 * one is due on the 20th. Fits businesses that think in elapsed time.
 */
export type RecurrenceAnchor = 'CALENDAR' | 'LAST_VISIT';

export type TenantDefaults = {
  recurrenceUnit: RecurrenceUnit;
  recurrenceInterval: number;
  recurrenceAnchor: RecurrenceAnchor;
  minDaysBetweenApplications: number;
  /**
   * Whether a one-off visit settles the period. False for a fumigator (an
   * emergency call does not replace the abono); true where any visit counts.
   */
  oneOffSettlesPeriod: boolean;
};

export type PendingItem =
  | {
      kind: 'RECURRING_SERVICE';
      client: PendingClient;
      /** When this service became (or becomes) due. */
      dueAt: Date;
      /** Days past due at `today`; 0 when it is due but not yet late. */
      daysOverdue: number;
      lastVisitAt: Date | null;
      cadence: { unit: RecurrenceUnit; interval: number };
    }
  | {
      kind: 'MISSING_APPLICATION';
      client: PendingClient;
      jobId: string;
      requestId: string | null;
      serviceType: string | null;
      applicationNumber: number;
      totalApplications: number;
      previousApplicationAt: Date | null;
      /**
       * Earliest date this application should be done on: the previous
       * application plus the minimum gap. Null when there is no minimum or no
       * previous application yet. Advisory only.
       */
      earliestAt: Date | null;
      /** True when `earliestAt` is still in the future at `today`. */
      notYetDue: boolean;
    }
  | {
      kind: 'UNSCHEDULED_VISIT';
      client: PendingClient;
      visitId: string;
      serviceType: string | null;
    };

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/**
 * Advances a date by one cadence step. MONTH walks the calendar rather than
 * adding 30 days, so a monthly service keeps landing on the same day number.
 */
export const addCadence = (date: Date, unit: RecurrenceUnit, interval: number): Date => {
  if (unit === 'DAY') return addDays(date, interval);
  if (unit === 'WEEK') return addDays(date, interval * 7);

  const target = new Date(date.getFullYear(), date.getMonth() + interval, date.getDate());
  // Jan 31 + 1 month would roll into March; clamp to the end of the month.
  if (target.getDate() !== date.getDate()) target.setDate(0);
  return target;
};

/** Start of the calendar period (month, week or day) containing `date`. */
export const startOfPeriod = (date: Date, unit: RecurrenceUnit): Date => {
  if (unit === 'MONTH') return new Date(date.getFullYear(), date.getMonth(), 1);
  if (unit === 'WEEK') {
    // Weeks start on Monday.
    const day = (date.getDay() + 6) % 7;
    return addDays(startOfDay(date), -day);
  }
  return startOfDay(date);
};

/** Whole days from `from` to `to`, negative when `to` is earlier. */
export const daysBetween = (from: Date, to: Date): number =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);

/**
 * A visit "covers" its slot once it has a date. Status is deliberately ignored:
 * confirmed, completed, cancelled and skipped all mean the scheduling decision
 * was already made. Deleted visits never reach this function.
 */
const isScheduled = (visit: PendingVisit): boolean => visit.scheduledAt !== null;

const cadenceFor = (client: PendingClient, defaults: TenantDefaults) => ({
  unit: client.recurrenceUnit ?? defaults.recurrenceUnit,
  interval: client.recurrenceInterval ?? defaults.recurrenceInterval,
});

const minGapFor = (client: PendingClient, defaults: TenantDefaults) =>
  client.minDaysBetweenApplications ?? defaults.minDaysBetweenApplications;

export type BuildPendingInput = {
  /** Month being planned; anything due by its end is listed. */
  targetMonth: Date;
  /** "Now", for overdue and not-yet-due calculations. */
  today: Date;
  defaults: TenantDefaults;
  clients: PendingClient[];
  /** Every non-deleted visit relevant to the window and to open jobs. */
  visits: PendingVisit[];
  /** Every non-deleted multi-visit job. */
  jobs: PendingJob[];
};

export function buildPendingItems({
  targetMonth,
  today,
  defaults,
  clients,
  visits,
  jobs,
}: BuildPendingInput): PendingItem[] {
  const items: PendingItem[] = [];
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);

  // ── 1. Recurring agreements ──────────────────────────────────────────────
  for (const client of clients) {
    if (client.relationshipType !== 'CONTRACT' || client.status !== 'ACTIVE') continue;

    // By default only recurring visits fulfil the agreement: a one-off job for
    // the same client must not silence it. Some rubros disagree — if you went
    // and did the work, the period is covered whatever the reason.
    const settling = visits.filter(
      (visit) =>
        visit.clientId === client.id &&
        isScheduled(visit) &&
        (visit.visitType === 'CONTRACT' || defaults.oneOffSettlesPeriod)
    );

    const scheduledDates = settling
      .map((visit) => visit.scheduledAt as Date)
      .sort((a, b) => a.getTime() - b.getTime());

    // A settled-without-visiting period closes the commitment but is not a
    // visit, so it must not be reported as "última visita".
    const visitedDates = settling
      .filter((visit) => visit.status !== 'SKIPPED')
      .map((visit) => visit.scheduledAt as Date)
      .sort((a, b) => a.getTime() - b.getTime());

    const cadence = cadenceFor(client, defaults);
    const lastVisitAt = scheduledDates[scheduledDates.length - 1] ?? null;


    // Never visited: due now rather than back-dated, since there is no evidence
    // the agreement was running before the business started tracking it.
    let dueAt: Date;
    if (!lastVisitAt) {
      dueAt = startOfDay(today);
    } else if (defaults.recurrenceAnchor === 'CALENDAR') {
      // The period after the one the last visit belongs to.
      dueAt = addCadence(
        startOfPeriod(lastVisitAt, cadence.unit),
        cadence.unit,
        cadence.interval
      );
    } else {
      dueAt = addCadence(lastVisitAt, cadence.unit, cadence.interval);
    }

    // Anything that comes due by the end of the month being planned is listed.
    if (dueAt > monthEnd) continue;

    // Already settled: a visit on or after the due date covers it.
    if (scheduledDates.some((date) => date >= dueAt)) continue;

    items.push({
      kind: 'RECURRING_SERVICE',
      client,
      dueAt,
      daysOverdue: Math.max(0, daysBetween(dueAt, today)),
      lastVisitAt: visitedDates[visitedDates.length - 1] ?? null,
      cadence,
    });
  }

  // ── 2. Multi-visit jobs: the next missing application ────────────────────
  // Each job is a row, so its visits are simply the ones pointing at it. The
  // job is the authority on how many applications there are, which is what
  // makes changing that number mid-way safe.
  const visitsByJob = new Map<string, PendingVisit[]>();
  for (const visit of visits) {
    if (!visit.jobId) continue;
    const group = visitsByJob.get(visit.jobId);
    if (group) group.push(visit);
    else visitsByJob.set(visit.jobId, [visit]);
  }

  for (const job of jobs) {
    if (job.closed) continue;

    const client = clientsById.get(job.clientId);
    if (!client || client.status === 'INACTIVE') continue;

    const group = visitsByJob.get(job.id) ?? [];
    const scheduledByApp = new Map<number, Date>();
    for (const visit of group) {
      if (!isScheduled(visit) || !visit.applicationNumber) continue;
      scheduledByApp.set(visit.applicationNumber, visit.scheduledAt as Date);
    }

    for (let appNumber = 1; appNumber <= job.totalApplications; appNumber++) {
      if (scheduledByApp.has(appNumber)) continue;

      const previousApplicationAt = scheduledByApp.get(appNumber - 1) ?? null;
      const minGap = minGapFor(client, defaults);
      const earliestAt =
        previousApplicationAt && minGap > 0
          ? addDays(previousApplicationAt, minGap)
          : null;

      items.push({
        kind: 'MISSING_APPLICATION',
        client,
        jobId: job.id,
        requestId: job.requestId,
        // The job names the work; fall back to whatever its visits say when it
        // was left blank.
        serviceType: job.serviceType ?? group[0]?.serviceType ?? null,
        applicationNumber: appNumber,
        totalApplications: job.totalApplications,
        previousApplicationAt,
        earliestAt,
        notYetDue: earliestAt !== null && daysBetween(today, earliestAt) > 0,
      });

      // Only ever surface the next one in sequence.
      break;
    }
  }

  // ── 3. Visits created without a slot ─────────────────────────────────────
  for (const visit of visits) {
    if (visit.scheduledAt !== null) continue;
    // Applications of a job are already covered by section 2, where they read
    // as "Aplicación N de M" instead of a bare unscheduled visit.
    if (visit.jobId) continue;
    if (visit.status === 'CANCELLED') continue;

    const client = clientsById.get(visit.clientId);
    if (!client) continue;

    items.push({
      kind: 'UNSCHEDULED_VISIT',
      client,
      visitId: visit.id,
      serviceType: visit.serviceType,
    });
  }

  return items;
}

/**
 * Advisory check for the visit form: is this date too close to the previous
 * application? Returns null when it is fine. Never blocks a save.
 */
export function checkApplicationGap(
  previousApplicationAt: Date | null,
  proposedAt: Date,
  minDays: number
): { earliestAt: Date; daysShort: number } | null {
  if (!previousApplicationAt || minDays <= 0) return null;

  const earliestAt = addDays(previousApplicationAt, minDays);
  const daysShort = daysBetween(proposedAt, earliestAt);
  return daysShort > 0 ? { earliestAt, daysShort } : null;
}
