import { db } from "../db";

/** Helper to get a valid Google Access Token, refreshing it if expired using the refresh token */
async function getValidAccessToken(tenantId: string): Promise<string | null> {
  const settings = await db.tenantSettings.findUnique({
    where: { tenantId },
  });

  if (!settings?.googleCalendarEnabled || !settings?.googleRefreshToken) {
    return null;
  }

  // If access token is missing or near expiration, refresh it
  const isExpired = !settings.googleAccessToken ||
    (settings.googleTokenExpiresAt && new Date(settings.googleTokenExpiresAt).getTime() - Date.now() < 300000);

  if (!isExpired && settings.googleAccessToken) {
    return settings.googleAccessToken;
  }

  // Refresh token call
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

  if (!clientId || !clientSecret) {
    // If no client credentials configured yet, fallback to saved access token
    return settings.googleAccessToken || null;
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: settings.googleRefreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      console.error("Failed to refresh Google token:", await res.text());
      return settings.googleAccessToken || null;
    }

    const data = await res.json();
    const newAccessToken = data.access_token;
    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

    await db.tenantSettings.update({
      where: { tenantId },
      data: {
        googleAccessToken: newAccessToken,
        googleTokenExpiresAt: expiresAt,
      },
    });

    return newAccessToken;
  } catch (err) {
    console.error("Error refreshing Google Access Token:", err);
    return settings.googleAccessToken || null;
  }
}

/** Syncs a visit to Google Calendar (creates new or updates existing event automatically) */
export async function syncVisitToGoogle(visitId: string, tenantId: string) {
  const visit = await db.visit.findFirst({
    where: { id: visitId, tenantId },
    include: { client: true, job: true },
  });

  if (!visit || !visit.scheduledAt) {
    return;
  }

  const accessToken = await getValidAccessToken(tenantId);
  if (!accessToken) {
    return;
  }

  const durationMs = (visit.durationMinutes || 45) * 60 * 1000;
  const startTime = new Date(visit.scheduledAt);
  const endTime = new Date(startTime.getTime() + durationMs);

  const eventPayload = {
    summary: `${visit.client.name} — ${visit.serviceType || 'Servicio'}`,
    location: visit.client.address || '',
    description: `Cliente: ${visit.client.name}\nTeléfono: ${visit.client.phone || 'N/I'}\nDirección: ${visit.client.address || 'N/I'}\nNotas: ${visit.notes || 'Sin observaciones'}`,
    start: {
      dateTime: startTime.toISOString(),
      timeZone: 'America/Argentina/Buenos_Aires',
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: 'America/Argentina/Buenos_Aires',
    },
  };

  try {
    const isUpdate = Boolean(visit.calendarEventId);
    const url = isUpdate
      ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${visit.calendarEventId}`
      : `https://www.googleapis.com/calendar/v3/calendars/primary/events`;

    const method = isUpdate ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventPayload),
    });

    if (!response.ok) {
      console.error(`Failed to ${method} visit to Google Calendar:`, await response.text());
    } else {
      const data = await response.json();
      if (data.id && !visit.calendarEventId) {
        await db.visit.update({
          where: { id: visit.id },
          data: { calendarEventId: data.id },
        });
      }
    }
  } catch (error) {
    console.error('Error syncing visit to Google Calendar:', error);
  }
}

/** Deletes an event from Google Calendar */
export async function deleteCalendarEvent(eventId: string, tenantId: string) {
  const accessToken = await getValidAccessToken(tenantId);
  if (!accessToken) {
    return;
  }

  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error('Failed to delete Google Calendar event:', await response.text());
    }
  } catch (error) {
    console.error('Error deleting Google Calendar event:', error);
  }
}
