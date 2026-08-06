import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { decryptIfPresent } from '@/server/lib/encryption';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const tenantId = searchParams.get('state');
  const error = searchParams.get('error');

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
  const protocol = req.headers.get('x-forwarded-proto') || (req.url.startsWith('https') ? 'https' : 'http');
  const origin = `${protocol}://${host}`;
  const settingsUrl = (params: string) => new URL(`/settings?tab=integraciones&${params}`, origin);

  if (error || !code || !tenantId) {
    console.error('Google OAuth callback error or missing parameters:', error);
    return NextResponse.redirect(settingsUrl('error=google_auth_failed'));
  }

  const settings = await db.tenantSettings.findUnique({
    where: { tenantId },
  });

  const clientId = (settings?.googleClientId || process.env.GOOGLE_CLIENT_ID || '').trim();
  let clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();

  if (!clientSecret && settings?.googleClientSecretEncrypted) {
    clientSecret = (decryptIfPresent(settings.googleClientSecretEncrypted) || '').trim();
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
      return NextResponse.redirect(settingsUrl('error=google_token_exchange_failed'));
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

    // The initial full sync is triggered once, from Settings, after this
    // redirect lands — doing it here too would race the same tenant's
    // calendar wipe/rebuild from two places and produce duplicates.
    return NextResponse.redirect(settingsUrl('google_connected=true'));
  } catch (err) {
    console.error('Exception during Google OAuth callback:', err);
    return NextResponse.redirect(settingsUrl('error=google_oauth_exception'));
  }
}
