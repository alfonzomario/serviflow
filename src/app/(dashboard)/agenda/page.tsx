'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Card } from '@/components/ui/card';

export default function AgendaPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Example start/end of month for fetching (padded)
  const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);

  const { data: visitsData, isLoading } = trpc.visits.list.useQuery({
    startDate,
    endDate,
    limit: 200, // Fetch more for calendar view
  });

  const events = visitsData?.items.map((visit) => ({
    id: visit.id,
    title: `${visit.client.name} - ${visit.serviceType || 'Servicio'}`,
    start: new Date(visit.scheduledAt),
    end: new Date(new Date(visit.scheduledAt).getTime() + (visit.durationMinutes * 60000)),
    backgroundColor: getStatusColor(visit.status),
    borderColor: getStatusColor(visit.status),
    extendedProps: {
      status: visit.status,
      clientId: visit.clientId,
    }
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agenda</h1>
          <p className="text-muted-foreground">Gestioná los turnos y visitas programadas.</p>
        </div>
      </div>
      
      <Card className="p-4 overflow-hidden bg-card border-none shadow-md">
        <style dangerouslySetInnerHTML={{__html: `
          .fc-theme-standard td, .fc-theme-standard th { border-color: var(--border); }
          .fc-theme-standard .fc-scrollgrid { border-color: var(--border); }
          .fc-button-primary { background-color: var(--primary) !important; border-color: var(--primary) !important; }
          .fc-button-primary:not(:disabled):active, .fc-button-primary:not(:disabled).fc-button-active {
            background-color: var(--primary) !important; border-color: var(--primary) !important; opacity: 0.8;
          }
          .fc-event { cursor: pointer; transition: transform 0.1s ease; border-radius: 4px; padding: 2px 4px; border: none; }
          .fc-event:hover { transform: scale(1.02); z-index: 5; }
          .fc-timegrid-slot-label { font-size: 0.875rem; color: var(--muted-foreground); }
          .fc-col-header-cell-cushion { color: var(--foreground); padding: 8px !important; }
        `}} />
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
          }}
          locale="es"
          events={events}
          height="75vh"
          slotMinTime="07:00:00"
          slotMaxTime="20:00:00"
          allDaySlot={false}
          nowIndicator={true}
          editable={true}
          selectable={true}
          selectMirror={true}
          dayMaxEvents={true}
          datesSet={(arg) => setCurrentDate(arg.view.currentStart)}
          eventClick={(arg) => {
            console.log('Abrir detalle de visita', arg.event.id);
          }}
          select={(arg) => {
            console.log('Nuevo turno', arg.startStr, arg.endStr);
          }}
        />
      </Card>
    </div>
  );
}

function getStatusColor(status: string) {
  switch (status) {
    case 'CONFIRMED': return '#4f46e5'; // indigo-600
    case 'PENDING_CONFIRM': return '#eab308'; // yellow-500
    case 'COMPLETED': return '#16a34a'; // green-600
    case 'CANCELLED': return '#dc2626'; // red-600
    default: return '#64748b'; // slate-500
  }
}
