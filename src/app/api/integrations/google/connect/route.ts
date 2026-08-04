import { NextResponse } from 'next/server';
import { auth } from '@/server/auth';
import { db } from '@/server/db';

export async function GET(req: Request) {
  const session = await auth();

  if (!session?.user?.tenantId) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const tenantSettings = await db.tenantSettings.findUnique({
    where: { tenantId: session.user.tenantId },
  });

  const clientId = (tenantSettings?.googleClientId || process.env.GOOGLE_CLIENT_ID || '').trim();

  if (!clientId) {
    return NextResponse.redirect(
      new URL('/settings?tab=integraciones&error=google_credentials_missing', req.url)
    );
  }

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
  const protocol = req.headers.get('x-forwarded-proto') || (req.url.startsWith('https') ? 'https' : 'http');
  const redirectUri = `${protocol}://${host}/api/integrations/google/callback`;

  const scope = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'openid',
    'email',
    'profile',
  ].join(' ');

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', clientId);
  googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', scope);
  googleAuthUrl.searchParams.set('access_type', 'offline');
  googleAuthUrl.searchParams.set('prompt', 'consent');
  googleAuthUrl.searchParams.set('state', session.user.tenantId);

  return NextResponse.redirect(googleAuthUrl.toString());
}
