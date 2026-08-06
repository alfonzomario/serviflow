import { NextResponse } from 'next/server';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { decryptIfPresent, encryptIfPresent } from '@/server/lib/encryption';
import { cookies } from 'next/headers';

export async function GET(req: Request) {
  const session = await auth();
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const error = searchParams.get('error');

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
  const protocol = req.headers.get('x-forwarded-proto') || (req.url.startsWith('https') ? 'https' : 'http');
  const origin = `${protocol}://${host}`;
  const settingsUrl = (params: string) => new URL(`/settings?tab=integraciones&${params}`, origin);

  const cookieStore = await cookies();
  const savedState = cookieStore.get('google_oauth_state')?.value;

  if (error || !code || !stateParam || !savedState || stateParam !== savedState) {
    console.error('Google OAuth CSRF validation failed or error received:', { error, stateParam, savedState });
    return NextResponse.redirect(settingsUrl('error=google_csrf_invalid'));
  }

  const [stateTenantId] = stateParam.split(':');
  if (!session?.user?.tenantId || session.user.tenantId !== stateTenantId) {
    console.error('Google OAuth session tenant mismatch');
    return NextResponse.redirect(settingsUrl('error=google_auth_unauthorized'));
  }

  const tenantId = session.user.tenantId;

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

    const encryptedAccessToken = encryptIfPresent(tokens.access_token);
    const encryptedRefreshToken = encryptIfPresent(tokens.refresh_token);

    // Save tokens securely in TenantSettings
    await db.tenantSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        googleAccessToken: encryptedAccessToken,
        ...(encryptedRefreshToken && { googleRefreshToken: encryptedRefreshToken }),
        googleTokenExpiresAt: expiresAt,
        googleCalendarEnabled: true,
      },
      update: {
        googleAccessToken: encryptedAccessToken,
        ...(encryptedRefreshToken && { googleRefreshToken: encryptedRefreshToken }),
        googleTokenExpiresAt: expiresAt,
        googleCalendarEnabled: true,
      },
    });

    const res = NextResponse.redirect(settingsUrl('google_connected=true'));
    res.cookies.delete('google_oauth_state');
    return res;
  } catch (err) {
    console.error('Exception during Google OAuth callback:', err);
    return NextResponse.redirect(settingsUrl('error=google_oauth_exception'));
  }
}
