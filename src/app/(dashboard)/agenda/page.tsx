'use client';

import { useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventDropArg, EventContentArg } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import { Plus, Calendar as CalendarIcon, CheckCircle2, Clock, XCircle, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VisitForm } from '@/components/agenda/VisitForm';

interface StatusStyle {
  label: string;
  bg: string;
  border: string;
  text: string;
  dot: string;
  badgeBg: string;
  icon: typeof Clock;
}

const STATUS_CONFIG: Record<string, StatusStyle> = {
  PENDING_CONFIRM: {
    label: 'Por confirmar',
    bg: '#fef3c7', // amber-100
    border: '#f59e0b', // amber-500
    text: '#78350f', // amber-900
    dot: 'bg-amber-500',
    badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
    icon: Clock,
  },
  CONFIRMED: {
    label: 'Confirmada',
    bg: '#e0e7ff', // indigo-100
    border: '#6366f1', // indigo-500
    text: '#1e1b4b', // indigo-950
    dot: 'bg-indigo-600',
    badgeBg: 'bg-indigo-100 text-indigo-950 border-indigo-300',
    icon: CalendarIcon,
  },
  COMPLETED: {
    label: 'Realizada',
    bg: '#dcfce7', // green-100
    border: '#16a34a', // green-600
    text: '#14532d', // green-950
    dot: 'bg-green-600',
    badgeBg: 'bg-green-100 text-green-950 border-green-300',
    icon: CheckCircle2,
  },
  CANCELLED: {
    label: 'Cancelada',
    bg: '#fee2e2', // red-100
    border: '#ef4444', // red-500
    text: '#7f1d1d', // red-950
    dot: 'bg-red-500',
    badgeBg: 'bg-red-100 text-red-950 border-red-300',
    icon: XCircle,
  },
  SKIPPED: {
    label: 'Omitida',
    bg: '#f1f5f9', // slate-100
    border: '#64748b', // slate-500
    text: '#0f172a', // slate-900
    dot: 'bg-slate-500',
    badgeBg: 'bg-slate-100 text-slate-900 border-slate-300',
    icon: HelpCircle,
  },
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
          const application =
            visit.job && visit.applicationNumber
              ? ` (${visit.applicationNumber}/${visit.job.totalApplications})`
              : '';
          
          const statusConfig = STATUS_CONFIG[visit.status] ?? STATUS_CONFIG.SKIPPED;

          return {
            id: visit.id,
            title: `${visit.client.name}${visit.serviceType ? ` — ${visit.serviceType}` : ''}${application}`,
            start,
            end: new Date(start.getTime() + visit.durationMinutes * 60000),
            backgroundColor: statusConfig.bg,
            borderColor: statusConfig.border,
            textColor: statusConfig.text,
            // Completed visits are historical records and must not be dragged.
            editable: visit.status !== 'COMPLETED',
            extendedProps: {
              status: visit.status,
              clientId: visit.clientId,
              clientName: visit.client.name,
              serviceType: visit.serviceType,
              application,
              statusConfig,
            },
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

  function renderEventContent(eventInfo: EventContentArg) {
    const props = eventInfo.event.extendedProps;
    const config: StatusStyle = props.statusConfig || STATUS_CONFIG.SKIPPED;
    const isCompleted = props.status === 'COMPLETED';

    return (
      <div
        className="w-full h-full rounded-md transition-all overflow-hidden flex items-center px-2 py-0.5 text-xs shadow-2xs cursor-pointer min-w-0"
        style={{
          backgroundColor: config.bg,
          borderLeft: `4px solid ${config.border}`,
          color: config.text,
        }}
        title={`${props.clientName || eventInfo.event.title} (${eventInfo.timeText || ''})`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className={`h-2 w-2 rounded-full shrink-0 ${config.dot}`} />
          <div className={`font-extrabold truncate min-w-0 flex-1 leading-tight text-xs tracking-tight ${isCompleted ? 'line-through opacity-85' : ''}`}>
            {props.clientName || eventInfo.event.title}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agenda</h1>
          <p className="text-muted-foreground">
            Gestioná los turnos y visitas programadas. De 07:00 a 21:00 hs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="text-xs gap-1.5 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
            onClick={() => {
              const url = `${window.location.origin}/api/calendar/ical?token=lozanor-demo`
              navigator.clipboard.writeText(url)
              toast.success("Enlace de Google Calendar copiado al portapapeles. Agregalo en Google Calendar -> Añadir por URL.")
            }}
          >
            <CalendarIcon className="h-4 w-4 text-indigo-400" />
            Sincronizar Google Calendar
          </Button>
          <Button onClick={() => openNewVisit()}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva visita
          </Button>
        </div>
      </div>

      {/* Leyenda de Estados (inspirada en la app legacy) */}
      <div className="flex flex-wrap items-center gap-3 bg-card p-3 rounded-lg border border-border shadow-sm text-xs font-medium">
        <span className="text-muted-foreground font-semibold">Estados:</span>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div
              key={key}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border shadow-2xs"
              style={{
                backgroundColor: cfg.bg,
                borderColor: cfg.border,
                color: cfg.text,
              }}
            >
              <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
              <Icon className="h-3 w-3 opacity-70" />
              <span>{cfg.label}</span>
            </div>
          );
        })}
      </div>

      <Card className="overflow-hidden border border-border bg-card p-4 shadow-md rounded-xl">
        <style
          dangerouslySetInnerHTML={{
            __html: `
          .fc { font-family: inherit; }
          .fc-theme-standard td, .fc-theme-standard th { border-color: var(--border); }
          .fc-theme-standard .fc-scrollgrid { border-color: var(--border); border-radius: 0.5rem; }
          .fc-header-toolbar { margin-bottom: 1rem !important; gap: 0.5rem; flex-wrap: wrap; }
          .fc-toolbar-title { font-size: 1.25rem !important; font-weight: 700 !important; color: var(--foreground); text-transform: capitalize; }
          .fc-button-primary {
            background-color: var(--background) !important;
            border-color: var(--border) !important;
            color: var(--foreground) !important;
            font-weight: 600 !important;
            font-size: 0.875rem !important;
            padding: 0.4rem 0.8rem !important;
            border-radius: 0.5rem !important;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
            transition: all 0.15s ease !important;
          }
          .fc-button-primary:hover {
            background-color: var(--accent) !important;
            border-color: var(--border) !important;
            color: var(--accent-foreground) !important;
          }
          .fc-button-primary:not(:disabled):active, .fc-button-primary:not(:disabled).fc-button-active {
            background-color: var(--primary) !important;
            border-color: var(--primary) !important;
            color: var(--primary-foreground) !important;
          }
          .fc-day-today { background-color: rgba(99, 102, 241, 0.04) !important; }
          .fc-timegrid-slot { height: 2.5rem !important; }
          .fc-timegrid-slot-label { font-size: 0.75rem; font-weight: 600; color: var(--muted-foreground); }
          .fc-col-header-cell { padding: 8px 0 !important; }
          .fc-col-header-cell-cushion { color: var(--foreground); font-weight: 600; font-size: 0.875rem; text-decoration: none !important; }
          .fc-timegrid-event { min-height: 24px !important; border-radius: 0.375rem !important; }
          .fc-timegrid-event-short .fc-event-main, .fc-timegrid-event .fc-event-main {
            padding: 0 !important;
            display: flex !important;
            align-items: center !important;
            overflow: hidden !important;
          }
          .fc-event-main-frame { display: flex !important; align-items: center !important; width: 100% !important; height: 100% !important; }
          .fc-event {
            cursor: pointer;
            border-radius: 6px !important;
            border: none !important;
            box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.08) !important;
            transition: transform 0.15s ease, box-shadow 0.15s ease !important;
            overflow: hidden !important;
          }
          .fc-event:hover {
            transform: translateY(-1px) scale(1.01);
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.12) !important;
            z-index: 10 !important;
          }
          .fc-v-event, .fc-h-event { background-color: transparent !important; }
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
          slotMaxTime="21:00:00"
          slotDuration="01:00:00"
          slotLabelInterval="01:00:00"
          expandRows={true}
          allDaySlot={false}
          nowIndicator
          editable
          selectable
          selectMirror
          dayMaxEvents
          eventContent={renderEventContent}
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

