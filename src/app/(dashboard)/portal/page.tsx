'use client';

import { useState } from 'react';
import { User, Calendar, Clock, Send, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function PortalClientePage() {
  const [notes, setNotes] = useState('');
  const utils = trpc.useUtils();

  const { data: summary, isLoading, error } = trpc.portal.getClientSummary.useQuery();

  const createRequest = trpc.portal.createRequest.useMutation({
    onSuccess: () => {
      toast.success('Solicitud enviada con éxito');
      setNotes('');
      utils.portal.getClientSummary.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || 'No se pudo enviar la solicitud');
    },
  });

  if (error) {
    return (
      <div className="p-8 text-center space-y-3">
        <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
        <h2 className="text-xl font-bold">Portal del Cliente</h2>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Hero de bienvenida */}
      <div className="relative rounded-3xl overflow-hidden p-6 bg-gradient-to-br from-blue-900/40 to-indigo-900/20 border border-blue-500/20">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-blue-500/15 border border-blue-500/20 shadow-lg shadow-blue-500/10">
            <User className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Portal del Cliente</h1>
            <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
              Bienvenido, <span className="font-semibold text-[hsl(var(--foreground))]">{summary?.client?.name || 'Cliente'}</span>.
              Acá podés consultar tus próximas visitas y solicitar asistencia.
            </p>
          </div>
        </div>
      </div>

      {/* Nueva Solicitud */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm hover:border-blue-500/30 transition-colors">
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Send className="h-5 w-5 text-blue-400" />
            Solicitar Turno o Visita Especial
          </h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            Enviale una solicitud directa a nuestro equipo administrativo para coordinar fecha y horario.
          </p>
        </div>
        <div className="px-5 pb-5 space-y-4">
          <Input
            placeholder="Escribí tu consulta o detalle del servicio que necesitás…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="text-xs"
          />
          <Button
            disabled={!notes.trim() || createRequest.isPending}
            onClick={() => createRequest.mutate({ notes, urgency: 'MEDIUM' })}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
          >
            Enviar Solicitud
          </Button>
        </div>
      </div>

      {/* Próximas Visitas */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-400" />
            Próximos Turnos Agendados
          </h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Visitas confirmadas o en proceso de agendamiento para tu domicilio.</p>
        </div>
        <div className="px-5 pb-5 space-y-3">
          {isLoading && <p className="text-sm text-[hsl(var(--muted-foreground))]">Cargando tus turnos…</p>}

          {!isLoading && summary?.upcomingVisits.length === 0 && (
            <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">
              No tenés visitas agendadas próximamente.
            </p>
          )}

          {summary?.upcomingVisits.map((visit) => (
            <div
              key={visit.id}
              className="flex items-center justify-between p-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)] text-xs hover:border-blue-500/30 transition-colors"
            >
              <div className="space-y-1">
                <span className="font-bold text-[hsl(var(--foreground))] block">
                  {visit.serviceType || 'Servicio Agendado'}
                </span>
                <span className="text-[hsl(var(--muted-foreground))] flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {visit.scheduledAt ? new Date(visit.scheduledAt).toLocaleString('es-AR') : 'Por confirmar'}
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-full font-bold text-[10px] bg-blue-500/15 text-blue-300 border border-blue-500/20">
                {visit.status === 'CONFIRMED' ? 'Confirmado' : 'Por Confirmar'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Historial de Servicios */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-base font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-400" />
            Historial de Servicios Realizados
          </h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Registro de visitas anteriores completadas.</p>
        </div>
        <div className="px-5 pb-5 space-y-2">
          {summary?.historyVisits.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">
              No hay historial de visitas completadas guardado.
            </p>
          ) : (
            summary?.historyVisits.map((visit) => (
              <div
                key={visit.id}
                className="flex items-center justify-between p-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)] text-xs"
              >
                <div>
                  <span className="font-semibold text-[hsl(var(--foreground))] block">
                    {visit.serviceType || 'Servicio Completado'}
                  </span>
                  <span className="text-[hsl(var(--muted-foreground))]">
                    {visit.scheduledAt ? new Date(visit.scheduledAt).toLocaleDateString('es-AR') : ''}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-4 w-4" /> Completada
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
