import { NextResponse } from 'next/server';
import { db } from '@/server/db';

export async function GET() {
  const visits = await db.visit.findMany({
    where: { status: { not: 'CANCELLED' } },
    include: { client: true },
  });

  const roblesAndRemeros = visits.filter(v => 
    v.client.name.toLowerCase().includes('robles') || 
    v.client.name.toLowerCase().includes('remeros')
  );

  return NextResponse.json({
    totalVisits: visits.length,
    targets: roblesAndRemeros.map(v => ({
      id: v.id,
      client: v.client.name,
      scheduledAt: v.scheduledAt,
      status: v.status,
      deletedAt: v.deletedAt
    }))
  });
}
