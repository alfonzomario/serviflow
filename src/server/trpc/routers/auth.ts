import { router, publicProcedure, protectedProcedure } from '../trpc';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { TRPCError } from '@trpc/server';

/** "Fumigaciones Lozanor" -> "fumigaciones-lozanor" */
const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'negocio';

export const authRouter = router({
  register: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
        companyName: z.string().min(2),
        name: z.string().min(2),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();

      const existing = await ctx.db.user.findFirst({ where: { email } });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Ya existe una cuenta con ese email',
        });
      }

      const passwordHash = await bcrypt.hash(input.password, 10);

      // Slugs are globally unique; append a counter when the base is taken.
      const baseSlug = slugify(input.companyName);
      let slug = baseSlug;
      for (let i = 2; await ctx.db.tenant.findUnique({ where: { slug } }); i++) {
        slug = `${baseSlug}-${i}`;
      }

      const tenant = await ctx.db.tenant.create({
        data: {
          name: input.companyName,
          slug,
          users: {
            create: {
              email,
              name: input.name,
              passwordHash,
              role: 'OWNER',
            },
          },
          settings: {
            create: { adminEmail: email },
          },
        },
      });

      return { success: true, tenantId: tenant.id };
    }),

  getSession: publicProcedure.query(({ ctx }) => {
    return ctx.session;
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        permissions: true,
        tenant: { select: { id: true, name: true, slug: true, currency: true, timezone: true } },
      },
    });
  }),

  updatePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { passwordHash: true },
      });
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });

      const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!isValid) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'La contraseña actual es incorrecta' });
      }

      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: {
          passwordHash: await bcrypt.hash(input.newPassword, 10),
          // Invalidate other sessions after a password change.
          sessionVersion: { increment: 1 },
        },
      });

      return { success: true };
    }),

  revokeAllSessions: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.user.update({
      where: { id: ctx.session.user.id },
      data: { sessionVersion: { increment: 1 } },
    });
    return { success: true };
  }),
});
