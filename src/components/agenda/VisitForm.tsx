"use client"

import * as React from "react"
import { toast } from "sonner"
import { Trash2, CheckCircle2, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

function CalendarPickerPopover({
  value,
  onChange,
}: {
  value: string
  onChange: (newValue: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const dateVal = React.useMemo(() => (value ? new Date(value) : new Date()), [value])
  const [currentMonth, setCurrentMonth] = React.useState(() => new Date(dateVal.getFullYear(), dateVal.getMonth(), 1))

  React.useEffect(() => {
    if (value) {
      const d = new Date(value)
      if (!isNaN(d.getTime())) {
        setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1))
      }
    }
  }, [value])

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  const firstDay = new Date(year, month, 1).getDay()
  const startOffset = (firstDay + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ]
  const DAY_NAMES = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"]

  const handleSelectDay = (dayNum: number) => {
    const hours = isNaN(dateVal.getTime()) ? 9 : dateVal.getHours()
    const minutes = isNaN(dateVal.getTime()) ? 0 : dateVal.getMinutes()
    const selectedDate = new Date(year, month, dayNum, hours, minutes)
    onChange(toDateTimeLocalValue(selectedDate))
  }

  const handleTimeChange = (hours: number, minutes: number) => {
    const selectedDate = new Date(dateVal.getFullYear(), dateVal.getMonth(), dateVal.getDate(), hours, minutes)
    onChange(toDateTimeLocalValue(selectedDate))
  }

  const displayString = React.useMemo(() => {
    if (!value) return "Seleccionar fecha y hora..."
    const d = new Date(value)
    if (isNaN(d.getTime())) return "Seleccionar fecha y hora..."
    const dayStr = String(d.getDate()).padStart(2, '0')
    const monthStr = String(d.getMonth() + 1).padStart(2, '0')
    const yearStr = d.getFullYear()
    const hoursStr = String(d.getHours()).padStart(2, '0')
    const minStr = String(d.getMinutes()).padStart(2, '0')
    return `${dayStr}/${monthStr}/${yearStr} ${hoursStr}:${minStr}`
  }, [value])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between font-medium text-left h-10 px-3 border-[hsl(var(--border))] bg-background hover:bg-accent"
        >
          <span className="text-sm font-semibold">{displayString}</span>
          <span className="flex items-center gap-1 text-xs text-indigo-400 font-bold bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/20">
            <CalendarIcon className="h-3.5 w-3.5" />
            Ver mes
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 bg-card border border-border shadow-2xl rounded-2xl" align="start">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            type="button"
            onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
            {MONTH_NAMES[month]} {year}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            type="button"
            onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground uppercase mb-1">
          {DAY_NAMES.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1
            const isSelected =
              !isNaN(dateVal.getTime()) &&
              dateVal.getFullYear() === year &&
              dateVal.getMonth() === month &&
              dateVal.getDate() === dayNum

            return (
              <button
                key={dayNum}
                type="button"
                className={`h-7 w-7 rounded-lg text-xs font-semibold transition-all ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-md font-bold scale-105"
                    : "hover:bg-accent hover:text-accent-foreground text-foreground"
                }`}
                onClick={() => handleSelectDay(dayNum)}
              >
                {dayNum}
              </button>
            )
          })}
        </div>

        <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-semibold">Hora:</span>
          <div className="flex items-center gap-1.5">
            <select
              className="bg-background border border-border rounded-md px-2 py-1 text-xs font-semibold text-foreground focus:ring-1 focus:ring-primary"
              value={isNaN(dateVal.getTime()) ? 9 : dateVal.getHours()}
              onChange={(e) => handleTimeChange(Number(e.target.value), isNaN(dateVal.getTime()) ? 0 : dateVal.getMinutes())}
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00 hs
                </option>
              ))}
            </select>
            <select
              className="bg-background border border-border rounded-md px-2 py-1 text-xs font-semibold text-foreground focus:ring-1 focus:ring-primary"
              value={isNaN(dateVal.getTime()) ? 0 : Math.floor(dateVal.getMinutes() / 15) * 15}
              onChange={(e) => handleTimeChange(isNaN(dateVal.getTime()) ? 9 : dateVal.getHours(), Number(e.target.value))}
            >
              {[0, 15, 30, 45].map((m) => (
                <option key={m} value={m}>
                  :{String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const VISIT_STATUSES = [
  { value: "PENDING_CONFIRM", label: "Sin confirmar" },
  { value: "CONFIRMED", label: "Confirmada" },
  { value: "COMPLETED", label: "Realizada" },
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
      if (visit.job) {
        setIsMultiVisit(true)
        setTotalApplications(visit.job.totalApplications)
      } else {
        setIsMultiVisit(false)
        setTotalApplications(2)
      }
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

    await updateVisit.mutateAsync({
      id: editingId!,
      ...payload,
      newJobApplications: isMultiVisit ? totalApplications : undefined,
    })

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
              <CalendarPickerPopover
                value={values.scheduledAt}
                onChange={(val) => set("scheduledAt", val)}
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
              <div className="flex items-center justify-between">
                <Label htmlFor="price">Precio</Label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary rounded"
                    checked={values.price === 0}
                    onChange={(e) => set("price", e.target.checked ? 0 : 5000)}
                  />
                  Sin valor
                </label>
              </div>
              <Input
                id="price"
                type="number"
                min={0}
                step={500}
                disabled={values.price === 0}
                placeholder={values.price === 0 ? "Sin valor" : "0"}
                value={values.price === 0 ? "" : values.price}
                onChange={(event) => set("price", Number(event.target.value))}
              />
              {!isEditing && suggestedPrice.data?.price && values.price !== 0 ? (
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
            <p className="rounded-md bg-indigo-500/10 px-3 py-2 text-sm text-indigo-700 font-medium">
              Aplicación <strong>{defaultJob.applicationNumber}</strong> de{" "}
              <strong>{defaultJob.totalApplications}</strong> de un tratamiento.
            </p>
          ) : (
            <div className="rounded-md border border-[hsl(var(--border))] p-3 bg-muted/10 space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary rounded"
                  checked={isMultiVisit}
                  onChange={(event) => setIsMultiVisit(event.target.checked)}
                />
                Es un tratamiento de varias aplicaciones (visitas)
              </label>

              {isMultiVisit && (
                <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-[hsl(var(--border))/0.5]">
                  <Label htmlFor="totalApplications" className="text-xs font-semibold">
                    Cantidad total de aplicaciones
                  </Label>
                  <Input
                    id="totalApplications"
                    type="number"
                    min={2}
                    max={60}
                    className="w-20 h-8 text-xs font-bold"
                    value={totalApplications}
                    onChange={(event) =>
                      setTotalApplications(Number(event.target.value))
                    }
                  />
                  <p className="w-full text-xs text-muted-foreground">
                    {isEditing
                      ? `Esta visita es la aplicación 1. Al guardar con ${totalApplications} aplicaciones, la 2ª aplicación aparecerá en Pendientes para que la agendes cuando corresponda.`
                      : `Esta visita queda como la aplicación 1. Las ${Math.max(0, totalApplications - 1)} restantes aparecen en Pendientes.`}
                  </p>
                </div>
              )}
            </div>
          )}

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

          <DialogFooter className="sm:justify-between gap-2">
            {isEditing ? (
              <div className="flex items-center gap-2">
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

                {values.status !== "COMPLETED" && (
                  <Button
                    type="button"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
                    disabled={isSaving}
                    onClick={async () => {
                      try {
                        await updateStatus.mutateAsync({
                          id: editingId!,
                          status: "COMPLETED",
                        })
                        toast.success("Visita marcada como realizada")
                        await invalidate()
                        onOpenChange(false)
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Error al actualizar")
                      }
                    }}
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Marcar realizada
                  </Button>
                )}
              </div>
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
