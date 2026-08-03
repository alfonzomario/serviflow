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
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-7 w-7 text-indigo-600 animate-pulse" />
          <h1 className="text-3xl font-bold tracking-tight">Asesor IA</h1>
        </div>
        <p className="text-muted-foreground">
          Sugerencias inteligentes de agendamiento, optimización de recorridos y salud operativa de tu negocio.
        </p>
      </div>

      {/* Banner Informativo sobre Control Humano */}
      <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 text-indigo-900 p-4 rounded-xl text-sm">
        <ShieldAlert className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold block mb-0.5">Control y Asistencia Humana</span>
          El Asesor IA evalúa cadencias y recorridos para proponer las fechas más convenientes. 
          <strong> La aplicación nunca agendará ni modificará un turno sola; vos tenés el control final.</strong>
        </div>
      </div>

      {/* KPI Insights Grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-card shadow-sm border border-border">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase">Clientes Activos</CardDescription>
            <CardTitle className="text-2xl font-bold">{insightsData?.activeClients ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            Monitoreados continuamente por el algoritmo.
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border border-border">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase">Trabajos en Seguimiento</CardDescription>
            <CardTitle className="text-2xl font-bold">{insightsData?.jobsInFollowUp ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            Trabajos multi-visita con aplicaciones pendientes.
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border border-border">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase">Salud Operativa</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600">
              {insightsData?.healthScore ?? 100}%
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            Nivel de cumplimiento de fechas de cadencia.
          </CardContent>
        </Card>
      </div>

      {/* Sugerencias de Agendamiento */}
      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-indigo-600" />
            Propuestas de Agendamiento Prioritario
          </CardTitle>
          <CardDescription>
            Clientes que requieren agendar turno por vencimiento o cadencia recomendada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingRecs && <p className="text-sm text-muted-foreground">Analizando historial de visitas…</p>}

          {!loadingRecs && recData?.suggestions.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-sm flex flex-col items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              ¡Excelente! No hay visitas prioritarias pendientes de sugerencia.
            </div>
          )}

          {recData?.suggestions.map((sug) => (
            <div
              key={sug.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-background gap-4 hover:border-indigo-300 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">{sug.clientName}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      sug.priority === 'HIGH'
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-indigo-100 text-indigo-900 border-indigo-300'
                    }`}
                  >
                    {sug.priority === 'HIGH' ? 'Prioridad Alta' : 'Sugerido'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {sug.clientAddress}
                </p>
                <p className="text-xs text-slate-600 font-medium">{sug.reason}</p>
              </div>

              <Button
                size="sm"
                onClick={() => handleScheduleSuggestion(sug.suggestedDate)}
                className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Agendar Turno
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Optimización de Rutas */}
      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin className="h-5 w-5 text-indigo-600" />
            Recorrido Sugerido del Día
          </CardTitle>
          <CardDescription>
            Secuencia sugerida para minimizar traslados entre visitas del día.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {routeData?.optimizedRoute.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay visitas agendadas para el día de hoy.
            </p>
          ) : (
            <div className="space-y-2">
              {routeData?.optimizedRoute.map((item) => (
                <div
                  key={item.visitId}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background text-xs"
                >
                  <div className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0">
                    {item.sequenceOrder}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-foreground block truncate">{item.clientName}</span>
                    <span className="text-muted-foreground truncate block">{item.address}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
