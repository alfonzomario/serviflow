"use client"

import Link from "next/link"
import { DollarSign, Clock, CheckCircle2, Users, CalendarDays } from "lucide-react"

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
    <div className="animate-in fade-in space-y-8 duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Panel</h2>
        <p className="mt-2 text-muted-foreground">Un vistazo rápido a cómo viene el mes.</p>
      </div>

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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {canSeeMoney && (
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Ingresos por mes</CardTitle>
            <CardDescription>Últimos 7 meses</CardDescription>
          </CardHeader>
          <CardContent>
            {monthly.data && monthly.data.length > 0 ? (
              <>
                <div className="flex h-[300px] items-end gap-2 pt-4">
                  {monthly.data.map((month) => (
                    <div
                      key={month.month}
                      className="group relative w-full rounded-t-md bg-primary/20 transition-colors hover:bg-primary/30"
                      style={{ height: `${Math.max(4, (month.income / maxRevenue) * 100)}%` }}
                    >
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity group-hover:opacity-100">
                        {formatCurrency(month.income)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-between text-xs text-muted-foreground">
                  {monthly.data.map((month) => (
                    <span key={month.month}>{month.month.slice(5)}</span>
                  ))}
                </div>
              </>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Todavía no hay movimientos registrados.
              </p>
            )}
          </CardContent>
        </Card>
        )}

        <Card className={canSeeMoney ? "lg:col-span-3" : "lg:col-span-7"}>
          <CardHeader>
            <CardTitle>Próximas visitas</CardTitle>
            <CardDescription>Las próximas 48 horas</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.data && upcoming.data.length > 0 ? (
              <div className="space-y-6">
                {upcoming.data.map((visit) => (
                  <div
                    key={visit.id}
                    className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium leading-none">
                        {visit.client.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {visit.scheduledAt ? formatLongDateTime(visit.scheduledAt) : "Sin agendar"}
                      </p>
                    </div>
                    <StatusBadge status={visit.status as VisitStatus} size="sm" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <CalendarDays className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No hay visitas agendadas para las próximas 48 horas.
                </p>
                <Link href="/agenda" className="text-sm font-medium text-primary hover:underline">
                  Ir a la agenda
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
