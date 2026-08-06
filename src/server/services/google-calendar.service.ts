import { db } from "../db";
import { decryptIfPresent } from "../lib/encryption";
import { toBuenosAiresOffsetString, BUENOS_AIRES_TIMEZONE } from "../lib/timezone";
import { DEFAULT_GOOGLE_CALENDAR_COLOR_ID, DEFAULT_GOOGLE_CALENDAR_NAME } from "../../lib/googleCalendarColors";

/** Tenants currently mid full-reset. Individual syncs bail out while this is set — the
 * reset reads all active visits at the end anyway, so nothing is lost, and skipping avoids
 * racing a wipe with a create/update against the same calendar. */
const activeSyncs = new Set<string>();

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

/**
 * Checks whether a calendar id still resolves on Google's side. Only 404/410
 * count as "gone" — anything else (network blip, rate limit, auth hiccup) is
 * "unknown", because treating those as gone would make a perfectly good
 * calendar id get forgotten and a duplicate calendar created underneath it.
 */
async function calendarStillExists(accessToken: string, calendarId: string): Promise<"ok" | "missing" | "unknown"> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.ok) return "ok";
    if (res.status === 404 || res.status === 410) return "missing";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** Finds or creates the tenant's dedicated Google sub-calendar, named per their settings. */
export async function getOrCreateServiFlowCalendar(accessToken: string, tenantId: string): Promise<string> {
  const settings = await db.tenantSettings.findUnique({ where: { tenantId } });
  if (settings?.googleCalendarId) {
    // The cached id can go stale if the calendar was deleted on Google's side
    // (by hand, or by an older ghost-calendar cleanup) without ServiFlow
    // finding out — every sync would then silently 404 forever. Confirm it's
    // still there before trusting it; if it's gone, forget it and fall
    // through to find-or-create a fresh one below.
    const status = await calendarStillExists(accessToken, settings.googleCalendarId);
    if (status === "ok") return settings.googleCalendarId;
    if (status === "unknown") return settings.googleCalendarId;
    await db.tenantSettings.update({
      where: { tenantId },
      data: { googleCalendarId: null },
    });
  }

  const calendarName = settings?.googleCalendarName || DEFAULT_GOOGLE_CALENDAR_NAME;

  try {
    const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (listRes.ok) {
      const data = await listRes.json();
      const existing = (data.items || []).find((c: any) => c.summary === calendarName);
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
      body: JSON.stringify({ summary: calendarName, timeZone: BUENOS_AIRES_TIMEZONE }),
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
    console.error("Error getting/creating dedicated Google sub-calendar:", err);
  }

  return "primary";
}

/** Renames the tenant's Google sub-calendar to match `googleCalendarName`, and/or persists a new event color. Safe to call whether or not Google is currently connected. */
export async function updateGoogleCalendarAppearance(
  tenantId: string,
  updates: { calendarName?: string; colorId?: string }
) {
  const settings = await db.tenantSettings.findUnique({ where: { tenantId } });

  await db.tenantSettings.upsert({
    where: { tenantId },
    create: {
      tenantId,
      ...(updates.calendarName !== undefined && { googleCalendarName: updates.calendarName }),
      ...(updates.colorId !== undefined && { googleCalendarColorId: updates.colorId }),
    },
    update: {
      ...(updates.calendarName !== undefined && { googleCalendarName: updates.calendarName }),
      ...(updates.colorId !== undefined && { googleCalendarColorId: updates.colorId }),
    },
  });

  if (updates.calendarName && settings?.googleCalendarId && settings.googleCalendarId !== "primary") {
    const accessToken = await getValidAccessToken(tenantId);
    if (accessToken) {
      try {
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(settings.googleCalendarId)}`,
          {
            method: "PATCH",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ summary: updates.calendarName }),
          }
        );
      } catch (err) {
        console.error("Error renaming Google calendar:", err);
      }
    }
  }
}

/** Deletes the tenant's dedicated Google sub-calendar entirely (all its events go with it) and forgets its id locally. Used by disconnect to undo both sides. */
export async function deleteServiFlowCalendar(tenantId: string) {
  const settings = await db.tenantSettings.findUnique({ where: { tenantId } });
  if (!settings?.googleCalendarId || settings.googleCalendarId === "primary") return;

  const accessToken = await getValidAccessToken(tenantId);
  if (!accessToken) return;

  try {
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(settings.googleCalendarId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
    );
  } catch (err) {
    console.error("Error deleting dedicated Google sub-calendar:", err);
  }
}

/**
 * Live round-trip against Google, bypassing every cache, so a broken
 * connection shows its real cause instead of failing silently — every other
 * sync path here only logs to the server console, which isn't visible from
 * Settings. Forces a fresh token refresh (catches a bad/rotated Client
 * Secret) and then actually calls the Calendar API with it (catches missing
 * scopes, a revoked grant, or the API not being enabled on the project).
 */
export async function testGoogleCalendarConnection(
  tenantId: string
): Promise<{ ok: boolean; message: string }> {
  const settings = await db.tenantSettings.findUnique({ where: { tenantId } });

  if (!settings?.googleRefreshToken) {
    return { ok: false, message: "No hay ningún refresh token guardado — la conexión con Google nunca llegó a completarse." };
  }
  if (!settings.googleCalendarEnabled) {
    return { ok: false, message: "Hay un token guardado pero la sincronización está deshabilitada (googleCalendarEnabled = false)." };
  }

  const clientId = (settings.googleClientId || process.env.GOOGLE_CLIENT_ID || "").trim();
  let clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
  let secretSource = clientSecret ? "la variable de entorno GOOGLE_CLIENT_SECRET" : "";
  if (!clientSecret && settings.googleClientSecretEncrypted) {
    clientSecret = (decryptIfPresent(settings.googleClientSecretEncrypted) || "").trim();
    secretSource = clientSecret ? "el valor guardado en Settings" : "";
  }

  if (!clientId) {
    return { ok: false, message: "No hay Google Client ID configurado: ni en Settings ni en la variable de entorno GOOGLE_CLIENT_ID." };
  }
  if (!clientSecret) {
    return {
      ok: false,
      message: "No hay Google Client Secret disponible: no está en GOOGLE_CLIENT_SECRET y no se pudo desencriptar el guardado en Settings (si ENCRYPTION_KEY cambió desde que se guardó, quedó ilegible — hay que reconectar).",
    };
  }

  let accessToken: string;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: settings.googleRefreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      return {
        ok: false,
        message: `Google rechazó el refresh del token (usando ${secretSource}): HTTP ${tokenRes.status} — ${body.slice(0, 300)}`,
      };
    }
    const data = await tokenRes.json();
    if (!data.access_token) {
      return { ok: false, message: "Google respondió 200 pero sin access_token en el body — respuesta inesperada." };
    }
    accessToken = data.access_token;
  } catch (err: any) {
    return { ok: false, message: `Error de red pidiendo el token a Google: ${err?.message || err}` };
  }

  try {
    // Goes through the same self-healing lookup real syncs use — if the
    // cached id points at a calendar that's gone, this reports the outcome
    // of actually fixing it, not the stale failure underneath.
    const calendarId = await getOrCreateServiFlowCalendar(accessToken, tenantId);
    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!calRes.ok) {
      const body = await calRes.text();
      return {
        ok: false,
        message: `El token es válido, pero la Calendar API respondió HTTP ${calRes.status} al pedir el calendario "${calendarId}": ${body.slice(0, 300)}`,
      };
    }
    const cal = await calRes.json();
    return { ok: true, message: `Todo OK: token válido y calendario "${cal.summary}" accesible.` };
  } catch (err: any) {
    return { ok: false, message: `Error de red hablando con la Calendar API: ${err?.message || err}` };
  }
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

/** Syncs a single visit to the tenant's dedicated Google Calendar. */
export async function syncVisitToGoogle(visitId: string, tenantId: string) {
  // A full reset is in progress for this tenant — it will re-sync every active
  // visit itself once it finishes, so bail out instead of racing it.
  if (activeSyncs.has(tenantId)) return;

  const visit = await db.visit.findFirst({
    where: { id: visitId, tenantId },
    include: { client: true, job: true },
  });

  if (!visit || !visit.scheduledAt) return;

  const settings = await db.tenantSettings.findUnique({ where: { tenantId } });
  if (!settings?.googleCalendarEnabled || !settings?.googleRefreshToken) return;

  const accessToken = await getValidAccessToken(tenantId);
  if (!accessToken) return;

  const calendarId = await getOrCreateServiFlowCalendar(accessToken, tenantId);
  const colorId = settings.googleCalendarColorId || DEFAULT_GOOGLE_CALENDAR_COLOR_ID;

  const startTime = new Date(visit.scheduledAt);
  const durationMs = (visit.durationMinutes || 45) * 60 * 1000;
  const endTime = new Date(startTime.getTime() + durationMs);

  const title = `SF - ${visit.client.name}`;
  const startDateTime = toBuenosAiresOffsetString(startTime);
  const endDateTime = toBuenosAiresOffsetString(endTime);

  const eventPayload = {
    summary: title,
    location: visit.client.address || '',
    description: `Cliente: ${visit.client.name}\nTeléfono: ${visit.client.phone || 'N/I'}\nDirección: ${visit.client.address || 'N/I'}\nNotas: ${visit.notes || 'Sin observaciones'}`,
    colorId,
    // Both an explicit offset (fixes the instant unambiguously) and the IANA
    // name (so Google displays/handles it correctly) are sent — offset alone
    // pins the instant regardless of how the accompanying name is treated.
    start: { dateTime: startDateTime, timeZone: BUENOS_AIRES_TIMEZONE },
    end: { dateTime: endDateTime, timeZone: BUENOS_AIRES_TIMEZONE },
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
      (e) => e.summary === title && e.start?.dateTime === startDateTime
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

/** Deletes an event from the tenant's dedicated Google Calendar and forgets its id locally. */
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

/** Nukes the tenant's dedicated Google sub-calendar entirely and recreates it fresh, then re-syncs all visits */
export async function cleanAndResyncAllServiFlowEvents(tenantId: string) {
  const accessToken = await getValidAccessToken(tenantId);
  if (!accessToken) return { count: 0 };

  // LOCK PREVENTIVO EN MEMORIA: Abortamos si hay un proceso corriendo en este servidor
  if (activeSyncs.has(tenantId)) {
    console.log('Sincronización ya en curso. Abortando duplicado.');
    return { count: 0 };
  }

  activeSyncs.add(tenantId);
  try {
    const settings = await db.tenantSettings.findUnique({ where: { tenantId } });
    let oldCalendarId = settings?.googleCalendarId;
    const calendarName = settings?.googleCalendarName || DEFAULT_GOOGLE_CALENDAR_NAME;
    const colorId = settings?.googleCalendarColorId || DEFAULT_GOOGLE_CALENDAR_COLOR_ID;

    // FIX FOR STUCK DB LOCK: Si quedó trabado de una corrida anterior, lo limpiamos
    if (oldCalendarId === 'SYNCING') {
      oldCalendarId = null;
      await db.tenantSettings.update({
        where: { tenantId },
        data: { googleCalendarId: null }
      });
    }

    // 0. LIMPIEZA DE CALENDARIOS FANTASMA (Si el usuario tiene varios calendarios
    // con el mismo nombre creados por error)
    try {
      const calListRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (calListRes.ok) {
        const data = await calListRes.json();
        const cals = (data.items || []).filter((c: any) => c.summary === calendarName);
        if (cals.length > 1) {
          console.log(`Found ${cals.length} "${calendarName}" calendars. Nuking ghosts...`);
          // Dejamos 1 vivo (el índice 0) y borramos el resto
          for (let i = 1; i < cals.length; i++) {
            await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cals[i].id)}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${accessToken}` }
            }).catch(console.error);
            await new Promise(r => setTimeout(r, 1500)); // 1.5s delay to avoid rate limit
          }
        }
      }
    } catch (e) {
      console.error('Error limpiando calendarios fantasma:', e);
    }

    // 1. Get or Create the single dedicated calendar (this doesn't trigger deletion limits)
    const targetCalendarId = await getOrCreateServiFlowCalendar(accessToken, tenantId);
    if (!targetCalendarId) {
      console.error('Failed to get or create target Google sub-calendar');
      return { count: 0 };
    }

    // 2. Fetch ALL existing events from this calendar
    let eventsToDelete: any[] = [];
    try {
      eventsToDelete = await fetchAllEvents(
        accessToken,
        targetCalendarId,
        'timeMin=2026-01-01T00:00:00Z&timeMax=2027-01-01T00:00:00Z'
      );
    } catch (e) {
      console.error('Error fetching events to delete:', e);
    }

    // 3. Delete them one by one slowly (Empty the calendar manually)
    for (const event of eventsToDelete) {
      if (!event.id) continue;
      try {
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendarId)}/events/${event.id}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
        );
      } catch (e) {
        console.error('Error deleting event:', e);
      }
      await new Promise(r => setTimeout(r, 150)); // Slow and steady
    }

    // 4. Reset ALL calendarEventId references in the DB
    await db.visit.updateMany({
      where: { tenantId },
      data: { calendarEventId: null },
    });

    // 5. Re-sync all active visits using direct POST (slow and steady)
    const visits = await db.visit.findMany({
      where: { tenantId, status: { not: 'CANCELLED' }, scheduledAt: { not: null } },
      include: { client: true },
    });

    for (const v of visits) {
      if (!v.scheduledAt) continue;

      const startTime = new Date(v.scheduledAt);
      const durationMs = (v.durationMinutes || 45) * 60 * 1000;
      const endTime = new Date(startTime.getTime() + durationMs);
      const title = `SF - ${v.client.name}`;

      const eventPayload = {
        summary: title,
        location: v.client.address || '',
        description: `Cliente: ${v.client.name}\nTeléfono: ${v.client.phone || 'N/I'}\nDirección: ${v.client.address || 'N/I'}\nNotas: ${v.notes || 'Sin observaciones'}`,
        colorId,
        start: { dateTime: toBuenosAiresOffsetString(startTime), timeZone: BUENOS_AIRES_TIMEZONE },
        end: { dateTime: toBuenosAiresOffsetString(endTime), timeZone: BUENOS_AIRES_TIMEZONE },
      };

      try {
        const postRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendarId)}/events`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(eventPayload),
          }
        );
        if (postRes.ok) {
          const data = await postRes.json();
          await db.visit.update({
            where: { id: v.id },
            data: { calendarEventId: data.id },
          });
        }
      } catch (e) {
        console.error('Error posting event:', e);
      }

      await new Promise((r) => setTimeout(r, 150)); // Fast delay to avoid rate limit
    }

    // 6. Save the final calendar ID
    await db.tenantSettings.update({
      where: { tenantId },
      data: { googleCalendarId: targetCalendarId },
    });

    return { count: visits.length };
  } finally {
    // RELEASE MEMORY LOCK SIEMPRE
    activeSyncs.delete(tenantId);
  }
}

/** NUCLEAR OPTION: Purges ALL ServiFlow events from primary calendar + deletes & recreates the dedicated sub-calendar */
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

  // ---- PHASE 2: Nuke & recreate dedicated sub-calendar + resync ----
  const resyncResult = await cleanAndResyncAllServiFlowEvents(tenantId);

  return { primaryDeleted, synced: resyncResult.count };
}
