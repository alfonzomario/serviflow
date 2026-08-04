import NextAuth from 'next-auth';
// Imported so the `declare module 'next-auth/jwt'` augmentation below resolves.
import type { JWT } from 'next-auth/jwt';
import { authConfig } from './auth.config';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { db } from './db'; 

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,


  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;

        const user = await db.user.findFirst({
          where: { email },
          include: { tenant: true },
        });

        if (!user || !user.passwordHash) {
          throw new Error('Tu cuenta aún no está dada de alta. Contactá con nuestro equipo de ventas para activar tu empresa.');
        }

        if (!user.isActive) {
          throw new Error('User is inactive');
        }

        if (user.tenant && user.tenant.status !== 'ACTIVE') {
          throw new Error('Tenant is suspended');
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);

        if (!isValid) {
          return null;
        }

        // Se registra recién acá, con la contraseña ya validada: un intento
        // fallido no es un ingreso. Es una columna, no una fila de auditoría —
        // un log por login crecería sin techo y no aporta nada que esto no diga.
        // Si falla, no se cae el login: es un dato informativo, no el permiso.
        await db.user
          .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
          .catch(() => undefined);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
          role: user.role,
          permissions: user.permissions,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.tenantId = (user as any).tenantId;
        token.role = (user as any).role;
        token.permissions = (user as any).permissions;
        token.sessionVersion = (user as any).sessionVersion;
      }
      if (trigger === 'update' && session) {
        token = { ...token, ...session };
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.tenantId = token.tenantId as string;
        session.user.role = token.role as string;
        session.user.permissions = token.permissions as any;
        session.user.sessionVersion = token.sessionVersion as number;
      }
      return session;
    },
  },
});

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      tenantId: string;
      role: string;
      permissions: any;
      sessionVersion: number;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    tenantId: string;
    role: string;
    permissions: any;
    sessionVersion: number;
  }
}
