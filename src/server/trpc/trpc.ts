import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { Context } from './context';
import { hasRole } from '../lib/permissions';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const enforceUserIsAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);

const enforceUserHasTenant = t.middleware(({ ctx, next }) => {
  if (!ctx.session || !ctx.session.user || !ctx.tenantId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' });
  }
  return next({
    ctx: {
      session: { ...ctx.session, user: ctx.session.user },
      tenantId: ctx.tenantId,
    },
  });
});

export const tenantProcedure = t.procedure.use(enforceUserHasTenant);

const enforceOwnerOrSuperAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  if (!hasRole(ctx.session, 'OWNER', 'SUPER_ADMIN')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Requires OWNER or SUPER_ADMIN role' });
  }
  return next({
    ctx: {
      session: { ...ctx.session, user: ctx.session.user },
      tenantId: ctx.tenantId!,
    },
  });
});

export const ownerProcedure = t.procedure.use(enforceOwnerOrSuperAdmin);
