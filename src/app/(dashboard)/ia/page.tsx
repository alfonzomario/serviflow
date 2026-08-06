'use client';

import { useState } from 'react';
import { Sparkles, Calendar, MapPin, AlertCircle, CheckCircle2, ShieldAlert, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VisitForm } from '@/components/agenda/VisitForm';

export default function IAPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);

  const { data: recData, isLoading: loadingRecs } = trpc.ai.getRecommendations.useQuery();
  const { data: insightsData } = trpc.ai.getInsights.useQuery();
  const { data: routeData } = trpc.ai.optimizeRoute.useQuery({});

  function handleScheduleSuggestion(date: Date) {
    setSelectedStart(date);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative rounded-3xl overflow-hidden p-6
        bg-gradient-to-br from-indigo-900/60 via-blue-900/40 to-[hsl(var(--background))]
        border border-indigo-500/20 shadow-xl shadow-indigo-500/10">
        {/* Decorative orb */}
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full
          bg-indigo-500/20 blur-3xl pointer-events-none" />
        <div className="flex flex-col gap-2 relative z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-indigo-400 animate-pulse" />
            <h1 className="text-2xl font-extrabold tracking-tight">Asesor IA</h1>
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-xl">
            Sugerencias inteligentes de agendamiento, optimización de recorridos y salud operativa de tu negocio.
          </p>
        </div>
      </div>

      {/* Control humano banner */}
      <div className="flex items-start gap-3 bg-indigo-500/10 border border-indigo-500/25 text-[hsl(var(--foreground)/0.9)] p-4 rounded-2xl text-sm backdrop-blur-sm">
        <ShieldAlert className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold block mb-0.5">Control y Asistencia Humana</span>
          El Asesor IA evalúa cadencias y recorridos para proponer las fechas más convenientes. 
          <strong> La aplicación nunca agendará ni modificará un turno sola; vos tenés el control final.</strong>
        </div>
      </div>

      {/* KPI Insights */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/0.6)] backdrop-blur-md
          hover:border-[hsl(var(--primary)/0.4)] transition-all p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground)/0.7)] mb-1">Clientes Activos</p>
          <p className="text-3xl font-extrabold tracking-tight">{insightsData?.activeClients ?? 0}</p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Clientes registrados con cadencia de servicio.
          </p>
        </div>

        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/0.6)] backdrop-blur-md
          hover:border-[hsl(var(--primary)/0.4)] transition-all p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground)/0.7)] mb-1">Trabajos en Seguimiento</p>
          <p className="text-3xl font-extrabold tracking-tight">{insightsData?.jobsInFollowUp ?? 0}</p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Trabajos multi-visita con aplicaciones pendientes.
          </p>
        </div>

        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/0.6)] backdrop-blur-md
          hover:border-[hsl(var(--primary)/0.4)] transition-all p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground)/0.7)] mb-1">Cumplimiento de Agenda</p>
          <p className={`text-3xl font-extrabold tracking-tight ${
            (insightsData?.healthScore ?? 100) > 80 ? 'text-emerald-400' :
            (insightsData?.healthScore ?? 100) > 50 ? 'text-amber-400' : 'text-red-400'
          }`}>
            {insightsData?.healthScore ?? 100}%
          </p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Proporción de turnos agendados a tiempo.
          </p>
        </div>
      </div>

      {/* Sugerencias de Agendamiento */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
        <div className="px-5 pt-5 pb-3">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Calendar className="h-5 w-5 text-indigo-400" />
            Propuestas de Agendamiento Prioritario
          </h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            Clientes que requieren agendar turno por vencimiento o cadencia recomendada.
          </p>
        </div>
        <div className="px-5 pb-5 space-y-3">
          {loadingRecs && <p className="text-sm text-[hsl(var(--muted-foreground))]">Analizando historial de visitas…</p>}

          {!loadingRecs && recData?.suggestions.length === 0 && (
            <div className="text-center py-6 text-[hsl(var(--muted-foreground))] text-sm flex flex-col items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              ¡Excelente! No hay visitas prioritarias pendientes de sugerencia.
            </div>
          )}

          {recData?.suggestions.map((sug) => (
            <div
              key={sug.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl
                border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)] gap-4
                hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/10 transition-all duration-200"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[hsl(var(--foreground))]">{sug.clientName}</span>
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                      sug.priority === 'HIGH'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/25'
                        : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25'
                    }`}
                  >
                    {sug.priority === 'HIGH' ? 'Prioridad Alta' : 'Sugerido'}
                  </span>
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {sug.clientAddress}
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground)/0.8)] font-medium">{sug.reason}</p>
              </div>

              <Button
                size="sm"
                onClick={() => handleScheduleSuggestion(sug.suggestedDate)}
                className="shrink-0 bg-gradient-to-r from-indigo-600 to-blue-600
                  hover:from-indigo-500 hover:to-blue-500 text-white font-semibold rounded-xl
                  shadow-lg shadow-indigo-500/25 border-none"
              >
                Agendar Turno
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Recorrido del día */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
        <div className="px-5 pt-5 pb-3">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <MapPin className="h-5 w-5 text-indigo-400" />
            Recorrido Sugerido del Día
          </h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            Secuencia sugerida para minimizar traslados entre visitas del día.
          </p>
        </div>
        <div className="px-5 pb-5">
          {routeData?.optimizedRoute.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">
              No hay visitas agendadas para el día de hoy.
            </p>
          ) : (
            <div className="space-y-2">
              {routeData?.optimizedRoute.map((item) => (
                <div
                  key={item.visitId}
                  className="flex items-center gap-3 p-3 rounded-xl border border-[hsl(var(--border))]
                    bg-[hsl(var(--secondary)/0.3)] text-xs"
                >
                  <div className="h-7 w-7 rounded-full shrink-0 flex items-center justify-center font-bold text-white
                    bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-indigo-500/30">
                    {item.sequenceOrder}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-[hsl(var(--foreground))] block truncate">{item.clientName}</span>
                    <span className="text-[hsl(var(--muted-foreground))] truncate block">{item.address}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <VisitForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        visitId={null}
        defaultStart={selectedStart}
        defaultDurationMinutes={45}
      />
    </div>
  );
}
