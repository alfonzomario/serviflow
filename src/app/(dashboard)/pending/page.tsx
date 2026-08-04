"use client"

import * as React from "react"
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Phone,
  Repeat,
  CheckCheck,
  XCircle,
  Trash2,
} from "lucide-react"

import { toast } from "sonner"

import { trpc } from "@/lib/trpc"
import { formatDate, formatPhone } from "@/lib/format"
import { describeCadence } from "@/server/lib/industries"
import { useTenantLabels } from "@/hooks/useTenantLabels"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/shared/EmptyState"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { VisitForm } from "@/components/agenda/VisitForm"

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

export default function PendingPage() {
  const [month, setMonth] = React.useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [prefill, setPrefill] = React.useState<{
    clientId: string
    start: Date
    job?: React.ComponentProps<typeof VisitForm>["defaultJob"]
    visitId?: string
    visitType?: "CONTRACT" | "SPECIAL"
  } | null>(null)

  const labels = useTenantLabels()
  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.visits.pending.useQuery({ month })

  const [settling, setSettling] = React.useState<{
    clientId: string
    clientName: string
    dueAt: Date
  } | null>(null)

  const [closingJob, setClosingJob] = React.useState<{
    jobId: string
    clientName: string
    remaining: number
  } | null>(null)

  // Closes a multi-visit job early. The applications still missing stop being
  // owed; what is already on the calendar is left alone.
  const closeJob = trpc.jobs.close.useMutation({
    onSuccess: async () => {
      toast.success(`${labels.multiVisit} cerrado`)
      await utils.visits.invalidate()
      setClosingJob(null)
    },
    onError: (error) => {
      toast.error(error.message)
      setClosingJob(null)
    },
  })

  // Closes a period without booking anything: records it as omitted.
  const settlePeriod = trpc.visits.settlePeriod.useMutation({
    onSuccess: async () => {
      toast.success("Período saldado")
      await utils.visits.invalidate()
      setSettling(null)
    },
    onError: (error) => {
      toast.error(error.message)
      setSettling(null)
    },
  })

  const shiftMonth = (delta: number) =>
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))

  /** Opens the visit dialog on tomorrow at 9am, carrying whatever context the row has. */
  function scheduleFor(
    clientId: string,
    extra: {
      job?: React.ComponentProps<typeof VisitForm>["defaultJob"]
      visitId?: string
      visitType?: "CONTRACT" | "SPECIAL"
    } = {}
  ) {
    const start = new Date()
    start.setDate(start.getDate() + 1)
    start.setHours(9, 0, 0, 0)
    setPrefill({ clientId, start, ...extra })
    setDialogOpen(true)
  }

  const [viewMode, setViewMode] = React.useState<"list" | "grid">("list")

  const items = data?.items ?? []
  const recurring = items.filter((item) => item.kind === "RECURRING_SERVICE")
  const applications = items.filter((item) => item.kind === "MISSING_APPLICATION")
  const unscheduled = items.filter((item) => item.kind === "UNSCHEDULED_VISIT")

  const scheduleButton = (
    clientId: string,
    extra?: Parameters<typeof scheduleFor>[1]
  ) => (
    <Button size="sm" className="shrink-0" onClick={() => scheduleFor(clientId, extra)}>
      <CalendarPlus className="mr-2 h-4 w-4" />
      Agendar
    </Button>
  )

  const [selectedJobIds, setSelectedJobIds] = React.useState<string[]>([])

  const bulkDeleteJobs = trpc.jobs.deleteMany.useMutation({
    onSuccess: async (res) => {
      toast.success(`${res.count} aplicaciones de tratamientos eliminadas`)
      setSelectedJobIds([])
      await utils.visits.invalidate()
    },
    onError: (err) => toast.error(err.message),
  })

  const toggleSelectJob = (jobId: string) => {
    setSelectedJobIds((current) =>
      current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId]
    )
  }

  const toggleSelectAllJobs = () => {
    const allJobIds = applications
      .filter((item): item is typeof item & { kind: "MISSING_APPLICATION" } => item.kind === "MISSING_APPLICATION")
      .map((item) => item.jobId)

    if (selectedJobIds.length === allJobIds.length) {
      setSelectedJobIds([])
    } else {
      setSelectedJobIds(allJobIds)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Pendientes</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Lo que falta agendar. Al darle fecha desaparece de acá; si se elimina del calendario, vuelve.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[hsl(var(--secondary)/0.5)] p-1 rounded-xl border border-[hsl(var(--border))]">
          <Button variant="ghost" size="icon" onClick={() => shiftMonth(-1)} aria-label="Mes anterior" className="rounded-lg h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-36 text-center text-xs font-bold uppercase tracking-wider text-[hsl(var(--foreground))]">
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </span>
          <Button variant="ghost" size="icon" onClick={() => shiftMonth(1)} aria-label="Mes siguiente" className="rounded-lg h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={CheckCircle2}
            title="Todo al día"
            description="No queda nada por agendar para este mes."
          />
        </Card>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-sky-500" />
              <h2 className="font-semibold">{labels.recurring} sin visita del período</h2>
              <Badge variant="secondary">{recurring.length}</Badge>
            </div>

            {recurring.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {`Ningún ${labels.recurring.toLowerCase()} vence en este mes.`}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {recurring.map((item) => {
                  if (item.kind !== "RECURRING_SERVICE") return null

                  return (
                    <Card
                      key={item.client.id}
                      className="rounded-2xl border-l-4 border-l-sky-500 border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-md flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-semibold text-base truncate">{item.client.name}</h3>
                          <Badge variant="outline" className="border-none bg-sky-500/10 text-sky-600 text-xs font-medium">
                            Abono de {MONTHS[month.getMonth()]}
                          </Badge>
                        </div>

                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                          {item.client.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3 shrink-0" />
                              {formatPhone(item.client.phone)}
                            </span>
                          )}
                          {item.client.address && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.client.address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-sky-400 hover:underline truncate font-medium"
                            >
                              <MapPin className="h-3 w-3 shrink-0 text-sky-500" />
                              {item.client.address}
                            </a>
                          )}
                          <span className="truncate">
                            {item.lastVisitAt
                              ? `Última visita: ${formatDate(item.lastVisitAt)}`
                              : "Sin visitas registradas"}
                          </span>
                          <span>{describeCadence(item.cadence.unit, item.cadence.interval)}</span>
                        </div>

                        {item.client.serviceTypes.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {item.client.serviceTypes.map((service) => (
                              <Badge key={service} variant="secondary" className="font-normal text-[10px]">
                                {service}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-3 mt-2 border-t border-[hsl(var(--border))/0.5]">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() =>
                            setSettling({
                              clientId: item.client.id,
                              clientName: item.client.name,
                              dueAt: new Date(item.dueAt),
                            })
                          }
                        >
                          <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
                          Saldar
                        </Button>
                        <div className="flex-1">
                          {scheduleButton(item.client.id, { visitType: "CONTRACT" })}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-indigo-500" />
                <h2 className="font-semibold">Segundas / Próximas aplicaciones de tratamientos</h2>
                <Badge variant="secondary">{applications.length}</Badge>
              </div>

              {applications.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-8"
                    onClick={toggleSelectAllJobs}
                  >
                    {selectedJobIds.length === applications.length
                      ? "Desmarcar todas"
                      : "Seleccionar todas"}
                  </Button>

                  {selectedJobIds.length > 0 && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 text-xs gap-1.5"
                      disabled={bulkDeleteJobs.isPending}
                      onClick={() => bulkDeleteJobs.mutate({ ids: selectedJobIds })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar ({selectedJobIds.length})
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs text-destructive border-destructive/20 hover:bg-destructive/10"
                    disabled={bulkDeleteJobs.isPending}
                    onClick={() => bulkDeleteJobs.mutate({})}
                  >
                    Limpiar todas las viejas
                  </Button>
                </div>
              )}
            </div>

            {applications.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay tratamientos con aplicaciones pendientes por agendar.
              </p>
            ) : (
              <div className="grid gap-3">
                {applications.map((item) => {
                  if (item.kind !== "MISSING_APPLICATION") return null
                  const isSelected = selectedJobIds.includes(item.jobId)

                  return (
                    <Card
                      key={item.jobId}
                      className={
                        isSelected
                          ? "rounded-2xl border-l-4 border-l-red-500 border-red-500/50 bg-red-500/5 p-4 shadow-md"
                          : item.notYetDue
                          ? "rounded-2xl border-l-4 border-l-indigo-500/40 border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 opacity-60"
                          : "rounded-2xl border-l-4 border-l-indigo-500 border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-md"
                      }
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3 min-w-0">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded accent-indigo-600 cursor-pointer"
                            checked={isSelected}
                            onChange={() => toggleSelectJob(item.jobId)}
                          />
                          <div className="min-w-0 space-y-1">
                            <h3 className="font-medium">{item.client.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {item.serviceType ?? "Tratamiento"} — falta agendar la aplicación{" "}
                              <strong>
                                {item.applicationNumber} de {item.totalApplications}
                              </strong>
                            </p>
                            {item.previousApplicationAt && (
                              <p className="text-xs text-muted-foreground">
                                Aplicación {item.applicationNumber - 1}:{" "}
                                {formatDate(item.previousApplicationAt)}
                              </p>
                            )}
                            {item.earliestAt && (
                              <p
                                className={
                                  item.notYetDue
                                    ? "flex items-center gap-1.5 text-xs text-muted-foreground"
                                    : "flex items-center gap-1.5 text-xs font-medium text-amber-600"
                                }
                              >
                                <Clock className="h-3 w-3" />
                                Hacerla a partir del {formatDate(item.earliestAt)}
                                {item.notYetDue && " — todavía no toca"}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setClosingJob({
                                jobId: item.jobId,
                                clientName: item.client.name,
                                remaining:
                                  item.totalApplications - item.applicationNumber + 1,
                              })
                            }
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Cerrar
                          </Button>
                          {scheduleButton(item.client.id, {
                            job: {
                              jobId: item.jobId,
                              applicationNumber: item.applicationNumber,
                              totalApplications: item.totalApplications,
                              serviceType: item.serviceType,
                            },
                          })}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </section>

          {unscheduled.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <CalendarPlus className="h-4 w-4 text-slate-500" />
                <h2 className="font-semibold">Visitas sin turno</h2>
                <Badge variant="secondary">{unscheduled.length}</Badge>
              </div>

              <div className="grid gap-3">
                {unscheduled.map((item) => {
                  if (item.kind !== "UNSCHEDULED_VISIT") return null

                  return (
                    <Card key={item.visitId} className="rounded-2xl border-l-4 border-l-slate-500 border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-md">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <h3 className="font-medium">{item.client.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {item.serviceType ?? "Servicio"} — cargada sin fecha
                          </p>
                        </div>

                        {scheduleButton(item.client.id, { visitId: item.visitId })}
                      </div>
                    </Card>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(settling)}
        onOpenChange={(open) => !open && setSettling(null)}
        title={`¿Saldar el período de ${settling?.clientName}?`}
        description="Queda registrado como omitido y deja de figurar acá. No se agenda ninguna visita. Si después lo eliminás del historial, vuelve a pendientes."
        confirmLabel="Saldar"
        isPending={settlePeriod.isPending}
        onConfirm={() =>
          settling &&
          settlePeriod.mutate({ clientId: settling.clientId, dueAt: settling.dueAt })
        }
      />

      <ConfirmDialog
        open={Boolean(closingJob)}
        onOpenChange={(open) => !open && setClosingJob(null)}
        title={`¿Cerrar el ${labels.multiVisit.toLowerCase()} de ${closingJob?.clientName}?`}
        description={`Dejan de pedirse las ${closingJob?.remaining ?? 0} aplicaciones que faltan. Las visitas ya agendadas quedan como están, y podés reabrirlo después.`}
        confirmLabel="Cerrar"
        isPending={closeJob.isPending}
        onConfirm={() => closingJob && closeJob.mutate({ id: closingJob.jobId })}
      />

      <VisitForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultStart={prefill?.start ?? null}
        defaultClientId={prefill?.clientId}
        defaultJob={prefill?.job}
        defaultVisitType={prefill?.visitType ?? "SPECIAL"}
        scheduleVisitId={prefill?.visitId ?? null}
      />
    </div>
  )
}
