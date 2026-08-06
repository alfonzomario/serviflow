import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function nuke() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return console.log('No tenant found');

  console.log('Found tenant:', tenant.id);
  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId: tenant.id } });
  const token = settings?.googleAccessToken;
  
  if (!token) {
    console.log('No access token found in DB. Please connect Google Calendar in the UI first.');
    return;
  }

  console.log('Fetching calendars...');
  const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!res.ok) {
    return console.log('Failed to fetch calendars:', await res.text());
  }
  
  const data = await res.json();
  const cals = data.items.filter((c: any) => c.summary === 'ServiFlow');
  
  console.log(`Found ${cals.length} ServiFlow calendars. Nuking...`);
  
  for (let i = 0; i < cals.length; i++) {
    const cal = cals[i];
    console.log(`[${i+1}/${cals.length}] Deleting ${cal.id}...`);
    const delRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (delRes.ok) {
      console.log('  OK');
    } else {
      console.log('  Failed:', await delRes.text());
    }
    await new Promise(r => setTimeout(r, 1500)); // 1.5s delay to avoid rate limits
  }
  
  console.log('Done!');
}

nuke().catch(console.error).finally(() => prisma.$disconnect());
