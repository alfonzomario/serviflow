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

  const isExpired = !settings.googleAccessToken ||
    (settings.googleTokenExpiresAt && new Date(settings.googleTokenExpiresAt).getTime() - Date.now() < 300000);

  if (!isExpired && settings.googleAccessToken) {
    return settings.googleAccessToken;
  }

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

// ---------------------------------------------------------------------------
// Calendar Management
// ---------------------------------------------------------------------------

/** Finds or creates the dedicated 'ServiFlow' sub-calendar */
export async function getOrCreateServiFlowCalendar(accessToken: string, tenantId: string): Promise<string> {
  const settings = await db.tenantSettings.findUnique({ where: { tenantId } });
  if (settings?.googleCalendarId) {
    return settings.googleCalendarId;
  }

  try {
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

// ---------------------------------------------------------------------------
// Paginated event helpers
// ---------------------------------------------------------------------------

/** Fetches ALL events from a calendar with full pagination (Google limits to 250/page) */
async function fetchAllEvents(
  accessToken: string,
  calendarId: string,
  extraParams: string = ''
): Promise<Array<{ id: string; summary?: string; start?: any }>> {
  const allItems: Array<{ id: string; summary?: string; start?: any }> = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ maxResults: '250', showDeleted: 'false' });
    if (pageToken) params.set('pageToken', pageToken);
    if (extraParams) {
      const extra = new URLSearchParams(extraParams);
      extra.forEach((v, k) => params.set(k, v));
    }

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) break;

    const data = await res.json();
    allItems.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allItems;
}

async function deleteEvents(
  accessToken: string,
  calendarId: string,
  eventIds: string[]
): Promise<number> {
  let count = 0;
  // Process in batches of 10 to avoid Vercel timeouts (10s max)
  for (let i = 0; i < eventIds.length; i += 10) {
    const batch = eventIds.slice(i, i + 10);
    await Promise.all(
      batch.map(async (id) => {
        try {
          const res = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${id}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );
          if (!res.ok) {
            console.error(`Failed to delete event ${id}: ${res.status} ${await res.text()}`);
          } else {
            count++;
          }
        } catch (e) {
          console.error(`Network error deleting event ${id}:`, e);
        }
      })
    );
    // Small delay between batches to respect rate limits
    await new Promise((r) => setTimeout(r, 100));
  }
  return count;
}

// ---------------------------------------------------------------------------
// Single visit sync
// ---------------------------------------------------------------------------

/** Syncs a single visit to the dedicated ServiFlow Google Calendar */
export async function syncVisitToGoogle(visitId: string, tenantId: string) {
  const visit = await db.visit.findFirst({
    where: { id: visitId, tenantId },
    include: { client: true, job: true },
  });

  if (!visit || !visit.scheduledAt) return;

  const accessToken = await getValidAccessToken(tenantId);
  if (!accessToken) return;

  const calendarId = await getOrCreateServiFlowCalendar(accessToken, tenantId);

  const startTime = new Date(visit.scheduledAt);
  const durationMs = (visit.durationMinutes || 45) * 60 * 1000;
  const endTime = new Date(startTime.getTime() + durationMs);

  const title = `SF - ${visit.client.name}`;

  const eventPayload = {
    summary: title,
    location: visit.client.address || '',
    description: `Cliente: ${visit.client.name}\nTeléfono: ${visit.client.phone || 'N/I'}\nDirección: ${visit.client.address || 'N/I'}\nNotas: ${visit.notes || 'Sin observaciones'}`,
    colorId: '9', // Electric Blue (Peacock)
    start: { dateTime: startTime.toISOString() },
    end: { dateTime: endTime.toISOString() },
  };

  try {
    // --- Try UPDATE if we have a calendarEventId ---
    if (visit.calendarEventId) {
      const putRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${visit.calendarEventId}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(eventPayload),
        }
      );

      if (putRes.ok) return; // Updated successfully, done

      // If 404/410 the old event was deleted from Calendar — fall through to create
      if (putRes.status !== 404 && putRes.status !== 410) {
        console.error('PUT failed:', await putRes.text());
      }
    }

    // --- DEDUPLICATION: search for existing event with same title & start time ---
    const existingEvents = await fetchAllEvents(accessToken, calendarId);
    const duplicate = existingEvents.find(
      (e) => e.summary === title && e.start?.dateTime === startTime.toISOString()
    );

    if (duplicate) {
      // Update the existing duplicate instead of creating a new one
      const putRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${duplicate.id}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(eventPayload),
        }
      );
      if (putRes.ok) {
        await db.visit.update({
          where: { id: visit.id },
          data: { calendarEventId: duplicate.id },
        });
        return;
      }
    }

    // --- CREATE new event ---
    const postRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventPayload),
      }
    );

    if (postRes.ok) {
      const data = await postRes.json();
      if (data.id) {
        await db.visit.update({
          where: { id: visit.id },
          data: { calendarEventId: data.id },
        });
      }
    } else {
      console.error('POST event failed:', await postRes.text());
    }
  } catch (error) {
    console.error('Error syncing visit to Google Calendar:', error);
  }
}

/** Deletes an event from the dedicated ServiFlow Google Calendar */
export async function deleteCalendarEvent(eventId: string, tenantId: string) {
  const accessToken = await getValidAccessToken(tenantId);
  if (!accessToken) return;

  const calendarId = await getOrCreateServiFlowCalendar(accessToken, tenantId);

  try {
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
  } catch (error) {
    console.error('Error deleting Google Calendar event:', error);
  }
}

// ---------------------------------------------------------------------------
// Full reset & resync
// ---------------------------------------------------------------------------

/** Nukes the ServiFlow sub-calendar entirely and recreates it fresh, then re-syncs all visits */
export async function cleanAndResyncAllServiFlowEvents(tenantId: string) {
  const accessToken = await getValidAccessToken(tenantId);
  if (!accessToken) return { count: 0 };

  const settings = await db.tenantSettings.findUnique({ where: { tenantId } });
  const oldCalendarId = settings?.googleCalendarId;

  // 1. DELETE ALL existing ServiFlow sub-calendars to clean up duplicates
  try {
    const calListRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (calListRes.ok) {
      const data = await calListRes.json();
      const calendars = data.items || [];
      const serviFlowCals = calendars.filter((c: any) => c.summary === 'ServiFlow');
      
      for (const cal of serviFlowCals) {
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
        ).catch(console.error);
        await new Promise(r => setTimeout(r, 200));
      }
    }
  } catch (e) {
    console.error('Error fetching/deleting old ServiFlow calendars:', e);
  }

  // 2. Clear the saved calendarId so getOrCreate will make a new one
  await db.tenantSettings.update({
    where: { tenantId },
    data: { googleCalendarId: null },
  });

  // 3. Reset ALL calendarEventId references in the DB
  await db.visit.updateMany({
    where: { tenantId },
    data: { calendarEventId: null },
  });

  // 4. Create the fresh ServiFlow sub-calendar
  const newCalendarId = await getOrCreateServiFlowCalendar(accessToken, tenantId);
  if (!newCalendarId || newCalendarId === 'primary') {
    console.error('Failed to create new ServiFlow calendar');
    return { count: 0 };
  }

  // 5. Re-sync all active visits into the brand new calendar in batches
  const visits = await db.visit.findMany({
    where: { tenantId, status: { not: 'CANCELLED' }, scheduledAt: { not: null } },
    select: { id: true },
  });

  for (const v of visits) {
    await syncVisitToGoogle(v.id, tenantId).catch(console.error);
    await new Promise((r) => setTimeout(r, 200)); // 200ms delay to avoid rate limits
  }

  return { count: visits.length };
}

/** NUCLEAR OPTION: Purges ALL ServiFlow events from primary calendar + deletes & recreates ServiFlow sub-calendar */
export async function nuclearResetGoogleCalendar(tenantId: string) {
  const accessToken = await getValidAccessToken(tenantId);
  if (!accessToken) return { primaryDeleted: 0, synced: 0 };

  // ---- PHASE 1: Clean primary calendar ----
  let primaryDeleted = 0;
  try {
    // Load client names for matching legacy events
    const clients = await db.client.findMany({
      where: { tenantId },
      select: { name: true },
    });
    const clientNames = clients.map((c) => c.name.toLowerCase().trim()).filter(Boolean);

    // Paginated fetch of ALL events from primary calendar in 2026
    const allPrimaryEvents = await fetchAllEvents(
      accessToken,
      'primary',
      'timeMin=2026-01-01T00:00:00Z&timeMax=2027-01-01T00:00:00Z'
    );

    // Find ServiFlow-related events by prefix, suffix, or client name
    const toDelete = allPrimaryEvents.filter((item) => {
      if (!item.summary) return false;
      const s = item.summary;
      const lower = s.toLowerCase();
      return (
        s.startsWith('SF -') ||
        s.startsWith('SF-') ||
        s.includes('— Servicio') ||
        s.includes('— Servi') ||
        s.includes(' - Servicio') ||
        clientNames.some((name) => lower.includes(name))
      );
    });

    primaryDeleted = await deleteEvents(
      accessToken,
      'primary',
      toDelete.map((e) => e.id)
    );
  } catch (err) {
    console.error('Error purging primary calendar:', err);
  }

  // ---- PHASE 2: Nuke & recreate ServiFlow sub-calendar + resync ----
  const resyncResult = await cleanAndResyncAllServiFlowEvents(tenantId);

  return { primaryDeleted, synced: resyncResult.count };
}
