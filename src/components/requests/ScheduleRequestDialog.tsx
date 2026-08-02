"use client"

import * as React from "react"
import { toast } from "sonner"
import { trpc } from "@/lib/trpc"
import { toDateTimeLocalValue } from "@/lib/format"
import { useTenantLabels } from "@/hooks/useTenantLabels"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

const UNASSIGNED = "__unassigned__"

interface ScheduleRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: {
    id: string
    clientId: string
    clientName: string
    serviceTypes: string[]
  } | null
}

/** Converts a pending request into a confirmed visit on the agenda. */
export function ScheduleRequestDialog({
  open,
  onOpenChange,
  request,
}: ScheduleRequestDialogProps) {
  const utils = trpc.useUtils()
  const labels = useTenantLabels()
  const operators = trpc.users.assignable.useQuery(undefined, { enabled: open })

  const suggestedPrice = trpc.visits.suggestedPrice.useQuery(
    { clientId: request?.clientId ?? "" },
    { enabled: open && Boolean(request?.clientId) }
  )

  const [scheduledAt, setScheduledAt] = React.useState("")
  const [durationMinutes, setDurationMinutes] = React.useState(45)
  const [price, setPrice] = React.useState(0)
  const [assignedUserId, setAssignedUserId] = React.useState(UNASSIGNED)
  const [error, setError] = React.useState<string | null>(null)
  // Opens a multi-visit job with this visit as its application 1.
  const [isMultiVisit, setIsMultiVisit] = React.useState(false)
  const [totalApplications, setTotalApplications] = React.useState(2)

  React.useEffect(() => {
    if (!open) return
    // Default to tomorrow at 9am — the usual next free slot.
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0)

    setScheduledAt(toDateTimeLocalValue(tomorrow))
    setDurationMinutes(45)
    setPrice(0)
    setAssignedUserId(UNASSIGNED)
    setIsMultiVisit(false)
    setTotalApplications(2)
    setError(null)
  }, [open])

  React.useEffect(() => {
    if (price === 0 && suggestedPrice.data?.price) setPrice(suggestedPrice.data.price)
  }, [suggestedPrice.data, price])

  const schedule = trpc.requests.schedule.useMutation({
    onSuccess: async () => {
      toast.success("Visita agendada")
      await Promise.all([utils.requests.invalidate(), utils.visits.invalidate()])
      onOpenChange(false)
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!request) return
    setError(null)

    schedule.mutate({
      id: request.id,
      scheduledAt: new Date(scheduledAt),
      durationMinutes,
      price,
      assignedUserId: assignedUserId === UNASSIGNED ? null : assignedUserId,
      serviceType: request.serviceTypes[0] ?? null,
      totalApplications: isMultiVisit ? totalApplications : null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendar solicitud</DialogTitle>
          <DialogDescription>
            {request
              ? `Se creará una visita confirmada para ${request.clientName}.`
              : null}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="scheduledAt">Fecha y hora</Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="duration">Duración (min)</Label>
              <Input
                id="duration"
                type="number"
                min={5}
                max={600}
                step={5}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Number(event.target.value))}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="price">Precio</Label>
              <Input
                id="price"
                type="number"
                min={0}
                step={500}
                value={price}
                onChange={(event) => setPrice(Number(event.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="assigned">Asignada a</Label>
              <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                <SelectTrigger id="assigned">
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
                  onChange={(event) => setTotalApplications(Number(event.target.value))}
                />
                <p className="w-full text-xs text-muted-foreground">
                  Se agenda la aplicación 1. Las {Math.max(0, totalApplications - 1)}{" "}
                  restantes quedan en Pendientes.
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={schedule.isPending}>
              {schedule.isPending ? "Agendando…" : "Agendar visita"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
