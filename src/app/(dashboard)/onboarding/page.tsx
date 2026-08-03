"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
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

import type { IndustryPreset } from "@/server/lib/industries"

type Industry = IndustryPreset

const UNIT_LABEL: Record<string, [string, string]> = {
  DAY: ["día", "días"],
  WEEK: ["semana", "semanas"],
  MONTH: ["mes", "meses"],
}

export default function OnboardingPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const industries = trpc.tenant.industries.useQuery()

  const [step, setStep] = React.useState<1 | 2>(1)
  const [selected, setSelected] = React.useState<Industry | null>(null)

  // Step 2 fields, pre-filled from the preset and fully editable.
  const [baseAddress, setBaseAddress] = React.useState("")
  const [recurrenceUnit, setRecurrenceUnit] = React.useState("MONTH")
  const [recurrenceInterval, setRecurrenceInterval] = React.useState(1)
  const [minDays, setMinDays] = React.useState(0)
  const [serviceTypes, setServiceTypes] = React.useState<string[]>([])
  const [newService, setNewService] = React.useState("")
  const [hoursStart, setHoursStart] = React.useState("08:00")
  const [hoursEnd, setHoursEnd] = React.useState("17:00")
  const [labelRecurring, setLabelRecurring] = React.useState("Contrato")
  const [labelOneOff, setLabelOneOff] = React.useState("Trabajo puntual")
  const [labelMultiVisit, setLabelMultiVisit] = React.useState("Trabajo")
  const [anchor, setAnchor] = React.useState("CALENDAR")
  const [oneOffSettles, setOneOffSettles] = React.useState(false)

  function pickIndustry(industry: Industry) {
    setSelected(industry)
    setRecurrenceUnit(industry.recurrenceUnit)
    setRecurrenceInterval(industry.recurrenceInterval)
    setMinDays(industry.minDaysBetweenApplications)
    setServiceTypes(industry.serviceTypes)
    setHoursStart(industry.workingHoursStart)
    setHoursEnd(industry.workingHoursEnd)
    setLabelRecurring(industry.labels.recurringAgreement)
    setLabelOneOff(industry.labels.oneOffVisit)
    setLabelMultiVisit(industry.labels.multiVisitJob)
    setAnchor(industry.recurrenceAnchor)
    setOneOffSettles(industry.oneOffSettlesPeriod)
    setStep(2)
  }

  const complete = trpc.tenant.completeOnboarding.useMutation({
    onSuccess: async () => {
      toast.success("Todo listo, ya podés empezar")
      await utils.tenant.invalidate()
      router.replace("/")
      router.refresh()
    },
    onError: (error) => toast.error(error.message),
  })

  function addService() {
    const value = newService.trim()
    if (!value || serviceTypes.includes(value)) return
    setServiceTypes((current) => [...current, value])
    setNewService("")
  }

  const [singular, plural] = UNIT_LABEL[recurrenceUnit] ?? UNIT_LABEL.MONTH

  if (step === 1) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15 border border-indigo-500/25 shadow-lg shadow-indigo-500/10">
            <Sparkles className="h-7 w-7 text-indigo-400 animate-pulse" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">¿A qué se dedica tu negocio?</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-md mx-auto">
            Elegí lo más parecido y te dejo todo preconfigurado. Después podés cambiar cualquier cosa desde Ajustes.
          </p>
        </div>

        {industries.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {industries.data?.map((industry) => (
              <button
                key={industry.id}
                type="button"
                onClick={() => pickIndustry(industry)}
                className="group rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 text-left transition-all duration-200 hover:border-indigo-500/50 hover:bg-[hsl(var(--secondary)/0.5)] shadow-md hover:shadow-indigo-500/10"
              >
                <h3 className="font-bold text-base text-[hsl(var(--foreground))] group-hover:text-indigo-400 transition-colors">{industry.label}</h3>
                <p className="mt-1.5 text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">{industry.description}</p>
                {industry.serviceTypes.length > 0 && (
                  <p className="mt-3 text-[11px] font-semibold text-indigo-400">
                    Incluye {industry.serviceTypes.length} servicios sugeridos
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <button
        type="button"
        onClick={() => setStep(1)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Cambiar de rubro
      </button>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ajustá lo que haga falta</h1>
        <p className="mt-1 text-muted-foreground">
          Precargado para <strong>{selected?.label}</strong>. Todo esto se puede cambiar
          después.
        </p>
      </div>

      <Card className="space-y-5 p-6">
        <div className="grid gap-2">
          <Label htmlFor="baseAddress">Dirección desde donde salís</Label>
          <Input
            id="baseAddress"
            value={baseAddress}
            onChange={(event) => setBaseAddress(event.target.value)}
            placeholder="Magallanes 1090, San Isidro"
          />
          <p className="text-xs text-muted-foreground">
            Se usa para calcular distancias al armar el recorrido.
          </p>
        </div>

        <div className="grid gap-2">
          <Label>¿Cada cuánto volvés a un cliente con servicio fijo?</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">cada</span>
            <Input
              type="number"
              min={1}
              max={60}
              value={recurrenceInterval}
              onChange={(event) => setRecurrenceInterval(Number(event.target.value))}
              className="w-20"
            />
            <Select value={recurrenceUnit} onValueChange={setRecurrenceUnit}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DAY">{recurrenceInterval === 1 ? "día" : "días"}</SelectItem>
                <SelectItem value="WEEK">
                  {recurrenceInterval === 1 ? "semana" : "semanas"}
                </SelectItem>
                <SelectItem value="MONTH">
                  {recurrenceInterval === 1 ? "mes" : "meses"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Es el valor por defecto: después podés ponerle otro a un cliente puntual.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="anchor">¿Cómo contás el próximo vencimiento?</Label>
          <Select value={anchor} onValueChange={setAnchor}>
            <SelectTrigger id="anchor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CALENDAR">Por período: el servicio del mes</SelectItem>
              <SelectItem value="LAST_VISIT">Desde la última visita</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {anchor === "CALENDAR"
              ? "Cualquier visita dentro del período lo salda, y el siguiente se debe desde el día 1. Si un trabajo lleva dos visitas, las dos van dentro del mismo período."
              : "Si fuiste el 20, el próximo vence el 20 del período siguiente."}
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="oneOff">
            Una {labelOneOff.toLowerCase()}, ¿salda el {labelRecurring.toLowerCase()} del período?
          </Label>
          <Select
            value={oneOffSettles ? "yes" : "no"}
            onValueChange={(value) => setOneOffSettles(value === "yes")}
          >
            <SelectTrigger id="oneOff">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="no">No, el período sigue debiéndose</SelectItem>
              <SelectItem value="yes">Sí, cualquier visita cuenta</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {oneOffSettles
              ? "Si fuiste y trabajaste, el período queda cubierto sin importar por qué fuiste."
              : "Ir por una urgencia no reemplaza el servicio comprometido."}
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="minDays">
            Días mínimos entre dos visitas de un mismo trabajo
          </Label>
          <Input
            id="minDays"
            type="number"
            min={0}
            max={365}
            value={minDays}
            onChange={(event) => setMinDays(Number(event.target.value))}
            className="w-28"
          />
          <p className="text-xs text-muted-foreground">
            {minDays > 0
              ? `Si intentás agendar antes de ${minDays} días te aviso, pero podés guardar igual. Nunca agendo nada por vos.`
              : "En 0 no hago ninguna advertencia."}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="hoursStart">Empezás a las</Label>
            <Input
              id="hoursStart"
              type="time"
              value={hoursStart}
              onChange={(event) => setHoursStart(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="hoursEnd">Terminás a las</Label>
            <Input
              id="hoursEnd"
              type="time"
              value={hoursEnd}
              onChange={(event) => setHoursEnd(event.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 rounded-lg border border-dashed p-4">
          <div>
            <Label>¿Cómo le decís vos a cada cosa?</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Estas palabras aparecen en toda la app. Poné las que usás con tus clientes.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="labelRecurring" className="text-xs font-normal text-muted-foreground">
                Al servicio que se repite
              </Label>
              <Input
                id="labelRecurring"
                value={labelRecurring}
                onChange={(event) => setLabelRecurring(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="labelOneOff" className="text-xs font-normal text-muted-foreground">
                A la visita de única vez
              </Label>
              <Input
                id="labelOneOff"
                value={labelOneOff}
                onChange={(event) => setLabelOneOff(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="labelMultiVisit" className="text-xs font-normal text-muted-foreground">
                Al trabajo de varias visitas
              </Label>
              <Input
                id="labelMultiVisit"
                value={labelMultiVisit}
                onChange={(event) => setLabelMultiVisit(event.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="newService">Servicios que ofrecés</Label>
          <div className="flex gap-2">
            <Input
              id="newService"
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
          {serviceTypes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {serviceTypes.map((service) => (
                <Badge
                  key={service}
                  variant="secondary"
                  className="cursor-pointer font-normal hover:bg-destructive/10 hover:text-destructive"
                  onClick={() =>
                    setServiceTypes((current) => current.filter((item) => item !== service))
                  }
                  title="Quitar"
                >
                  {service} ×
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setStep(1)}>
          Volver
        </Button>
        <Button
          disabled={complete.isPending}
          onClick={() =>
            complete.mutate({
              industry: selected!.id,
              baseAddress: baseAddress || null,
              recurrenceUnit: recurrenceUnit as "MONTH",
              recurrenceInterval,
              recurrenceAnchor: anchor as "CALENDAR",
              oneOffSettlesPeriod: oneOffSettles,
              minDaysBetweenApplications: minDays,
              serviceTypes,
              workingHoursStart: hoursStart,
              workingHoursEnd: hoursEnd,
              labelRecurringAgreement: labelRecurring,
              labelOneOffVisit: labelOneOff,
              labelMultiVisitJob: labelMultiVisit,
            })
          }
        >
          <Check className="mr-2 h-4 w-4" />
          {complete.isPending ? "Guardando…" : "Empezar a usar ServiFlow"}
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Servicio {recurrenceInterval === 1 ? `cada ${singular}` : `cada ${recurrenceInterval} ${plural}`}
        {minDays > 0 && ` · mínimo ${minDays} días entre visitas de un trabajo`}
      </p>
    </div>
  )
}
