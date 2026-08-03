"use client"

import * as React from "react"
import { Save } from "lucide-react"
import { toast } from "sonner"

import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type SettingsForm = {
  businessName: string
  baseAddress: string
  workingHoursStart: string
  workingHoursEnd: string
  recurrenceUnit: string
  recurrenceInterval: number
  recurrenceAnchor: string
  oneOffSettlesPeriod: boolean
  minDaysBetweenApplications: number
  defaultDurationMinutes: number
  labelRecurringAgreement: string
  labelOneOffVisit: string
  labelMultiVisitJob: string
  serviceTypes: string[]
}

export default function SettingsPage() {
  const utils = trpc.useUtils()
  const tenant = trpc.tenant.current.useQuery()

  const [form, setForm] = React.useState<SettingsForm | null>(null)
  const [newService, setNewService] = React.useState("")

  // Load once the tenant arrives; afterwards the form owns the state.
  React.useEffect(() => {
    if (!tenant.data || form) return
    const settings = tenant.data.settings

    setForm({
      businessName: tenant.data.name,
      baseAddress: settings?.baseAddress ?? "",
      workingHoursStart: settings?.workingHoursStart ?? "08:00",
      workingHoursEnd: settings?.workingHoursEnd ?? "17:00",
      recurrenceUnit: settings?.recurrenceUnit ?? "MONTH",
      recurrenceInterval: settings?.recurrenceInterval ?? 1,
      recurrenceAnchor: settings?.recurrenceAnchor ?? "CALENDAR",
      oneOffSettlesPeriod: settings?.oneOffSettlesPeriod ?? false,
      minDaysBetweenApplications: settings?.minDaysBetweenApplications ?? 15,
      defaultDurationMinutes: settings?.defaultDurationMinutes ?? 45,
      labelRecurringAgreement: settings?.labelRecurringAgreement ?? "Abono",
      labelOneOffVisit: settings?.labelOneOffVisit ?? "Especial",
      labelMultiVisitJob: settings?.labelMultiVisitJob ?? "Tratamiento",
      serviceTypes: Array.isArray(settings?.customServiceTypes)
        ? (settings.customServiceTypes as unknown[]).filter(
            (value): value is string => typeof value === "string"
          )
        : [],
    })
  }, [tenant.data, form])

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current))

  const updateProfile = trpc.tenant.updateProfile.useMutation()
  const updateSettings = trpc.tenant.updateSettings.useMutation()

  const isSaving = updateProfile.isPending || updateSettings.isPending

  async function onSave() {
    if (!form) return

    try {
      await updateProfile.mutateAsync({ name: form.businessName })
      await updateSettings.mutateAsync({
        baseAddress: form.baseAddress || null,
        workingHoursStart: form.workingHoursStart,
        workingHoursEnd: form.workingHoursEnd,
        recurrenceUnit: form.recurrenceUnit as "MONTH",
        recurrenceInterval: form.recurrenceInterval,
        recurrenceAnchor: form.recurrenceAnchor as "CALENDAR",
        oneOffSettlesPeriod: form.oneOffSettlesPeriod,
        minDaysBetweenApplications: form.minDaysBetweenApplications,
        defaultDurationMinutes: form.defaultDurationMinutes,
        labelRecurringAgreement: form.labelRecurringAgreement,
        labelOneOffVisit: form.labelOneOffVisit,
        labelMultiVisitJob: form.labelMultiVisitJob,
        customServiceTypes: form.serviceTypes,
      })

      toast.success("Ajustes guardados")
      await utils.tenant.invalidate()
      // Pendientes depends on the cadence, so its results are now stale.
      await utils.visits.invalidate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar")
    }
  }

  function addService() {
    const value = newService.trim()
    if (!form || !value || form.serviceTypes.includes(value)) return
    set("serviceTypes", [...form.serviceTypes, value])
    setNewService("")
  }

  if (!form) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Ajustes</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Configuraciones operativas, servicios y reglas de frecuencia de tu negocio.
          </p>
        </div>
        <Button
          onClick={onSave}
          disabled={isSaving}
          className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/25 border-none"
        >
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>

      <Card className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold">El negocio</CardTitle>
          <CardDescription className="text-xs text-[hsl(var(--muted-foreground))]">Datos generales y desde dónde salís a trabajar.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="businessName">Nombre</Label>
            <Input
              id="businessName"
              value={form.businessName}
              onChange={(event) => set("businessName", event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="baseAddress">Dirección base</Label>
            <Input
              id="baseAddress"
              value={form.baseAddress}
              onChange={(event) => set("baseAddress", event.target.value)}
              placeholder="Magallanes 1090, San Isidro"
            />
            <p className="text-xs text-muted-foreground">
              Se usa para calcular distancias al armar el recorrido.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="hoursStart">Empezás a las</Label>
              <Input
                id="hoursStart"
                type="time"
                value={form.workingHoursStart}
                onChange={(event) => set("workingHoursStart", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="hoursEnd">Terminás a las</Label>
              <Input
                id="hoursEnd"
                type="time"
                value={form.workingHoursEnd}
                onChange={(event) => set("workingHoursEnd", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="duration">Duración típica (min)</Label>
              <Input
                id="duration"
                type="number"
                min={5}
                max={600}
                step={5}
                value={form.defaultDurationMinutes}
                onChange={(event) =>
                  set("defaultDurationMinutes", Number(event.target.value))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold">Cómo se repiten los servicios</CardTitle>
          <CardDescription className="text-xs text-[hsl(var(--muted-foreground))]">
            Define cuándo algo aparece en Pendientes. Nada de esto agenda por vos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>¿Cada cuánto volvés a un cliente con servicio fijo?</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">cada</span>
              <Input
                type="number"
                min={1}
                max={60}
                value={form.recurrenceInterval}
                onChange={(event) => set("recurrenceInterval", Number(event.target.value))}
                className="w-20"
              />
              <Select
                value={form.recurrenceUnit}
                onValueChange={(value) => set("recurrenceUnit", value)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAY">
                    {form.recurrenceInterval === 1 ? "día" : "días"}
                  </SelectItem>
                  <SelectItem value="WEEK">
                    {form.recurrenceInterval === 1 ? "semana" : "semanas"}
                  </SelectItem>
                  <SelectItem value="MONTH">
                    {form.recurrenceInterval === 1 ? "mes" : "meses"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Valor por defecto: cada cliente puede tener el suyo.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="anchor">¿Cómo contás el próximo vencimiento?</Label>
            <Select
              value={form.recurrenceAnchor}
              onValueChange={(value) => set("recurrenceAnchor", value)}
            >
              <SelectTrigger id="anchor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CALENDAR">Por período: el servicio del mes</SelectItem>
                <SelectItem value="LAST_VISIT">Desde la última visita</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {form.recurrenceAnchor === "CALENDAR"
                ? "Cualquier visita dentro del período lo salda, y el siguiente se debe desde el día 1."
                : "Si fuiste el 20, el próximo vence el 20 del período siguiente."}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="oneOff">
              Una {form.labelOneOffVisit.toLowerCase()}, ¿salda el{" "}
              {form.labelRecurringAgreement.toLowerCase()} del período?
            </Label>
            <Select
              value={form.oneOffSettlesPeriod ? "yes" : "no"}
              onValueChange={(value) => set("oneOffSettlesPeriod", value === "yes")}
            >
              <SelectTrigger id="oneOff">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no">No, el período sigue debiéndose</SelectItem>
                <SelectItem value="yes">Sí, cualquier visita cuenta</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="minDays">
              Días mínimos entre dos visitas de un mismo {form.labelMultiVisitJob.toLowerCase()}
            </Label>
            <Input
              id="minDays"
              type="number"
              min={0}
              max={365}
              value={form.minDaysBetweenApplications}
              onChange={(event) =>
                set("minDaysBetweenApplications", Number(event.target.value))
              }
              className="w-28"
            />
            <p className="text-xs text-muted-foreground">
              {form.minDaysBetweenApplications > 0
                ? `Pendientes va a decir "hacerla a partir del…" y avisar si agendás antes. Podés guardar igual.`
                : "En 0 no hago ninguna advertencia."}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cómo le decís a cada cosa</CardTitle>
          <CardDescription>Estas palabras aparecen en toda la app.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="labelRecurring">Al servicio que se repite</Label>
            <Input
              id="labelRecurring"
              value={form.labelRecurringAgreement}
              onChange={(event) => set("labelRecurringAgreement", event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="labelOneOff">A la visita de única vez</Label>
            <Input
              id="labelOneOff"
              value={form.labelOneOffVisit}
              onChange={(event) => set("labelOneOffVisit", event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="labelMulti">Al trabajo de varias visitas</Label>
            <Input
              id="labelMulti"
              value={form.labelMultiVisitJob}
              onChange={(event) => set("labelMultiVisitJob", event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Servicios que ofrecés</CardTitle>
          <CardDescription>
            Aparecen como sugerencia al cargar una visita o una solicitud.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex gap-2">
            <Input
              value={newService}
              onChange={(event) => setNewService(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addService()
                }
              }}
              placeholder="Agregá uno y presioná Enter"
            />
            <Button type="button" variant="outline" onClick={addService}>
              Agregar
            </Button>
          </div>

          {form.serviceTypes.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {form.serviceTypes.map((service) => (
                <Badge
                  key={service}
                  variant="secondary"
                  className="cursor-pointer font-normal hover:bg-destructive/10 hover:text-destructive"
                  onClick={() =>
                    set(
                      "serviceTypes",
                      form.serviceTypes.filter((item) => item !== service)
                    )
                  }
                  title="Quitar"
                >
                  {service} ×
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Todavía no cargaste ninguno.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  )
}
