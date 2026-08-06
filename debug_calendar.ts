import { PrismaClient } from '@prisma/client';


const prisma = new PrismaClient();

async function checkCalendar() {
  const tenants = await prisma.tenant.findMany();
  if (tenants.length === 0) {
    console.log("No tenants found");
    return;
  }
  const tenant = tenants[0];
  
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: tenant.id }
  });
  
  if (!settings || !settings.googleAccessToken) {
    console.log("No google token for tenant", tenant.id);
    return;
  }

  console.log("Fetching primary calendar events...");
  const params = new URLSearchParams({ 
    maxResults: '50',
    timeMin: '2026-08-01T00:00:00Z', // Just look at august for now to see what's happening
    timeMax: '2026-09-01T00:00:00Z'
  });
  
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${settings.googleAccessToken}` } }
  );
  
  if (!res.ok) {
    console.log("Error fetching events:", await res.text());
    return;
  }
  
  const data = await res.json();
  const items = data.items || [];
  
  console.log(`Found ${items.length} events in August (showing up to 50):`);
  items.forEach((item: any) => {
    console.log(`- ID: ${item.id} | Summary: "${item.summary}" | Start: ${item.start?.dateTime || item.start?.date}`);
  });
}

checkCalendar().catch(console.error).finally(() => prisma.$disconnect());
