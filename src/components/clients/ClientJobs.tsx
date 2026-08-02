"use client"

import * as React from "react"
import { toast } from "sonner"
import { CheckCircle2, Repeat, RotateCcw, XCircle } from "lucide-react"

import { trpc } from "@/lib/trpc"
import { formatDate } from "@/lib/format"
import { useTenantLabels } from "@/hooks/useTenantLabels"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"

/**
 * The client's multi-visit jobs.
 *
 * The one thing this screen exists for is changing how many applications a job
 * has *after* it started — the case the old denormalised shape could not
 * survive. Everything else (booking the next application) happens in
 * Pendientes, because that is where the user decides on dates.
 */
export function ClientJobs({ clientId }: { clientId: string }) {
  const labels = useTenantLabels()
  const utils = trpc.useUtils()

  const [showClosed, setShowClosed] = React.useState(false)
  const [closing, setClosing] = React.useState<{ id: string; remaining: number } | null>(
    null
  )
  /** Job id currently being re-sized, with its draft value. */
  const [editing, setEditing] = React.useState<{ id: string; total: number } | null>(null)

  const jobs = trpc.jobs.byClient.useQuery({ clientId, includeClosed: showClosed })

  const refresh = async () => {
    await Promise.all([utils.jobs.invalidate(), utils.visits.invalidate()])
  }

  const updateJob = trpc.jobs.update.useMutation({
    onSuccess: async () => {
      toast.success("Cantidad actualizada")
      await refresh()
      setEditing(null)
    },
    onError: (error) => toast.error(error.message),
  })

  const closeJob = trpc.jobs.close.useMutation({
    onSuccess: async () => {
      toast.success(`${labels.multiVisit} cerrado`)
      await refresh()
      setClosing(null)
    },
    onError: (error) => {
      toast.error(error.message)
      setClosing(null)
    },
  })

  const reopenJob = trpc.jobs.reopen.useMutation({
    onSuccess: async () => {
      toast.success(`${labels.multiVisit} reabierto`)
      await refresh()
    },
    onError: (error) => toast.error(error.message),
  })

  const items = jobs.data ?? []

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-indigo-500" />
          <h2 className="font-semibold">{labels.multiVisit}s de varias visitas</h2>
          {items.length > 0 && <Badge variant="secondary">{items.length}</Badge>}
        </div>

        <Button variant="ghost" size="sm" onClick={() => setShowClosed((value) => !value)}>
          {showClosed ? "Ver solo abiertos" : "Ver también los cerrados"}
        </Button>
      </div>

      {jobs.isLoading ? (
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
      ) : items.length === 0 ? (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">
            {showClosed
              ? "Este cliente no tiene trabajos de varias visitas."
              : `Ningún ${labels.multiVisit.toLowerCase()} abierto. Se crean al cargar una visita o al agendar una solicitud.`}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((job) => {
            const scheduled = job.visits.filter((visit) => visit.scheduledAt !== null).length
            const remaining = Math.max(0, job.totalApplications - scheduled)
            const isClosed = job.closedAt !== null
            const isEditing = editing?.id === job.id

            return (
              <Card key={job.id} className={isClosed ? "p-4 opacity-60" : "p-4"}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{job.serviceType ?? labels.multiVisit}</h3>
                      {isClosed ? (
                        <Badge variant="outline" className="border-none bg-slate-500/10">
                          Cerrado el {formatDate(job.closedAt!)}
                        </Badge>
                      ) : remaining === 0 ? (
                        <Badge
                          variant="outline"
                          className="border-none bg-emerald-500/10 text-emerald-600"
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Completo
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          Faltan {remaining} de {job.totalApplications}
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Abierto el {formatDate(job.createdAt)} · {scheduled} agendada
                      {scheduled === 1 ? "" : "s"}
                    </p>

                    {job.visits.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {job.visits.map((visit) => (
                          <Badge key={visit.id} variant="outline" className="font-normal">
                            {visit.applicationNumber ?? "?"}:{" "}
                            {visit.scheduledAt ? formatDate(visit.scheduledAt) : "sin fecha"}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {isEditing && (
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <Label htmlFor={`total-${job.id}`} className="text-sm font-normal">
                          Cantidad de aplicaciones
                        </Label>
                        <Input
                          id={`total-${job.id}`}
                          type="number"
                          min={1}
                          max={60}
                          className="w-20"
                          value={editing.total}
                          onChange={(event) =>
                            setEditing({ id: job.id, total: Number(event.target.value) })
                          }
                        />
                        <Button
                          size="sm"
                          disabled={updateJob.isPending}
                          onClick={() =>
                            updateJob.mutate({ id: job.id, totalApplications: editing.total })
                          }
                        >
                          Guardar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Cancelar
                        </Button>
                        {editing.total < scheduled && (
                          <p className="w-full text-xs text-amber-600">
                            Ya hay {scheduled} agendadas. Bajar a {editing.total} no borra
                            ninguna: solo deja de pedir las que faltan.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {isClosed ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reopenJob.isPending}
                        onClick={() => reopenJob.mutate({ id: job.id })}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Reabrir
                      </Button>
                    ) : (
                      <>
                        {!isEditing && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEditing({ id: job.id, total: job.totalApplications })
                            }
                          >
                            Cambiar cantidad
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setClosing({ id: job.id, remaining })}
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Cerrar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(closing)}
        onOpenChange={(open) => !open && setClosing(null)}
        title={`¿Cerrar este ${labels.multiVisit.toLowerCase()}?`}
        description={`Dejan de pedirse las ${closing?.remaining ?? 0} aplicaciones que faltan. Las visitas ya agendadas quedan como están, y podés reabrirlo después.`}
        confirmLabel="Cerrar"
        isPending={closeJob.isPending}
        onConfirm={() => closing && closeJob.mutate({ id: closing.id })}
      />
    </section>
  )
}
