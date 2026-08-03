import { router, tenantProcedure, ownerProcedure, permissionProcedure } from '../trpc';
import { z } from 'zod';
import { tenantOnly } from '../../lib/tenant-context';
import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import { emptyPermissionMatrix, MODULES, MODULE_ACTIONS } from '../../lib/permissions';
import { recordAudit } from '../../services/audit.service';
import type { Prisma } from '@prisma/client';

// SUPER_ADMIN is granted by the platform, never from inside a tenant.
const AssignableRoleEnum = z.enum(['OWNER', 'ADMIN', 'OPERATOR', 'CLIENT']);

/**
 * The granular matrix from docs/implementation_plan.md. Only ADMIN users read
 * it; the schema stores it in the `permissions` JSONB column.
 */
const PermissionMatrixSchema = z
  .object({
    agenda: z.object({ read: z.boolean(), write: z.boolean() }),
    clients: z.object({ read: z.boolean(), write: z.boolean() }),
    requests: z.object({ read: z.boolean(), write: z.boolean() }),
    finance: z.object({ read: z.boolean(), write: z.boolean() }),
    team: z.object({ read: z.boolean(), write: z.boolean() }),
    notes: z.object({ read: z.boolean(), write: z.boolean() }),
    ai: z.object({ read: z.boolean() }),
    settings: z.object({ read: z.boolean(), write: z.boolean() }),
    archive: z.object({ execute: z.boolean() }),
  })
  .partial();

/** Fills in every module so a partial payload never leaves stale grants behind. */
const normalisePermissions = (partial: z.infer<typeof PermissionMatrixSchema>) => {
  const matrix = emptyPermissionMatrix();
  for (const module of MODULES) {
    const incoming = partial[module];
    if (!incoming) continue;
    for (const action of MODULE_ACTIONS[module]) {
      const value = (incoming as Record<string, boolean | undefined>)[action];
      if (value !== undefined) {
        (matrix[module] as Record<string, boolean>)[action] = value;
      }
    }
  }
  return matrix;
};

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  avatarUrl: true,
  permissions: true,
  clientId: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export const usersRouter = router({
  /**
   * La ficha completa del equipo: emails, roles y la matriz de permisos de cada
   * uno. Va detrás de `team.read` y no de `tenantProcedure` — que el menú
   * esconda Equipo no protege nada, y esto devuelve justo lo que un operador no
   * tiene por qué ver, incluida la matriz que dice qué puede tocar cada rol.
   * Para asignar una visita está `assignable`, que devuelve solo nombres.
   */
  list: permissionProcedure('team', 'read').query(async ({ ctx }) => {
    return ctx.db.user.findMany({
      where: tenantOnly(ctx.tenantId),
      select: userSelect,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }),

  /**
   * Solo id, nombre y rol de quienes pueden recibir una visita. Cualquiera que
   * pueda escribir en la agenda lo necesita, así que queda en `tenantProcedure`
   * a propósito: no expone contacto, permisos ni estado.
   */
  assignable: tenantProcedure.query(async ({ ctx }) => {
    return ctx.db.user.findMany({
      where: {
        ...tenantOnly(ctx.tenantId),
        isActive: true,
        role: { in: ['OWNER', 'ADMIN', 'OPERATOR'] },
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
  }),

  create: ownerProcedure
    .input(
      z.object({
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(8),
        role: AssignableRoleEnum,
        permissions: PermissionMatrixSchema.default({}),
        clientId: z.string().uuid().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();

      const existing = await ctx.db.user.findUnique({
        where: { tenantId_email: { tenantId: ctx.tenantId, email } },
      });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Ya existe un usuario con ese email en este negocio',
        });
      }

      const created = await ctx.db.user.create({
        data: {
          tenantId: ctx.tenantId,
          name: input.name,
          email,
          passwordHash: await bcrypt.hash(input.password, 10),
          role: input.role,
          permissions: normalisePermissions(input.permissions),
          clientId: input.clientId ?? null,
        },
        select: userSelect,
      });

      // Never log the password or its hash — only that access was granted.
      await recordAudit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: 'CREATE',
        entityType: 'user',
        entityId: created.id,
        changes: { email, role: input.role },
      });

      return created;
    }),

  update: ownerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(2).optional(),
        role: AssignableRoleEnum.optional(),
        permissions: PermissionMatrixSchema.optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const target = await ctx.db.user.findFirst({
        where: { id, ...tenantOnly(ctx.tenantId) },
        select: { role: true, isActive: true },
      });
      if (!target) throw new TRPCError({ code: 'NOT_FOUND' });

      // A tenant must always keep at least one active OWNER.
      if (target.role === 'OWNER' && (data.role !== undefined || data.isActive === false)) {
        const otherOwners = await ctx.db.user.count({
          where: { ...tenantOnly(ctx.tenantId), role: 'OWNER', isActive: true, id: { not: id } },
        });
        if (otherOwners === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'El negocio debe conservar al menos un dueño activo',
          });
        }
      }

      const updated = await ctx.db.user.update({
        where: { id, tenantId: ctx.tenantId },
        data: {
          ...data,
          ...(data.permissions !== undefined && {
            permissions: normalisePermissions(data.permissions),
          }),
          // Role and permission changes must invalidate existing sessions.
          ...((data.role !== undefined ||
            data.permissions !== undefined ||
            data.isActive === false) && { sessionVersion: { increment: 1 } }),
        },
        select: userSelect,
      });

      // Who can do what is the most sensitive thing in the app, so a role or
      // permission change is always logged. A rename is not worth an entry.
      // Built mutably, then cast at the call site — same shape as `diffChanges`.
      const changes: Record<string, unknown> = {};
      if (data.role !== undefined && data.role !== target.role) {
        changes.role = { old: target.role, new: data.role };
      }
      if (data.isActive !== undefined && data.isActive !== target.isActive) {
        changes.isActive = { old: target.isActive, new: data.isActive };
      }
      if (data.permissions !== undefined) changes.permissions = 'modificados';

      if (Object.keys(changes).length > 0) {
        await recordAudit({
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
          action: 'UPDATE',
          entityType: 'user',
          entityId: id,
          changes: changes as Prisma.InputJsonValue,
        });
      }

      return updated;
    }),

  resetPassword: ownerProcedure
    .input(z.object({ id: z.string().uuid(), newPassword: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.db.user.findFirst({
        where: { id: input.id, ...tenantOnly(ctx.tenantId) },
        select: { id: true },
      });
      if (!target) throw new TRPCError({ code: 'NOT_FOUND' });

      await ctx.db.user.update({
        where: { id: input.id },
        data: {
          passwordHash: await bcrypt.hash(input.newPassword, 10),
          sessionVersion: { increment: 1 },
        },
      });

      // The fact of the reset, never the password itself.
      await recordAudit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: 'UPDATE',
        entityType: 'user',
        entityId: input.id,
        changes: { passwordReset: true },
      });

      return { success: true };
    }),

  /** Users are deactivated, never deleted, so their audit trail survives. */
  deactivate: ownerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.session.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No podés desactivar tu propio usuario',
        });
      }

      const deactivated = await ctx.db.user.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { isActive: false, sessionVersion: { increment: 1 } },
        select: userSelect,
      });

      await recordAudit({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: 'UPDATE',
        entityType: 'user',
        entityId: input.id,
        changes: { isActive: { old: true, new: false } },
      });

      return deactivated;
    }),
});
