import { router, permissionProcedure } from '../trpc';
import { z } from 'zod';
import { tenantWhere } from '../../lib/tenant-context';
import { TRPCError } from '@trpc/server';
import { recordAudit } from '../../services/audit.service';
import type { Prisma } from '@prisma/client';

const RelationshipTypeEnum = z.enum(['CONTRACT', 'ON_DEMAND']);
const StatusEnum = z.enum(['ACTIVE', 'INACTIVE']);

const clientFields = {
  name: z.string().min(1),
  email: z.string().email().nullish().or(z.literal('')),
  phone: z.string().nullish(),
  address: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  relationshipType: RelationshipTypeEnum,
  status: StatusEnum,
  serviceTypes: z.array(z.string()),
  preferredDays: z.array(z.string()),
  preferredSlots: z.array(z.string()),
  // Null inherits the business default from TenantSettings.
  recurrenceUnit: z.enum(['DAY', 'WEEK', 'MONTH']).nullish(),
  recurrenceInterval: z.number().int().min(1).max(60).nullish(),
  minDaysBetweenApplications: z.number().int().min(0).max(365).nullish(),
  notes: z.string().nullish(),
};

/** Empty strings from form inputs must not be stored as "" in optional columns. */
const emptyToNull = <T extends string | null | undefined>(value: T) =>
  value === '' ? null : (value ?? null);

export const clientsRouter = router({
  list: permissionProcedure('clients', 'read')
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
        search: z.string().optional(),
        status: StatusEnum.optional(),
        relationshipType: RelationshipTypeEnum.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, limit, search, status, relationshipType } = input;
      const skip = (page - 1) * limit;

      const whereClause: Prisma.ClientWhereInput = {
        ...tenantWhere(ctx.tenantId),
        ...(status && { status }),
        ...(relationshipType && { relationshipType }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
            { address: { contains: search, mode: 'insensitive' as const } },
          ],
        }),
      };

      const [items, total] = await Promise.all([
        ctx.db.client.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy: { name: 'asc' },
          include: { _count: { select: { visits: true } } },
        }),
        ctx.db.client.count({ where: whereClause }),
      ]);

      return { items, total, page, totalPages: Math.ceil(total / limit) };
    }),

  /** Lightweight list for select inputs (visit form, request form). */
  options: permissionProcedure('clients', 'read').query(async ({ ctx }) => {
    return ctx.db.client.findMany({
      where: { ...tenantWhere(ctx.tenantId), status: 'ACTIVE' },
      select: { id: true, name: true, address: true, serviceTypes: true },
      orderBy: { name: 'asc' },
    });
  }),

  getById: permissionProcedure('clients', 'read')
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const client = await ctx.db.client.findFirst({
        where: { id: input.id, ...tenantWhere(ctx.tenantId) },
        include: {
          _count: { select: { visits: true, requests: true } },
          visits: {
            where: { deletedAt: null },
            orderBy: { scheduledAt: 'desc' },
            take: 10,
            select: {
              id: true,
              scheduledAt: true,
              status: true,
              paymentStatus: true,
              price: true,
              serviceType: true,
            },
          },
        },
      });
      if (!client) throw new TRPCError({ code: 'NOT_FOUND' });
      return client;
    }),

  /** Everything the client detail page shows: profile, history and totals. */
  detail: permissionProcedure('clients', 'read')
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const client = await ctx.db.client.findFirst({
        where: { id: input.id, ...tenantWhere(ctx.tenantId) },
      });
      if (!client) throw new TRPCError({ code: 'NOT_FOUND' });

      const [visits, requests, billed, visitCounts] = await Promise.all([
        ctx.db.visit.findMany({
          where: { clientId: client.id, ...tenantWhere(ctx.tenantId) },
          orderBy: { scheduledAt: 'desc' },
          take: 50,
          select: {
            id: true,
            scheduledAt: true,
            status: true,
            paymentStatus: true,
            price: true,
            serviceType: true,
            applicationNumber: true,
            job: { select: { id: true, totalApplications: true, closedAt: true } },
            assignedUser: { select: { id: true, name: true } },
          },
        }),
        ctx.db.serviceRequest.findMany({
          where: { clientId: client.id, tenantId: ctx.tenantId },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        ctx.db.transaction.aggregate({
          where: { clientId: client.id, type: 'INCOME', ...tenantWhere(ctx.tenantId) },
          _sum: { amount: true },
        }),
        ctx.db.visit.groupBy({
          by: ['status'],
          where: { clientId: client.id, ...tenantWhere(ctx.tenantId) },
          _count: { _all: true },
        }),
      ]);

      const countFor = (status: string) =>
        visitCounts.find((row) => row.status === status)?._count._all ?? 0;

      return {
        client,
        visits,
        requests,
        stats: {
          totalBilled: Number(billed._sum.amount ?? 0),
          totalVisits: visitCounts.reduce((sum, row) => sum + row._count._all, 0),
          completedVisits: countFor('COMPLETED'),
          upcomingVisits: countFor('PENDING_CONFIRM') + countFor('CONFIRMED'),
        },
      };
    }),

  create: permissionProcedure('clients', 'write')
    .input(
      z.object({
        ...clientFields,
        relationshipType: RelationshipTypeEnum.default('ON_DEMAND'),
        status: StatusEnum.default('ACTIVE'),
        serviceTypes: z.array(z.string()).default([]),
        preferredDays: z.array(z.string()).default([]),
        preferredSlots: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.client.create({
        data: {
          ...input,
          email: emptyToNull(input.email),
          phone: emptyToNull(input.phone),
          address: emptyToNull(input.address),
          notes: emptyToNull(input.notes),
          tenantId: ctx.tenantId,
        },
      });
    }),

  update: permissionProcedure('clients', 'write')
    .input(
      z.object({
        id: z.string().uuid(),
        name: clientFields.name.optional(),
        email: clientFields.email,
        phone: clientFields.phone,
        address: clientFields.address,
        lat: clientFields.lat,
        lng: clientFields.lng,
        relationshipType: RelationshipTypeEnum.optional(),
        status: StatusEnum.optional(),
        serviceTypes: z.array(z.string()).optional(),
        preferredDays: z.array(z.string()).optional(),
        preferredSlots: z.array(z.string()).optional(),
        recurrenceUnit: clientFields.recurrenceUnit,
        recurrenceInterval: clientFields.recurrenceInterval,
        minDaysBetweenApplications: clientFields.minDaysBetweenApplications,
        notes: clientFields.notes,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.client.update({
        where: { id, tenantId: ctx.tenantId },
        data: {
          ...data,
          ...(data.email !== undefined && { email: emptyToNull(data.email) }),
          ...(data.phone !== undefined && { phone: emptyToNull(data.phone) }),
          ...(data.address !== undefined && { address: emptyToNull(data.address) }),
          ...(data.notes !== undefined && { notes: emptyToNull(data.notes) }),
        },
      });
    }),

  delete: permissionProcedure('clients', 'write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db.client.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { deletedAt: new Date() },
      });

      await recordAudit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: 'DELETE',
        entityType: 'client',
        entityId: input.id,
        changes: { name: deleted.name },
      });

      return deleted;
    }),
});
