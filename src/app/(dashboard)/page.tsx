"use client"

import Link from "next/link"
import { DollarSign, Clock, CheckCircle2, Users, CalendarDays, TrendingUp } from "lucide-react"

import { trpc } from "@/lib/trpc"
import { usePermissions } from "@/hooks/usePermissions"
import { formatCurrency, formatLongDateTime } from "@/lib/format"
import { KPICard } from "@/components/dashboard/KPICard"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { StatusBadge, VisitStatus } from "@/components/shared/StatusBadge"

/** Percentage change -> the shape KPICard expects. */
const toTrend = (value: number | null | undefined) => {
  if (value === null || value === undefined) return undefined
  return {
    value: `${Math.abs(value)}%`,
    direction: value > 0 ? ("up" as const) : value < 0 ? ("down" as const) : ("neutral" as const),
  }
}

export default function DashboardPage() {
  const { can } = usePermissions()
  // `monthlySummary` ya exige `finance.read` en el servidor, así que a un
  // operador le respondería 403. Se evita pedirlo para no dejar una tarjeta
  // vacía que nunca se va a llenar ni un error en la consola.
  const canSeeMoney = can("finance", "read")

  const kpis = trpc.dashboard.kpis.useQuery()
  const upcoming = trpc.dashboard.upcomingVisits.useQuery()
  const monthly = trpc.transactions.monthlySummary.useQuery(
    { months: 7 },
    { enabled: canSeeMoney }
  )

  const maxRevenue = Math.max(1, ...(monthly.data?.map((month) => month.income) ?? [0]))

  return (
    <div className="animate-in fade-in space-y-6 duration-500">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-[hsl(var(--foreground))]">Panel</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Un vistazo rápido a cómo viene el mes.
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* El servidor manda `revenue` en null a quien no puede ver finanzas.
            La tarjeta no se muestra en vez de mostrarse vacía: un "—" invita a
            preguntar por qué no carga algo que en realidad no corresponde ver. */}
        {kpis.data?.revenue !== null && (
          <KPICard
            title="Facturado este mes"
            value={kpis.data ? formatCurrency(kpis.data.revenue.value) : "—"}
            icon={DollarSign}
            trend={toTrend(kpis.data?.revenue.trend)}
            variant="primary"
          />
        )}
        <KPICard
          title="Visitas por hacer"
          value={kpis.data ? String(kpis.data.pendingVisits) : "—"}
          icon={Clock}
          variant="warning"
        />
        <KPICard
          title="Completadas este mes"
          value={kpis.data ? String(kpis.data.completedVisits.value) : "—"}
          icon={CheckCircle2}
          trend={toTrend(kpis.data?.completedVisits.trend)}
          variant="success"
        />
        <KPICard
          title="Clientes activos"
          value={kpis.data ? String(kpis.data.activeClients) : "—"}
          icon={Users}
        />
      </div>

      {/* Charts + Upcoming */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {canSeeMoney && (
          <Card
            className="lg:col-span-4 rounded-2xl border border-[hsl(var(--border))]
              bg-[hsl(var(--card))] shadow-lg overflow-hidden"
          >
            <CardHeader className="pb-0 px-6 pt-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[hsl(var(--primary)/0.8)]" />
                <CardTitle className="text-base font-bold">Ingresos por mes</CardTitle>
              </div>
              <CardDescription className="text-xs mt-0.5">Últimos 7 meses</CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              {monthly.data && monthly.data.length > 0 ? (
                <>
                  {/* Guide lines */}
                  <div className="relative flex h-[260px] items-end gap-2 pt-6 mt-4">
                    {/* Horizontal guide lines */}
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-1">
                      {[100, 75, 50, 25, 0].map((pct) => (
                        <div
                          key={pct}
                          className="w-full border-t border-[hsl(var(--border)/0.4)] relative"
                        >
                          <span className="absolute -top-2.5 -left-1 text-[9px] text-[hsl(var(--muted-foreground)/0.5)]">
                            {pct}%
                          </span>
                        </div>
                      ))}
                    </div>

                    {monthly.data.map((month) => (
                      <div
                        key={month.month}
                        className="group relative flex-1 rounded-t-lg
                          bg-gradient-to-t from-indigo-600 to-blue-400
                          transition-all duration-200 hover:from-indigo-500 hover:to-blue-300
                          shadow-sm hover:shadow-md hover:shadow-indigo-500/20"
                        style={{ height: `${Math.max(4, (month.income / maxRevenue) * 100)}%` }}
                      >
                        {/* Tooltip */}
                        <div
                          className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap
                            rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]
                            px-2.5 py-1.5 text-xs font-semibold text-[hsl(var(--foreground))]
                            shadow-xl opacity-0 transition-opacity duration-150 group-hover:opacity-100
                            pointer-events-none z-10"
                        >
                          {formatCurrency(month.income)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-between">
                    {monthly.data.map((month) => (
                      <span
                        key={month.month}
                        className="flex-1 text-center text-[10px] font-semibold uppercase tracking-wider
                          text-[hsl(var(--muted-foreground)/0.7)]"
                      >
                        {month.month.slice(5)}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">
                  Todavía no hay movimientos registrados.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card
          className={`${canSeeMoney ? "lg:col-span-3" : "lg:col-span-7"}
            rounded-2xl border border-[hsl(var(--border))]
            bg-[hsl(var(--card))] shadow-lg overflow-hidden`}
        >
          <CardHeader className="pb-0 px-6 pt-6">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[hsl(var(--primary)/0.8)]" />
              <CardTitle className="text-base font-bold">Próximas visitas</CardTitle>
            </div>
            <CardDescription className="text-xs mt-0.5">Las próximas 48 horas</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 mt-4">
            {upcoming.data && upcoming.data.length > 0 ? (
              <div className="space-y-2">
                {upcoming.data.map((visit) => (
                  <div
                    key={visit.id}
                    className="flex items-center justify-between
                      rounded-xl bg-[hsl(var(--secondary)/0.5)] p-3
                      border border-[hsl(var(--border)/0.5)]
                      hover:border-[hsl(var(--border))] transition-colors"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-sm font-semibold leading-tight text-[hsl(var(--foreground))]">
                        {visit.client.name}
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {visit.scheduledAt ? formatLongDateTime(visit.scheduledAt) : "Sin agendar"}
                      </p>
                    </div>
                    <StatusBadge status={visit.status as VisitStatus} size="sm" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="h-12 w-12 rounded-2xl bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] flex items-center justify-center">
                  <CalendarDays className="h-6 w-6 text-[hsl(var(--muted-foreground)/0.6)]" />
                </div>
                <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-[180px] leading-snug">
                  No hay visitas agendadas para las próximas 48 horas.
                </p>
                <Link
                  href="/agenda"
                  className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline"
                >
                  Ir a la agenda →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
