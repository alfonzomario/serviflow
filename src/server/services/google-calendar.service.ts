import { db } from "../db";

export async function syncVisitToGoogle(visitId: string, tenantId: string) {
  const visit = await db.visit.findFirst({
    where: {
      id: visitId,
      tenantId: tenantId,
    },
    include: {
      client: true,
      job: true,
    },
  });

  if (!visit || !visit.scheduledAt) {
    return;
  }

  const tenantSettings = await db.tenantSettings.findUnique({
    where: { tenantId },
  });

  if (!tenantSettings?.googleCalendarEnabled || !tenantSettings?.googleAccessToken) {
    return;
  }

  const durationMs = (visit.durationMinutes || 45) * 60 * 1000;
  const startTime = new Date(visit.scheduledAt);
  const endTime = new Date(startTime.getTime() + durationMs);

  const event = {
    // @ts-ignore - Assuming job might have a name or fallback to Visita
    summary: visit.job?.name || visit.serviceType || 'Visita',
    description: visit.client.name,
    start: {
      dateTime: startTime.toISOString(),
    },
    end: {
      dateTime: endTime.toISOString(),
    },
  };

  try {
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenantSettings.googleAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      if (response.status === 401) {
        // TODO: implement refresh token logic
      }
      console.error('Failed to sync visit to Google Calendar:', await response.text());
    } else {
      const data = await response.json();
      // Optionally save data.id to visit.calendarEventId
      if (data.id) {
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

export async function deleteCalendarEvent(eventId: string, tenantId: string) {
  const tenantSettings = await db.tenantSettings.findUnique({
    where: { tenantId },
  });

  if (!tenantSettings?.googleAccessToken) {
    return;
  }

  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tenantSettings.googleAccessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // TODO: implement refresh token logic
      }
      console.error('Failed to delete Google Calendar event:', await response.text());
    }
  } catch (error) {
    console.error('Error deleting Google Calendar event:', error);
  }
}
