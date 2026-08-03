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
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700">
          <User className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Portal del Cliente</h1>
          <p className="text-muted-foreground">
            Bienvenido, <span className="font-semibold text-foreground">{summary?.client?.name || 'Cliente'}</span>. 
            Acá podés consultar tus próximas visitas y solicitar asistencia.
          </p>
        </div>
      </div>

      {/* Nueva Solicitud */}
      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="h-5 w-5 text-blue-600" />
            Solicitar Turno o Visita Especial
          </CardTitle>
          <CardDescription>
            Enviale una solicitud directa a nuestro equipo administrativo para coordinar fecha y horario.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      {/* Próximas Visitas */}
      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Próximos Turnos Agendados
          </CardTitle>
          <CardDescription>Visitas confirmadas o en proceso de agendamiento para tu domicilio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Cargando tus turnos…</p>}

          {!isLoading && summary?.upcomingVisits.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No tenés visitas agendadas próximamente.
            </p>
          )}

          {summary?.upcomingVisits.map((visit) => (
            <div
              key={visit.id}
              className="flex items-center justify-between p-3 rounded-xl border border-border bg-background text-xs"
            >
              <div className="space-y-1">
                <span className="font-bold text-foreground block">
                  {visit.serviceType || 'Servicio Agendado'}
                </span>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {visit.scheduledAt ? new Date(visit.scheduledAt).toLocaleString('es-AR') : 'Por confirmar'}
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-full font-bold bg-blue-100 text-blue-800">
                {visit.status === 'CONFIRMED' ? 'Confirmado' : 'Por Confirmar'}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Historial de Servicios */}
      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Historial de Servicios Realizados
          </CardTitle>
          <CardDescription>Registro de visitas anteriores completadas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {summary?.historyVisits.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay historial de visitas completadas guardado.
            </p>
          ) : (
            summary?.historyVisits.map((visit) => (
              <div
                key={visit.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-background text-xs"
              >
                <div>
                  <span className="font-semibold text-foreground block">
                    {visit.serviceType || 'Servicio Completado'}
                  </span>
                  <span className="text-muted-foreground">
                    {visit.scheduledAt ? new Date(visit.scheduledAt).toLocaleDateString('es-AR') : ''}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                  <CheckCircle2 className="h-4 w-4" /> Completada
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
