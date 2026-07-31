import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

export const authConfig = {
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // Validation logic is implemented in the main auth.ts 
        // to avoid edge compatibility issues with Prisma
        return null;
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {},
} satisfies NextAuthConfig;
