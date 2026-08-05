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

/** Finds or creates the dedicated 'ServiFlow' sub-calendar in the user's Google account */
export async function getOrCreateServiFlowCalendar(accessToken: string, tenantId: string): Promise<string> {
  const settings = await db.tenantSettings.findUnique({ where: { tenantId } });
  if (settings?.googleCalendarId) {
    return settings.googleCalendarId;
  }

  try {
    // 1. Search existing calendars
    const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (listRes.ok) {
      const data = await listRes.json();
      const existing = (data.items || []).find((c: any) => c.summary === "ServiFlow");
      if (existing?.id) {
        await db.tenantSettings.update({
          where: { tenantId },
          data: { googleCalendarId: existing.id },
        });
        return existing.id;
      }
    }

    // 2. Create new 'ServiFlow' sub-calendar if not found
    const createRes = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ summary: "ServiFlow", timeZone: "America/Argentina/Buenos_Aires" }),
    });

    if (createRes.ok) {
      const newCal = await createRes.json();
      if (newCal.id) {
        await db.tenantSettings.update({
          where: { tenantId },
          data: { googleCalendarId: newCal.id },
        });
        return newCal.id;
      }
    }
  } catch (err) {
    console.error("Error getting/creating ServiFlow sub-calendar:", err);
  }

  return "primary";
}

/** Syncs a visit to the dedicated ServiFlow Google Calendar */
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

  const calendarId = await getOrCreateServiFlowCalendar(accessToken, tenantId);

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
    colorId: '9', // Electric Blue / Peacock color
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
      ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${visit.calendarEventId}`
      : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    let method = isUpdate ? 'PUT' : 'POST';

    let response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventPayload),
    });

    // If PUT failed, fallback to POST
    if (isUpdate && !response.ok && (response.status === 404 || response.status === 400 || response.status === 410)) {
      url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
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

/** Deletes an event from the dedicated ServiFlow Google Calendar */
export async function deleteCalendarEvent(eventId: string, tenantId: string) {
  const accessToken = await getValidAccessToken(tenantId);
  if (!accessToken) {
    return;
  }

  const calendarId = await getOrCreateServiFlowCalendar(accessToken, tenantId);

  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
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

/** Clears all events inside the dedicated ServiFlow calendar and re-syncs all visits cleanly with ZERO duplicates */
export async function cleanAndResyncAllServiFlowEvents(tenantId: string) {
  const accessToken = await getValidAccessToken(tenantId);
  if (!accessToken) return { count: 0 };

  const calendarId = await getOrCreateServiFlowCalendar(accessToken, tenantId);

  // 1. Delete ALL existing events in the ServiFlow sub-calendar to guarantee 0 duplicates
  try {
    const listRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?maxResults=250`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (listRes.ok) {
      const data = await listRes.json();
      const items = data.items || [];
      for (const item of items) {
        if (item.id) {
          await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${item.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          }).catch(console.error);
          await new Promise((r) => setTimeout(r, 80));
        }
      }
    }
  } catch (err) {
    console.error('Error clearing events from ServiFlow calendar:', err);
  }

  // 2. Reset calendarEventId in DB
  await db.visit.updateMany({
    where: { tenantId, status: { not: 'CANCELLED' }, scheduledAt: { not: null } },
    data: { calendarEventId: null },
  });

  // 3. Query all active visits
  const visits = await db.visit.findMany({
    where: { tenantId, status: { not: 'CANCELLED' }, scheduledAt: { not: null } },
    select: { id: true },
  });

  // 4. Sync each visit into the ServiFlow sub-calendar sequentially with 120ms delay
  for (const v of visits) {
    await syncVisitToGoogle(v.id, tenantId).catch(console.error);
    await new Promise((r) => setTimeout(r, 120));
  }

  return { count: visits.length };
}

/** Purges all old test/legacy events from the user's PRIMARY Google Calendar (Javier Noriega) */
export async function purgePrimaryCalendarLegacyEvents(tenantId: string) {
  const accessToken = await getValidAccessToken(tenantId);
  if (!accessToken) return { deletedCount: 0 };

  let deletedCount = 0;

  try {
    // 1. Fetch events from primary calendar
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=250`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (res.ok) {
      const data = await res.json();
      const items = data.items || [];

      for (const item of items) {
        if (!item.id || !item.summary) continue;
        const summary = item.summary;
        // Match events starting with SF - or containing — Servicio or - Servicio
        if (
          summary.startsWith('SF -') ||
          summary.startsWith('SF-') ||
          summary.includes('— Servicio') ||
          summary.includes(' - Servicio')
        ) {
          await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${item.id}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          ).catch(console.error);
          deletedCount++;
          await new Promise((r) => setTimeout(r, 80));
        }
      }
    }
  } catch (err) {
    console.error('Error purging primary calendar legacy events:', err);
  }

  // 2. Also wipe and cleanly re-sync the dedicated ServiFlow calendar
  await cleanAndResyncAllServiFlowEvents(tenantId);

  return { deletedCount };
}
