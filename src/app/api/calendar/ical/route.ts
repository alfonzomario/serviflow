import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { toBuenosAiresIcsString, BUENOS_AIRES_TIMEZONE } from '@/server/lib/timezone';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return new NextResponse('Token iCal requerido', { status: 401 });
    }

    const settings = await db.tenantSettings.findFirst({
      where: { icalFeedToken: token.trim() },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true, status: true },
        },
      },
    });

    if (!settings || !settings.tenant || settings.tenant.status !== 'ACTIVE') {
      return new NextResponse('Feed iCal no encontrado o inactivo', { status: 404 });
    }

    const tenantRow = settings.tenant;

    // If direct OAuth sync is enabled, return empty iCal feed
    if (settings.googleCalendarEnabled) {
      const emptyIcs = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//ServiFlow//Agenda Sync//ES',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:ServiFlow - ${tenantRow.name}`,
        'END:VCALENDAR',
      ].join('\r\n');

      return new NextResponse(emptyIcs, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': 'inline; filename="serviflow-calendar.ics"',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const visits = await db.visit.findMany({
      where: {
        tenantId: tenantRow.id,
        deletedAt: null,
        status: { not: 'CANCELLED' },
        scheduledAt: { gte: threeMonthsAgo },
      },
      include: {
        client: true,
      },
      orderBy: { scheduledAt: 'asc' },
    });

    let icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ServiFlow//Agenda Sync//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:ServiFlow - ${tenantRow.name}`,
      `X-WR-TIMEZONE:${BUENOS_AIRES_TIMEZONE}`,
    ];

    for (const visit of visits) {
      if (!visit.scheduledAt) continue;
      const start = new Date(visit.scheduledAt);
      const duration = visit.durationMinutes || 45;
      const end = new Date(start.getTime() + duration * 60000);

      const title = `${visit.client.name} - ${visit.serviceType || 'Servicio'}`;
      const address = visit.client.address || '';
      const notes = [
        visit.notes ? `Notas: ${visit.notes}` : '',
        visit.client.phone ? `Tel: ${visit.client.phone}` : '',
      ].filter(Boolean).join('\\n');

      icsLines.push(
        'BEGIN:VEVENT',
        `UID:visit-${visit.id}@serviflow.app`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
        `DTSTART;TZID=${BUENOS_AIRES_TIMEZONE}:${toBuenosAiresIcsString(start)}`,
        `DTEND;TZID=${BUENOS_AIRES_TIMEZONE}:${toBuenosAiresIcsString(end)}`,
        `SUMMARY:${title.replace(/[,;\n\r]/g, ' ')}`,
        `LOCATION:${address.replace(/[,;\n\r]/g, ' ')}`,
        `DESCRIPTION:${notes.replace(/[,;\n\r]/g, ' ')}`,
        'STATUS:CONFIRMED',
        'END:VEVENT'
      );
    }

    icsLines.push('END:VCALENDAR');

    return new NextResponse(icsLines.join('\r\n'), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="serviflow-calendar.ics"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err: any) {
    console.error('Error generating iCal feed:', err);
    return new NextResponse(`Error: ${err?.message || err}`, { status: 500 });
  }
}
