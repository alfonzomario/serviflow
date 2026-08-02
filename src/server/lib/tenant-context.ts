/**
 * Tenant scoping helpers.
 *
 * Every tenant-scoped query must spread one of these into its `where` clause.
 * A global Prisma extension was tried first but `$allModels` cannot express
 * "only the models that have a deleted_at column" — models like
 * ServiceRequest, User and TenantSettings are hard-deleted — so scoping stays
 * explicit at the call site.
 */

/**
 * Base where clause for models that support soft deletes:
 * Client, Visit, Job, Transaction, Note.
 */
export const tenantWhere = (tenantId: string) => ({
  tenantId,
  deletedAt: null,
});

/**
 * Base where clause for models without a `deletedAt` column:
 * ServiceRequest, User, TenantSettings, AuditLog, ImportHistory.
 */
export const tenantOnly = (tenantId: string) => ({
  tenantId,
});
