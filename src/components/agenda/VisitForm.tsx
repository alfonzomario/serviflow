"use client"

import * as React from "react"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { formatDate, toDateTimeLocalValue } from "@/lib/format"
import { useTenantLabels } from "@/hooks/useTenantLabels"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const VISIT_STATUSES = [
  { value: "PENDING_CONFIRM", label: "Sin confirmar" },
  { value: "CONFIRMED", label: "Confirmada" },
  { value: "COMPLETED", label: "Completada" },
  { value: "CANCELLED", label: "Cancelada" },
  { value: "SKIPPED", label: "Omitida" },
] as const

export type VisitFormValues = {
  clientId: string
  scheduledAt: string
  durationMinutes: number
  serviceType: string
  status: string
  price: number
  assignedUserId: string
  notes: string
}

interface VisitFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editing an existing visit when set, creating otherwise. */
  visitId?: string | null
  /** Pre-filled slot when the user drag-selects on the calendar. */
  defaultStart?: Date | null
  defaultDurationMinutes?: number
  /** Pre-selected client, used when scheduling straight from Pendientes. */
  defaultClientId?: string
  /**
   * Job context when scheduling a missing application from Pendientes. Without
   * `jobId` the new visit would not belong to the job and the pendiente would
   * never clear.
   */
  defaultJob?: {
    jobId: string
    applicationNumber: number
    totalApplications: number
    serviceType: string | null
  }
  /** CONTRACT when scheduling a monthly abono, so it covers the month. */
  defaultVisitType?: "CONTRACT" | "SPECIAL"
  /** An existing dateless visit being given a slot, rather than a new one. */
  scheduleVisitId?: string | null
  onSaved?: () => void
}

const UNASSIGNED = "__unassigned__"

export function VisitForm({
  open,
  onOpenChange,
  visitId,
  defaultStart,
  defaultDurationMinutes = 45,
  defaultClientId,
  defaultJob,
  defaultVisitType = "SPECIAL",
  scheduleVisitId,
  onSaved,
}: VisitFormProps) {
  // Giving a slot to an existing dateless visit is an edit, not a create.
  const editingId = visitId ?? scheduleVisitId ?? null
  const isEditing = Boolean(editingId)
  const utils = trpc.useUtils()
  const labels = useTenantLabels()

  const clients = trpc.clients.options.useQuery(undefined, { enabled: open })
  const operators = trpc.users.assignable.useQuery(undefined, { enabled: open })
  const serviceTypes = trpc.tenant.serviceTypes.useQuery(undefined, { enabled: open })
  const existingVisit = trpc.visits.getById.useQuery(
    { id: editingId! },
    { enabled: open && Boolean(editingId) }
  )

  const [values, setValues] = React.useState<VisitFormValues>(() => emptyValues())
  const [error, setError] = React.useState<string | null>(null)
  // Opening a multi-visit job from here: this visit becomes its application 1.
  // Only offered when creating a standalone visit — an application of an
  // existing job cannot itself open another one.
  const [isMultiVisit, setIsMultiVisit] = React.useState(false)
  const [totalApplications, setTotalApplications] = React.useState(2)

  function emptyValues(): VisitFormValues {
    return {
      clientId: defaultClientId ?? "",
      scheduledAt: toDateTimeLocalValue(defaultStart ?? new Date()),
      durationMinutes: defaultDurationMinutes,
      serviceType: defaultJob?.serviceType ?? "",
      status: "PENDING_CONFIRM",
      price: 0,
      assignedUserId: UNASSIGNED,
      notes: "",
    }
  }

  const set = <K extends keyof VisitFormValues>(key: K, value: VisitFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  // Load the visit being edited, or reset to a blank slot when creating.
  React.useEffect(() => {
    if (!open) return
    setError(null)

    if (!editingId) {
      setValues(emptyValues())
      setIsMultiVisit(false)
      setTotalApplications(2)
      return
    }

    const visit = existingVisit.data
    if (visit) {
      setValues({
        clientId: visit.clientId,
        scheduledAt: toDateTimeLocalValue(visit.scheduledAt ?? defaultStart ?? new Date()),
        durationMinutes: visit.durationMinutes,
        serviceType: visit.serviceType ?? "",
        status: visit.status,
        price: Number(visit.price),
        assignedUserId: visit.assignedUserId ?? UNASSIGNED,
        notes: visit.notes ?? "",
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId, existingVisit.data])

  // Advisory: is this date too close to the previous application? Read-only —
  // the user can save anyway.
  const gapWarning = trpc.visits.applicationGapWarning.useQuery(
    {
      jobId: defaultJob?.jobId ?? "",
      applicationNumber: defaultJob?.applicationNumber ?? null,
      scheduledAt: new Date(values.scheduledAt),
    },
    {
      enabled:
        open &&
        Boolean(defaultJob?.jobId) &&
        Boolean(values.scheduledAt) &&
        (defaultJob?.applicationNumber ?? 0) > 1,
    }
  )

  // Suggest the last price charged to this client when creating a visit.
  const suggestedPrice = trpc.visits.suggestedPrice.useQuery(
    { clientId: values.clientId },
    { enabled: open && !isEditing && Boolean(values.clientId) }
  )

  React.useEffect(() => {
    if (isEditing) return
    if (values.price === 0 && suggestedPrice.data?.price) {
      set("price", suggestedPrice.data.price)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedPrice.data, isEditing])

  const invalidate = async () => {
    await Promise.all([
      utils.visits.invalidate(),
      utils.dashboard.invalidate(),
    ])
    onSaved?.()
  }

  const createVisit = trpc.visits.create.useMutation({
    onSuccess: async () => {
      toast.success("Visita creada")
      await invalidate()
      onOpenChange(false)
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  const updateVisit = trpc.visits.update.useMutation({
    onError: (mutationError) => setError(mutationError.message),
  })

  const updateStatus = trpc.visits.updateStatus.useMutation({
    onError: (mutationError) => setError(mutationError.message),
  })

  const deleteVisit = trpc.visits.delete.useMutation({
    onSuccess: async () => {
      toast.success("Visita eliminada")
      await invalidate()
      onOpenChange(false)
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!values.clientId) {
      setError("Elegí un cliente")
      return
    }

    const payload = {
      clientId: values.clientId,
      scheduledAt: new Date(values.scheduledAt),
      durationMinutes: Number(values.durationMinutes),
      serviceType: values.serviceType || null,
      price: Number(values.price),
      assignedUserId: values.assignedUserId === UNASSIGNED ? null : values.assignedUserId,
      notes: values.notes || null,
    }

    if (!isEditing) {
      createVisit.mutate({
        ...payload,
        status: values.status as "PENDING_CONFIRM",
        visitType: defaultVisitType,
        // Book it into the job it belongs to, so the pendiente clears. The
        // server pulls the request link and the visit type off the job.
        ...(defaultJob && {
          jobId: defaultJob.jobId,
          applicationNumber: defaultJob.applicationNumber,
        }),
        // Or open a brand new job with this visit as its first application.
        ...(!defaultJob &&
          isMultiVisit && {
            newJobApplications: totalApplications,
            applicationNumber: 1,
          }),
      })
      return
    }

    await updateVisit.mutateAsync({ id: editingId!, ...payload })

    // Status moves through the state machine, so it is a separate call and is
    // only sent when it actually changed.
    if (existingVisit.data && existingVisit.data.status !== values.status) {
      try {
        await updateStatus.mutateAsync({
          id: editingId!,
          status: values.status as "CONFIRMED",
        })
      } catch {
        return // the error message is already on screen
      }
    }

    toast.success("Visita actualizada")
    await invalidate()
    onOpenChange(false)
  }

  const isSaving =
    createVisit.isPending || updateVisit.isPending || updateStatus.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar visita" : "Nueva visita"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modificá los datos del turno y guardá los cambios."
              : "Cargá un turno en la agenda."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="clientId">Cliente</Label>
            <Select value={values.clientId} onValueChange={(value) => set("clientId", value)}>
              <SelectTrigger id="clientId">
                <SelectValue placeholder="Elegí un cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients.data?.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="scheduledAt">Fecha y hora</Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={values.scheduledAt}
                onChange={(event) => set("scheduledAt", event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="durationMinutes">Duración (min)</Label>
              <Input
                id="durationMinutes"
                type="number"
                min={5}
                max={600}
                step={5}
                value={values.durationMinutes}
                onChange={(event) => set("durationMinutes", Number(event.target.value))}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="serviceType">Tipo de servicio</Label>
              <Input
                id="serviceType"
                list="service-types"
                placeholder="Fumigación Control"
                value={values.serviceType}
                onChange={(event) => set("serviceType", event.target.value)}
              />
              <datalist id="service-types">
                {serviceTypes.data?.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="price">Precio</Label>
              <Input
                id="price"
                type="number"
                min={0}
                step={500}
                value={values.price}
                onChange={(event) => set("price", Number(event.target.value))}
              />
              {!isEditing && suggestedPrice.data?.price ? (
                <p className="text-xs text-muted-foreground">
                  Último cobrado a este cliente: ${suggestedPrice.data.price}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="status">Estado</Label>
              <Select value={values.status} onValueChange={(value) => set("status", value)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIT_STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="assignedUserId">Asignada a</Label>
              <Select
                value={values.assignedUserId}
                onValueChange={(value) => set("assignedUserId", value)}
              >
                <SelectTrigger id="assignedUserId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Sin asignar</SelectItem>
                  {operators.data?.map((operator) => (
                    <SelectItem key={operator.id} value={operator.id}>
                      {operator.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {defaultJob ? (
            <p className="rounded-md bg-indigo-500/10 px-3 py-2 text-sm text-indigo-700">
              Aplicación <strong>{defaultJob.applicationNumber}</strong> de{" "}
              <strong>{defaultJob.totalApplications}</strong> de un{" "}
              {labels.multiVisit.toLowerCase()} ya abierto.
            </p>
          ) : !isEditing ? (
            <div className="rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={isMultiVisit}
                  onChange={(event) => setIsMultiVisit(event.target.checked)}
                />
                Es un {labels.multiVisit.toLowerCase()} de varias visitas
              </label>

              {isMultiVisit && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Label htmlFor="totalApplications" className="text-sm font-normal">
                    Cantidad de aplicaciones
                  </Label>
                  <Input
                    id="totalApplications"
                    type="number"
                    min={2}
                    max={60}
                    className="w-20"
                    value={totalApplications}
                    onChange={(event) =>
                      setTotalApplications(Number(event.target.value))
                    }
                  />
                  <p className="w-full text-xs text-muted-foreground">
                    Esta visita queda como la aplicación 1. Las{" "}
                    {Math.max(0, totalApplications - 1)} restantes aparecen en Pendientes
                    para que las agendes cuando corresponda — nunca se agendan solas.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              rows={3}
              placeholder="Detalles del trabajo, accesos, observaciones…"
              value={values.notes}
              onChange={(event) => set("notes", event.target.value)}
            />
          </div>

          {gapWarning.data && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
              Es {gapWarning.data.daysShort}{" "}
              {gapWarning.data.daysShort === 1 ? "día" : "días"} antes de lo
              recomendado. Convendría hacerla a partir del{" "}
              <strong>{formatDate(gapWarning.data.earliestAt)}</strong>. Podés guardar igual.
            </p>
          )}

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="sm:justify-between">
            {isEditing ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={deleteVisit.isPending}
                onClick={() => deleteVisit.mutate({ id: editingId! })}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </Button>
            ) : (
              <span />
            )}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
