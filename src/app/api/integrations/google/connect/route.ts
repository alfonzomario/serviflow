import { NextResponse } from 'next/server';
import { auth } from '@/server/auth';

export async function GET(req: Request) {
  const session = await auth();

  if (!session?.user?.tenantId) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || '';

  if (!clientId) {
    // If no client ID configured yet, redirect back to agenda with instructions
    return NextResponse.redirect(
      new URL('/agenda?error=google_credentials_missing', req.url)
    );
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/integrations/google/callback`;

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
  googleAuthUrl.searchParams.set('access_type', 'offline'); // To get refresh_token
  googleAuthUrl.searchParams.set('prompt', 'consent'); // Force refresh_token on reconnect
  googleAuthUrl.searchParams.set('state', session.user.tenantId);

  return NextResponse.redirect(googleAuthUrl.toString());
}
