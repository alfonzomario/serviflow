import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { formatInTimeZone } from 'date-fns-tz';

export const dynamic = 'force-dynamic';

const TZ = 'America/Argentina/Buenos_Aires';

function formatLocalICalDate(date: Date): string {
  return formatInTimeZone(date, TZ, "yyyyMMdd'T'HHmmss");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  let tenant = null;
  if (token) {
    tenant = await db.tenant.findFirst({
      where: {
        OR: [{ id: token }, { slug: token }],
      },
    });
  }

  if (!tenant) {
    tenant = await db.tenant.findFirst({
      where: { status: 'ACTIVE' },
    });
  }

  if (!tenant) {
    return new NextResponse('Tenant no encontrado', { status: 404 });
  }

  // Fetch visits from 3 months ago to 1 year in advance
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  const visits = await db.visit.findMany({
    where: {
      tenantId: tenant.id,
      status: { not: 'CANCELLED' },
      scheduledAt: { gte: threeMonthsAgo },
    },
    include: {
      client: true,
      assignedUser: true,
    },
    orderBy: { scheduledAt: 'asc' },
  });

  let icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ServiFlow//Agenda Sync//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:ServiFlow - ${tenant.name}`,
    `X-WR-TIMEZONE:${TZ}`,
    'BEGIN:VTIMEZONE',
    `TZID:${TZ}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:-0300',
    'TZOFFSETTO:-0300',
    'TZNAME:-03',
    'END:STANDARD',
    'END:VTIMEZONE',
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
      `DTSTAMP:${formatLocalICalDate(new Date())}`,
      `DTSTART;TZID=${TZ}:${formatLocalICalDate(start)}`,
      `DTEND;TZID=${TZ}:${formatLocalICalDate(end)}`,
      `SUMMARY:${title.replace(/[,;]/g, ' ')}`,
      `LOCATION:${address.replace(/[,;]/g, ' ')}`,
      `DESCRIPTION:${notes.replace(/[,;]/g, ' ')}`,
      'STATUS:CONFIRMED',
      'END:VEVENT'
    );
  }

  icsLines.push('END:VCALENDAR');

  return new NextResponse(icsLines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="serviflow-calendar.ics"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
