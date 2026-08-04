import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { decryptIfPresent } from '@/server/lib/encryption';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const tenantId = searchParams.get('state');
  const error = searchParams.get('error');

  const origin = new URL(req.url).origin;

  if (error || !code || !tenantId) {
    console.error('Google OAuth callback error or missing parameters:', error);
    return NextResponse.redirect(new URL('/agenda?error=google_auth_failed', origin));
  }

  const settings = await db.tenantSettings.findUnique({
    where: { tenantId },
  });

  const clientId = settings?.googleClientId || process.env.GOOGLE_CLIENT_ID || '';
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

  if (!clientSecret && settings?.googleClientSecretEncrypted) {
    clientSecret = decryptIfPresent(settings.googleClientSecretEncrypted) || '';
  }

  const redirectUri = `${origin}/api/integrations/google/callback`;

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      console.error('Failed to exchange code for tokens:', await tokenRes.text());
      return NextResponse.redirect(new URL('/agenda?error=google_token_exchange_failed', origin));
    }

    const tokens = await tokenRes.json();
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

    // Save tokens in TenantSettings
    await db.tenantSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token || null,
        googleTokenExpiresAt: expiresAt,
        googleCalendarEnabled: true,
      },
      update: {
        googleAccessToken: tokens.access_token,
        ...(tokens.refresh_token && { googleRefreshToken: tokens.refresh_token }),
        googleTokenExpiresAt: expiresAt,
        googleCalendarEnabled: true,
      },
    });

    return NextResponse.redirect(new URL('/agenda?google_connected=true', origin));
  } catch (err) {
    console.error('Exception during Google OAuth callback:', err);
    return NextResponse.redirect(new URL('/agenda?error=google_oauth_exception', origin));
  }
}
