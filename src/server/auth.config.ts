import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

// Ensure NEXTAUTH_URL and AUTH_URL always have protocol prefix (https://)
if (process.env.NEXTAUTH_URL && !process.env.NEXTAUTH_URL.startsWith('http')) {
  process.env.NEXTAUTH_URL = `https://${process.env.NEXTAUTH_URL}`;
}
if (process.env.AUTH_URL && !process.env.AUTH_URL.startsWith('http')) {
  process.env.AUTH_URL = `https://${process.env.AUTH_URL}`;
}

export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'serviflow-default-secret-key-prod-2026',
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
