import { PrismaClient } from '@prisma/client';

/**
 * Returns a base where clause for tenant-scoped queries
 * that also excludes soft-deleted records.
 */
export const tenantWhere = (tenantId: string) => ({
  tenantId,
  deletedAt: null,
});

/**
 * Extension for Prisma to automatically scope queries to a specific tenant.
 * Note: Prisma Extensions are the modern way to handle this.
 */
export const withTenantScope = (prisma: PrismaClient, tenantId: string) => {
  return prisma.$extends({
    query: {
      $allModels: {
        async findMany({ args, query }) {
          args.where = { ...args.where, tenantId, deletedAt: null };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, tenantId, deletedAt: null };
          return query(args);
        },
        async findUnique({ args, query }) {
          // Caution: findUnique often relies on unique constraints.
          // Soft-deletes + tenant scoping usually requires findFirst instead for unique constraints
          // unless the unique constraint includes tenantId and deletedAt.
          return query(args);
        },
        async count({ args, query }) {
          args.where = { ...args.where, tenantId, deletedAt: null };
          return query(args);
        },
        async update({ args, query }) {
          args.where = { ...args.where, tenantId, deletedAt: null };
          return query(args);
        },
        async updateMany({ args, query }) {
          args.where = { ...args.where, tenantId, deletedAt: null };
          return query(args);
        },
        async delete({ args, query }) {
          // Soft delete conversion
          const { where, ...rest } = args;
          return (prisma as any)[this.$name].update({
            where: { ...where, tenantId },
            data: { deletedAt: new Date() },
            ...rest,
          });
        },
        async deleteMany({ args, query }) {
          args.where = { ...args.where, tenantId };
          return (prisma as any)[this.$name].updateMany({
            where: args.where,
            data: { deletedAt: new Date() },
          });
        },
      },
    },
  });
};
