import { router, publicProcedure, protectedProcedure } from '../trpc';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

export const authRouter = router({
  register: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(8),
      companyName: z.string().min(2),
      name: z.string().min(2)
    }))
    .mutation(async ({ ctx, input }) => {
      const hashedPassword = await bcrypt.hash(input.password, 10);
      
      const tenant = await ctx.db.tenant.create({
        data: {
          name: input.companyName,
          users: {
            create: {
              email: input.email,
              name: input.name,
              password: hashedPassword,
              role: 'OWNER',
            }
          }
        }
      });
      
      return { success: true, tenantId: tenant.id };
    }),
    
  getSession: publicProcedure.query(({ ctx }) => {
    return ctx.session;
  }),
  
  updatePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8)
    }))
    .mutation(async ({ ctx, input }) => {
      // Logic to update password
      return { success: true };
    }),
    
  revokeAllSessions: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.user.update({
      where: { id: ctx.session.user.id },
      data: { sessionVersion: { increment: 1 } }
    });
    return { success: true };
  })
});
