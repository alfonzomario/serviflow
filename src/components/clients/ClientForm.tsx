"use client"

import * as React from "react"
import { toast } from "sonner"
import { trpc } from "@/lib/trpc"
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

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
const SLOTS = ["Mañana", "Tarde"]

/** Radix Select cannot hold an empty value, so "inherit" needs a sentinel. */
const UNSET = "__inherit__"

type ClientFormValues = {
  name: string
  email: string
  phone: string
  address: string
  relationshipType: "CONTRACT" | "ON_DEMAND"
  status: "ACTIVE" | "INACTIVE"
  serviceTypes: string
  preferredDays: string[]
  preferredSlots: string[]
  /** Empty means "usar el default del negocio". */
  recurrenceInterval: string
  recurrenceUnit: string
  minDaysBetweenApplications: string
  notes: string
}

const EMPTY: ClientFormValues = {
  name: "",
  email: "",
  phone: "",
  address: "",
  relationshipType: "ON_DEMAND",
  status: "ACTIVE",
  serviceTypes: "",
  preferredDays: [],
  preferredSlots: [],
  recurrenceInterval: "",
  recurrenceUnit: "",
  minDaysBetweenApplications: "",
  notes: "",
}

interface ClientFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId?: string | null
}

export function ClientForm({ open, onOpenChange, clientId }: ClientFormProps) {
  const isEditing = Boolean(clientId)
  const utils = trpc.useUtils()

  const existing = trpc.clients.getById.useQuery(
    { id: clientId! },
    { enabled: open && Boolean(clientId) }
  )

  const [values, setValues] = React.useState<ClientFormValues>(EMPTY)
  const [error, setError] = React.useState<string | null>(null)

  const set = <K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const toggleIn = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value]

  React.useEffect(() => {
    if (!open) return
    setError(null)

    if (!clientId) {
      setValues(EMPTY)
      return
    }

    const client = existing.data
    if (client) {
      setValues({
        name: client.name,
        email: client.email ?? "",
        phone: client.phone ?? "",
        address: client.address ?? "",
        relationshipType: client.relationshipType,
        status: client.status,
        serviceTypes: client.serviceTypes.join(", "),
        preferredDays: client.preferredDays,
        preferredSlots: client.preferredSlots,
        recurrenceInterval: client.recurrenceInterval?.toString() ?? "",
        recurrenceUnit: client.recurrenceUnit ?? "",
        minDaysBetweenApplications: client.minDaysBetweenApplications?.toString() ?? "",
        notes: client.notes ?? "",
      })
    }
  }, [open, clientId, existing.data])

  const onSuccess = async (message: string) => {
    toast.success(message)
    await utils.clients.invalidate()
    onOpenChange(false)
  }

  const createClient = trpc.clients.create.useMutation({
    onSuccess: () => onSuccess("Cliente creado"),
    onError: (mutationError) => setError(mutationError.message),
  })

  const updateClient = trpc.clients.update.useMutation({
    onSuccess: () => onSuccess("Cliente actualizado"),
    onError: (mutationError) => setError(mutationError.message),
  })

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const payload = {
      name: values.name.trim(),
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      address: values.address.trim() || null,
      relationshipType: values.relationshipType,
      status: values.status,
      serviceTypes: values.serviceTypes
        .split(",")
        .map((type) => type.trim())
        .filter(Boolean),
      preferredDays: values.preferredDays,
      preferredSlots: values.preferredSlots,
      // Blank fields fall back to the business default rather than storing a value.
      recurrenceInterval: values.recurrenceInterval ? Number(values.recurrenceInterval) : null,
      recurrenceUnit: (values.recurrenceUnit || null) as "MONTH" | null,
      minDaysBetweenApplications: values.minDaysBetweenApplications
        ? Number(values.minDaysBetweenApplications)
        : null,
      notes: values.notes.trim() || null,
    }

    if (isEditing) {
      updateClient.mutate({ id: clientId!, ...payload })
    } else {
      createClient.mutate(payload)
    }
  }

  const isSaving = createClient.isPending || updateClient.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          <DialogDescription>
            Los clientes por contrato aparecen en Pendientes si no tienen visita en el mes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                value={values.phone}
                onChange={(event) => set("phone", event.target.value)}
                placeholder="(11) 5555-0000"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={values.email}
                onChange={(event) => set("email", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="address">Dirección</Label>
            <Input
              id="address"
              value={values.address}
              onChange={(event) => set("address", event.target.value)}
              placeholder="Av. Libertador 1500, San Isidro"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="relationshipType">Vínculo</Label>
              <Select
                value={values.relationshipType}
                onValueChange={(value) =>
                  set("relationshipType", value as ClientFormValues["relationshipType"])
                }
              >
                <SelectTrigger id="relationshipType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONTRACT">Por contrato</SelectItem>
                  <SelectItem value="ON_DEMAND">Ocasional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Estado</Label>
              <Select
                value={values.status}
                onValueChange={(value) => set("status", value as ClientFormValues["status"])}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Activo</SelectItem>
                  <SelectItem value="INACTIVE">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="serviceTypes">Servicios</Label>
            <Input
              id="serviceTypes"
              value={values.serviceTypes}
              onChange={(event) => set("serviceTypes", event.target.value)}
              placeholder="Fumigación Control, Desratización"
            />
            <p className="text-xs text-muted-foreground">Separá con comas</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Días preferidos</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => set("preferredDays", toggleIn(values.preferredDays, day))}
                    className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                      values.preferredDays.includes(day)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Franja</Label>
              <div className="flex flex-wrap gap-1.5">
                {SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => set("preferredSlots", toggleIn(values.preferredSlots, slot))}
                    className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                      values.preferredSlots.includes(slot)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <details className="rounded-lg border border-dashed p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Este cliente es distinto al resto
            </summary>
            <div className="mt-3 grid gap-3">
              <p className="text-xs text-muted-foreground">
                Dejá los campos vacíos para usar la configuración del negocio.
              </p>

              <div className="grid gap-2">
                <Label>Cada cuánto vuelvo a este cliente</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">cada</span>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    placeholder="—"
                    value={values.recurrenceInterval}
                    onChange={(event) => set("recurrenceInterval", event.target.value)}
                    className="w-20"
                  />
                  <Select
                    value={values.recurrenceUnit || UNSET}
                    onValueChange={(value) =>
                      set("recurrenceUnit", value === UNSET ? "" : value)
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSET}>como el negocio</SelectItem>
                      <SelectItem value="DAY">días</SelectItem>
                      <SelectItem value="WEEK">semanas</SelectItem>
                      <SelectItem value="MONTH">meses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="minDays">Días mínimos entre visitas de un mismo trabajo</Label>
                <Input
                  id="minDays"
                  type="number"
                  min={0}
                  max={365}
                  placeholder="—"
                  value={values.minDaysBetweenApplications}
                  onChange={(event) =>
                    set("minDaysBetweenApplications", event.target.value)
                  }
                  className="w-28"
                />
              </div>
            </div>
          </details>

          <div className="grid gap-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              rows={3}
              value={values.notes}
              onChange={(event) => set("notes", event.target.value)}
            />
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
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
