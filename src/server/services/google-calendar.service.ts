import { db } from "../db";
import { decryptIfPresent } from "../lib/encryption";

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
  const clientId = settings.googleClientId || process.env.GOOGLE_CLIENT_ID || "";
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  if (!clientSecret && settings.googleClientSecretEncrypted) {
    clientSecret = decryptIfPresent(settings.googleClientSecretEncrypted) || "";
  }

  if (!clientId || !clientSecret) {
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

  const startTime = new Date(visit.scheduledAt);
  const durationMs = (visit.durationMinutes || 45) * 60 * 1000;
  const endTime = new Date(startTime.getTime() + durationMs);

  const title = visit.serviceType && visit.serviceType !== 'Servicio'
    ? `SF - ${visit.client.name} (${visit.serviceType})`
    : `SF - ${visit.client.name}`;

  const eventPayload = {
    summary: title,
    location: visit.client.address || '',
    description: `Cliente: ${visit.client.name}\nTeléfono: ${visit.client.phone || 'N/I'}\nDirección: ${visit.client.address || 'N/I'}\nNotas: ${visit.notes || 'Sin observaciones'}`,
    colorId: '9', // Official Google Calendar Electric Blue / Peacock color
    start: {
      dateTime: startTime.toISOString(),
    },
    end: {
      dateTime: endTime.toISOString(),
    },
  };

  try {
    let isUpdate = Boolean(visit.calendarEventId);
    let url = isUpdate
      ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${visit.calendarEventId}`
      : `https://www.googleapis.com/calendar/v3/calendars/primary/events`;
    let method = isUpdate ? 'PUT' : 'POST';

    let response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventPayload),
    });

    // If PUT failed (e.g. event ID was not found or was deleted in Google Calendar), fallback to POST
    if (isUpdate && !response.ok && (response.status === 404 || response.status === 400 || response.status === 410)) {
      console.warn(`Calendar event ${visit.calendarEventId} not found or rejected PUT, creating fresh event via POST...`);
      url = `https://www.googleapis.com/calendar/v3/calendars/primary/events`;
      method = 'POST';
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventPayload),
      });
    }

    // If rate limited by Google API (429 or 403), retry once after a short delay
    if (!response.ok && (response.status === 429 || response.status === 403)) {
      await new Promise((r) => setTimeout(r, 500));
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventPayload),
      });
    }

    if (!response.ok) {
      console.error(`Failed to ${method} visit to Google Calendar:`, await response.text());
    } else {
      const data = await response.json();
      if (data.id && data.id !== visit.calendarEventId) {
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
