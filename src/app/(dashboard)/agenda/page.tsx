'use client';

import { useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventDropArg } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VisitForm } from '@/components/agenda/VisitForm';

const STATUS_COLORS: Record<string, string> = {
  PENDING_CONFIRM: '#eab308', // yellow-500
  CONFIRMED: '#4f46e5', // indigo-600
  COMPLETED: '#16a34a', // green-600
  CANCELLED: '#dc2626', // red-600
  SKIPPED: '#64748b', // slate-500
};

export default function AgendaPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [slotStart, setSlotStart] = useState<Date | null>(null);
  const [slotDuration, setSlotDuration] = useState(45);

  const utils = trpc.useUtils();

  // Fetch a month on either side so navigating doesn't blank the grid.
  const { startDate, endDate } = useMemo(
    () => ({
      startDate: new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1),
      endDate: new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0, 23, 59, 59),
    }),
    [currentDate]
  );

  const { data: visitsData, isLoading } = trpc.visits.list.useQuery({
    startDate,
    endDate,
    limit: 500,
  });

  const reschedule = trpc.visits.reschedule.useMutation({
    onSuccess: () => {
      toast.success('Visita reprogramada');
      utils.visits.list.invalidate();
    },
  });

  const events = useMemo(
    () =>
      visitsData?.items
        // Visits without a slot live in Pendientes, not on the calendar.
        .filter((visit) => visit.scheduledAt !== null)
        .map((visit) => {
          const start = new Date(visit.scheduledAt as Date);
          return {
            id: visit.id,
            title: `${visit.client.name}${visit.serviceType ? ` — ${visit.serviceType}` : ''}`,
            start,
            end: new Date(start.getTime() + visit.durationMinutes * 60000),
            backgroundColor: STATUS_COLORS[visit.status] ?? STATUS_COLORS.SKIPPED,
            borderColor: STATUS_COLORS[visit.status] ?? STATUS_COLORS.SKIPPED,
            // Completed visits are historical records and must not be dragged.
            editable: visit.status !== 'COMPLETED',
            extendedProps: { status: visit.status, clientId: visit.clientId },
          };
        }) ?? [],
    [visitsData]
  );

  function openNewVisit(start?: Date, durationMinutes?: number) {
    setEditingVisitId(null);
    setSlotStart(start ?? null);
    setSlotDuration(durationMinutes ?? 45);
    setDialogOpen(true);
  }

  function openExistingVisit(id: string) {
    setEditingVisitId(id);
    setSlotStart(null);
    setDialogOpen(true);
  }

  /** Shared by drag-move and resize: persist, and roll back the UI on failure. */
  async function persistReschedule(arg: EventDropArg | EventResizeDoneArg) {
    const start = arg.event.start;
    if (!start) return;

    const end = arg.event.end;
    const durationMinutes = end
      ? Math.round((end.getTime() - start.getTime()) / 60000)
      : undefined;

    try {
      await reschedule.mutateAsync({
        id: arg.event.id,
        scheduledAt: start,
        durationMinutes,
      });
    } catch (mutationError) {
      arg.revert();
      toast.error(
        mutationError instanceof Error ? mutationError.message : 'No se pudo reprogramar'
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agenda</h1>
          <p className="text-muted-foreground">
            Gestioná los turnos y visitas programadas. Arrastrá un turno para reprogramarlo.
          </p>
        </div>
        <Button onClick={() => openNewVisit()}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva visita
        </Button>
      </div>

      <Card className="overflow-hidden border-none bg-card p-4 shadow-md">
        <style
          dangerouslySetInnerHTML={{
            __html: `
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
        `,
          }}
        />
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          buttonText={{
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            day: 'Día',
          }}
          locale="es"
          firstDay={1}
          events={events}
          height="75vh"
          slotMinTime="07:00:00"
          slotMaxTime="20:00:00"
          allDaySlot={false}
          nowIndicator
          editable
          selectable
          selectMirror
          dayMaxEvents
          datesSet={(arg) => setCurrentDate(arg.view.currentStart)}
          eventClick={(arg) => openExistingVisit(arg.event.id)}
          select={(arg) => {
            const durationMinutes = Math.round(
              (arg.end.getTime() - arg.start.getTime()) / 60000
            );
            // A month-view click selects a whole day; fall back to the default slot.
            openNewVisit(arg.start, durationMinutes >= 1440 ? 45 : durationMinutes);
          }}
          eventDrop={persistReschedule}
          eventResize={persistReschedule}
        />
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando visitas…</p>}

      <VisitForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        visitId={editingVisitId}
        defaultStart={slotStart}
        defaultDurationMinutes={slotDuration}
      />
    </div>
  );
}
