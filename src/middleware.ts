import NextAuth from 'next-auth';
import { authConfig } from './server/auth.config';

// Edge-safe Auth.js instance: authConfig carries no Prisma import.
const { auth } = NextAuth(authConfig);

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/verify-email'];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  if (!isLoggedIn && !isPublicRoute) {
    const loginUrl = new URL('/login', req.nextUrl);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return Response.redirect(loginUrl);
  }

  if (isLoggedIn && isPublicRoute) {
    return Response.redirect(new URL('/', req.nextUrl));
  }
});

export const config = {
  // Everything except static assets, images and the API routes (tRPC does its
  // own auth checks through the protected/tenant procedures).
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|images).*)'],
};
