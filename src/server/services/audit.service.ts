import { db } from '../db';
import type { Prisma } from '@prisma/client';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'STATUS_CHANGE'
  | 'SCHEDULE'
  | 'IMPORT'
  | 'ARCHIVE'
  | 'LOGIN';

type AuditEntry = {
  tenantId: string;
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  changes?: Prisma.InputJsonValue;
};

/**
 * Appends to `audit_logs`.
 *
 * Auditing must never break the operation it records, so failures are logged
 * and swallowed rather than propagated to the caller.
 */
export const recordAudit = async (entry: AuditEntry): Promise<void> => {
  try {
    await db.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        changes: entry.changes ?? {},
      },
    });
  } catch (error) {
    console.error('[audit] failed to record entry', entry.action, entry.entityType, error);
  }
};

/** Shallow before/after diff, so the log stores only what actually moved. */
export const diffChanges = <T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>
): Prisma.InputJsonValue => {
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  for (const [key, newValue] of Object.entries(after)) {
    if (newValue === undefined) continue;
    const oldValue = before[key];
    if (String(oldValue) === String(newValue)) continue;
    changes[key] = { old: oldValue ?? null, new: newValue ?? null };
  }

  return changes as Prisma.InputJsonValue;
};
