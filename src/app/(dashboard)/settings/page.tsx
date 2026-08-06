"use client"

import * as React from "react"
import { Save } from "lucide-react"
import { toast } from "sonner"
import { useSearchParams } from "next/navigation"

import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { GOOGLE_CALENDAR_EVENT_COLORS } from "@/lib/googleCalendarColors"

function SettingsPageInner() {
  const searchParams = useSearchParams()
  const [tab, setTab] = React.useState(() => searchParams.get("tab") || "negocio")

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Ajustes</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Configura el comportamiento, la marca, las integraciones y más.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="negocio">Negocio</TabsTrigger>
          <TabsTrigger value="marca">Marca</TabsTrigger>
          <TabsTrigger value="integraciones">Integraciones</TabsTrigger>
          <TabsTrigger value="ia">IA</TabsTrigger>
          <TabsTrigger value="suscripcion">Suscripción</TabsTrigger>
        </TabsList>

        <TabsContent value="negocio">
          <NegocioTab />
        </TabsContent>
        <TabsContent value="marca">
          <MarcaTab />
        </TabsContent>
        <TabsContent value="integraciones">
          <IntegracionesTab />
        </TabsContent>
        <TabsContent value="ia">
          <IaTab />
        </TabsContent>
        <TabsContent value="suscripcion">
          <SuscripcionTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <React.Suspense fallback={null}>
      <SettingsPageInner />
    </React.Suspense>
  )
}

function NegocioTab() {
  const utils = trpc.useUtils()
  const tenant = trpc.tenant.current.useQuery()

  type FormType = {
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

  const [form, setForm] = React.useState<FormType | null>(null)
  const [newService, setNewService] = React.useState("")

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

  const set = <K extends keyof FormType>(key: K, value: FormType[K]) =>
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
      toast.success("Ajustes del negocio guardados")
      await utils.tenant.invalidate()
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

  if (!form) return <div className="animate-pulse h-48 bg-muted rounded-xl" />

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={onSave} disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>El negocio</CardTitle>
          <CardDescription>Datos generales y operacionales.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Nombre</Label>
            <Input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Dirección base</Label>
            <Input value={form.baseAddress} onChange={(e) => set("baseAddress", e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Empezás a las</Label>
              <Input type="time" value={form.workingHoursStart} onChange={(e) => set("workingHoursStart", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Terminás a las</Label>
              <Input type="time" value={form.workingHoursEnd} onChange={(e) => set("workingHoursEnd", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Duración típica (min)</Label>
              <Input type="number" value={form.defaultDurationMinutes} onChange={(e) => set("defaultDurationMinutes", Number(e.target.value))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cómo se repiten los servicios</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Frecuencia base</Label>
            <div className="flex gap-2 items-center">
              <span>Cada</span>
              <Input type="number" className="w-20" value={form.recurrenceInterval} onChange={(e) => set("recurrenceInterval", Number(e.target.value))} />
              <Select value={form.recurrenceUnit} onValueChange={(val) => set("recurrenceUnit", val)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAY">días</SelectItem>
                  <SelectItem value="WEEK">semanas</SelectItem>
                  <SelectItem value="MONTH">meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>¿Cómo contás el próximo vencimiento?</Label>
            <Select value={form.recurrenceAnchor} onValueChange={(val) => set("recurrenceAnchor", val)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CALENDAR">Por período: el servicio del mes</SelectItem>
                <SelectItem value="LAST_VISIT">Desde la última visita</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nomenclatura y Servicios</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Servicio que se repite</Label>
              <Input value={form.labelRecurringAgreement} onChange={(e) => set("labelRecurringAgreement", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Visita única</Label>
              <Input value={form.labelOneOffVisit} onChange={(e) => set("labelOneOffVisit", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Trabajo múltiple</Label>
              <Input value={form.labelMultiVisitJob} onChange={(e) => set("labelMultiVisitJob", e.target.value)} />
            </div>
          </div>
          <div className="mt-4">
            <Label className="mb-2 block">Servicios que ofrecés</Label>
            <div className="flex gap-2 mb-2">
              <Input value={newService} onChange={(e) => setNewService(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addService())} />
              <Button type="button" variant="outline" onClick={addService}>Agregar</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {form.serviceTypes.map((st) => (
                <Badge key={st} variant="secondary" className="cursor-pointer" onClick={() => set("serviceTypes", form.serviceTypes.filter(s => s !== st))}>
                  {st} ×
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function MarcaTab() {
  const utils = trpc.useUtils()
  const tenant = trpc.tenant.current.useQuery()
  const updateSettings = trpc.tenant.updateSettings.useMutation()

  type FormType = {
    brandPrimaryColor: string
    brandSecondaryColor: string
    fiscalName: string
    fiscalId: string
    fiscalAddress: string
  }

  const [form, setForm] = React.useState<FormType | null>(null)

  React.useEffect(() => {
    if (!tenant.data || form) return
    const settings = tenant.data.settings
    setForm({
      brandPrimaryColor: settings?.brandPrimaryColor ?? "#000000",
      brandSecondaryColor: settings?.brandSecondaryColor ?? "#ffffff",
      fiscalName: settings?.fiscalName ?? "",
      fiscalId: settings?.fiscalId ?? "",
      fiscalAddress: settings?.fiscalAddress ?? "",
    })
  }, [tenant.data, form])

  async function onSave() {
    if (!form) return
    try {
      await updateSettings.mutateAsync({
        brandPrimaryColor: form.brandPrimaryColor || null,
        brandSecondaryColor: form.brandSecondaryColor || null,
        fiscalName: form.fiscalName || null,
        fiscalId: form.fiscalId || null,
        fiscalAddress: form.fiscalAddress || null,
      })
      toast.success("Ajustes de marca guardados")
      await utils.tenant.invalidate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error")
    }
  }

  if (!form) return <div className="animate-pulse h-48 bg-muted rounded-xl" />

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={onSave} disabled={updateSettings.isPending}>
          <Save className="mr-2 h-4 w-4" />
          Guardar cambios
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Marca</CardTitle>
          <CardDescription>Colores corporativos e identidad.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Color Primario</Label>
            <div className="flex gap-2">
              <Input type="color" value={form.brandPrimaryColor} onChange={(e) => setForm(c => c ? { ...c, brandPrimaryColor: e.target.value } : c)} className="w-16 h-10 p-1" />
              <Input type="text" value={form.brandPrimaryColor} onChange={(e) => setForm(c => c ? { ...c, brandPrimaryColor: e.target.value } : c)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Color Secundario</Label>
            <div className="flex gap-2">
              <Input type="color" value={form.brandSecondaryColor} onChange={(e) => setForm(c => c ? { ...c, brandSecondaryColor: e.target.value } : c)} className="w-16 h-10 p-1" />
              <Input type="text" value={form.brandSecondaryColor} onChange={(e) => setForm(c => c ? { ...c, brandSecondaryColor: e.target.value } : c)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datos Fiscales</CardTitle>
          <CardDescription>Razón social e identificadores (CUIT/RFC).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Nombre / Razón Social</Label>
            <Input value={form.fiscalName} onChange={(e) => setForm(c => c ? { ...c, fiscalName: e.target.value } : c)} />
          </div>
          <div className="grid gap-2">
            <Label>Identificador Fiscal (CUIT/RFC)</Label>
            <Input value={form.fiscalId} onChange={(e) => setForm(c => c ? { ...c, fiscalId: e.target.value } : c)} />
          </div>
          <div className="grid gap-2">
            <Label>Dirección Fiscal</Label>
            <Input value={form.fiscalAddress} onChange={(e) => setForm(c => c ? { ...c, fiscalAddress: e.target.value } : c)} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function IntegracionesTab() {
  const gcal = trpc.integrations.getGoogleCalendarStatus.useQuery()
  const wa = trpc.integrations.getWhatsAppConfig.useQuery()
  const smtp = trpc.integrations.getSmtpConfig.useQuery()
  const wh = trpc.integrations.getWebhookConfig.useQuery()

  const updateWa = trpc.integrations.updateWhatsAppConfig.useMutation()
  const updateSmtp = trpc.integrations.updateSmtpConfig.useMutation()
  const updateWh = trpc.integrations.updateWebhookConfig.useMutation()
  const utils = trpc.useUtils()

  const [waForm, setWaForm] = React.useState({ apiUrl: "", apiKey: "" })
  const [smtpForm, setSmtpForm] = React.useState({ host: "", port: "", user: "", password: "", fromEmail: "" })
  const [whForm, setWhForm] = React.useState({ url: "", events: "" })

  React.useEffect(() => {
    if (wa.data && !waForm.apiUrl) setWaForm({ apiUrl: wa.data.apiUrl || "", apiKey: "" })
  }, [wa.data])

  React.useEffect(() => {
    if (smtp.data && !smtpForm.host) setSmtpForm({ host: smtp.data.host || "", port: smtp.data.port?.toString() || "", user: smtp.data.user || "", password: "", fromEmail: smtp.data.fromEmail || "" })
  }, [smtp.data])

  React.useEffect(() => {
    if (wh.data && !whForm.url) setWhForm({ url: wh.data.url || "", events: wh.data.events.join(", ") })
  }, [wh.data])

  async function onSaveWa() {
    try {
      await updateWa.mutateAsync({ apiUrl: waForm.apiUrl || null, apiKey: waForm.apiKey || undefined })
      toast.success("WhatsApp guardado")
      utils.integrations.getWhatsAppConfig.invalidate()
    } catch (e) { toast.error("Error al guardar") }
  }

  async function onSaveSmtp() {
    try {
      await updateSmtp.mutateAsync({
        host: smtpForm.host || null,
        port: smtpForm.port ? parseInt(smtpForm.port) : null,
        user: smtpForm.user || null,
        password: smtpForm.password || undefined,
        fromEmail: smtpForm.fromEmail || null
      })
      toast.success("SMTP guardado")
      utils.integrations.getSmtpConfig.invalidate()
    } catch (e) { toast.error("Error al guardar") }
  }

  async function onSaveWh() {
    try {
      await updateWh.mutateAsync({
        url: whForm.url || null,
        events: whForm.events.split(",").map(e => e.trim()).filter(Boolean)
      })
      toast.success("Webhook guardado")
      utils.integrations.getWebhookConfig.invalidate()
    } catch (e) { toast.error("Error al guardar") }
  }

  const [gcalForm, setGcalForm] = React.useState({ clientId: "", clientSecret: "" })
  const updateGcalCreds = trpc.integrations.updateGoogleCredentials.useMutation()

  React.useEffect(() => {
    if (gcal.data && !gcalForm.clientId) {
      setGcalForm({ clientId: gcal.data.googleClientId || "", clientSecret: "" })
    }
  }, [gcal.data])

  const testGcal = trpc.integrations.testGoogleCalendarConnection.useMutation({
    onSuccess: (res) => {
      if (res.ok) toast.success(res.message)
      else toast.error(res.message, { duration: 15000 })
    },
    onError: (e) => toast.error(`No se pudo probar la conexión: ${e.message}`, { duration: 15000 }),
  })

  const resyncGcal = trpc.integrations.purgeAndCleanGoogleCalendar.useMutation({
    onSuccess: () => {
      toast.success("Reseteo iniciado en segundo plano. Los eventos se recrean en los próximos minutos.")
    },
    onError: (e) => toast.error(`Error al resetear: ${e.message}`),
  })

  const disconnectGcal = trpc.integrations.disconnectGoogleCalendar.useMutation({
    onSuccess: () => {
      toast.success("Google Calendar desconectado y calendario borrado de ambos lados")
      utils.integrations.getGoogleCalendarStatus.invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  async function onSaveGcalCreds() {
    try {
      await updateGcalCreds.mutateAsync({
        clientId: gcalForm.clientId || null,
        clientSecret: gcalForm.clientSecret || undefined,
      })
      toast.success("Credenciales de Google guardadas")
      utils.integrations.getGoogleCalendarStatus.invalidate()
    } catch (e) {
      toast.error("Error al guardar credenciales")
    }
  }

  // --- Appearance: calendar name & event color shown in Google ---
  const [appearanceForm, setAppearanceForm] = React.useState({ calendarName: "", colorId: "" })
  React.useEffect(() => {
    if (gcal.data && !appearanceForm.calendarName) {
      setAppearanceForm({ calendarName: gcal.data.calendarName, colorId: gcal.data.colorId })
    }
  }, [gcal.data])

  const updateAppearance = trpc.integrations.updateGoogleCalendarAppearance.useMutation({
    onSuccess: () => {
      toast.success("Apariencia guardada")
      utils.integrations.getGoogleCalendarStatus.invalidate()
    },
    onError: (e) => toast.error(`Error al guardar apariencia: ${e.message}`),
  })

  async function onSaveAppearance() {
    if (!appearanceForm.calendarName.trim()) {
      toast.error("El nombre del calendario no puede estar vacío")
      return
    }
    await updateAppearance.mutateAsync({
      calendarName: appearanceForm.calendarName.trim(),
      colorId: appearanceForm.colorId,
    })
  }

  // --- Handle the redirect back from Google's OAuth flow (lands here with ?google_connected / ?error) ---
  const handledRedirect = React.useRef(false)
  React.useEffect(() => {
    if (handledRedirect.current) return
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const errorMessages: Record<string, string> = {
      google_credentials_missing: "Google Client ID no configurado. Ingresá el Client ID y Client Secret abajo antes de conectar.",
      google_auth_failed: "No se pudo completar la conexión con Google Calendar.",
      google_token_exchange_failed: "Google rechazó el intercambio de tokens. Revisá el Client ID y Client Secret.",
      google_oauth_exception: "Ocurrió un error inesperado conectando con Google Calendar.",
    }
    if (params.get("google_connected") === "true") {
      handledRedirect.current = true
      toast.success("¡Google Calendar conectado! Sincronizando tus visitas...")
      resyncGcal.mutate()
      utils.integrations.getGoogleCalendarStatus.invalidate()
      window.history.replaceState({}, "", window.location.pathname + "?tab=integraciones")
    } else if (params.get("error")) {
      handledRedirect.current = true
      toast.error(errorMessages[params.get("error") || ""] || "No se pudo completar la conexión con Google Calendar.")
      window.history.replaceState({}, "", window.location.pathname + "?tab=integraciones")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Google Calendar</CardTitle>
          <CardDescription>Sincronización automática bidireccional en segundo plano.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">
                Estado:{" "}
                {gcal.data?.connected ? (
                  <span className="text-emerald-400 font-bold">🟢 Conectado y Sincronizando</span>
                ) : (
                  <span className="text-muted-foreground">⚪ Desconectado</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {gcal.data?.connected
                  ? "Las visitas agendadas o modificadas en ServiFlow se crearán automáticamente en tu Google Calendar."
                  : "Vinculá tu cuenta de Google en 1 clic para que las visitas se agenden solas en tu celular."}
              </p>
            </div>

            {gcal.data?.connected ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs font-bold"
                  disabled={testGcal.isPending}
                  onClick={() => testGcal.mutate()}
                >
                  {testGcal.isPending ? "Probando..." : "Probar conexión"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs font-bold border-orange-500/30 text-orange-500 hover:bg-orange-500/10"
                  disabled={resyncGcal.isPending}
                  onClick={() => {
                    if (window.confirm("¿Estás seguro? Esto eliminará todos los eventos y los vuelve a crear desde cero en tu calendario de Google.")) {
                      resyncGcal.mutate()
                    }
                  }}
                >
                  {resyncGcal.isPending ? "Reseteando..." : "Resetear y resincronizar"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs text-destructive hover:bg-destructive/10 border-destructive/30 font-bold"
                  disabled={disconnectGcal.isPending}
                  onClick={() => {
                    if (window.confirm("¿Seguro que querés desconectar Google Calendar? Se borra el calendario dedicado (y todos sus eventos) tanto de ServiFlow como de tu cuenta de Google. Los eventos que hayas creado a mano en tu calendario principal no se tocan.")) {
                      disconnectGcal.mutate()
                    }
                  }}
                >
                  {disconnectGcal.isPending ? "Desconectando..." : "Desconectar"}
                </Button>
              </div>
            ) : (
              <Button
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs gap-1.5 shadow-md"
                disabled={updateGcalCreds.isPending}
                onClick={async () => {
                  if (!gcal.data?.hasCredentials && !gcalForm.clientId) {
                    toast.error("Ingresá tu Google Client ID y Client Secret abajo antes de conectar.")
                    return
                  }
                  // Auto-save credentials if the user typed them in the input fields
                  if (gcalForm.clientId || gcalForm.clientSecret) {
                    try {
                      await updateGcalCreds.mutateAsync({
                        clientId: gcalForm.clientId || null,
                        clientSecret: gcalForm.clientSecret || undefined,
                      })
                    } catch (e) {
                      toast.error("Error al guardar credenciales")
                      return
                    }
                  }
                  window.location.href = "/api/integrations/google/connect"
                }}
              >
                Conectar con Google
              </Button>
            )}
          </div>

          {/* Appearance: calendar name & event color as they show up in Google */}
          <div className="pt-4 border-t border-border grid gap-4">
            <div className="flex flex-col gap-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Cómo se ve en Google Calendar
              </h4>
              <p className="text-xs text-muted-foreground">
                Nombre del calendario dedicado y color de los eventos que ServiFlow crea ahí.
                {gcal.data?.connected ? " Cambiar el nombre lo renombra en Google al guardar." : " Se aplica al calendario dedicado que se crea cuando te conectes."}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label className="text-xs">Nombre del calendario</Label>
                <Input
                  value={appearanceForm.calendarName}
                  onChange={(e) => setAppearanceForm((c) => ({ ...c, calendarName: e.target.value }))}
                  placeholder="ServiFlow"
                  className="text-xs"
                  maxLength={100}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">Color de los eventos</Label>
                <div className="flex flex-wrap gap-2">
                  {GOOGLE_CALENDAR_EVENT_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      title={c.name}
                      aria-label={c.name}
                      onClick={() => setAppearanceForm((f) => ({ ...f, colorId: c.id }))}
                      className={`h-7 w-7 rounded-full border-2 transition-all ${
                        appearanceForm.colorId === c.id
                          ? "border-foreground scale-110 shadow-md"
                          : "border-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <Button
              onClick={onSaveAppearance}
              disabled={updateAppearance.isPending}
              variant="outline"
              size="sm"
              className="w-fit text-xs font-semibold"
            >
              Guardar apariencia
            </Button>
          </div>

          {/* Form to configure Google Client ID & Secret */}
          <div className="pt-4 border-t border-border grid gap-4">
            <div className="flex flex-col gap-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Credenciales de la Aplicación Google (OAuth)
              </h4>
              <p className="text-xs text-muted-foreground">
                Configurá tu Client ID y Secret generados en Google Cloud Console.
              </p>
            </div>

            <div className="bg-muted/40 p-3.5 rounded-xl border border-border space-y-2">
              <span className="text-xs font-bold text-foreground">URIs de redireccionamiento para Google Cloud Console:</span>
              <p className="text-[11px] text-muted-foreground">
                Agregá estas 2 direcciones exactas en tu proyecto de Google Cloud (en <strong>URIs de redireccionamiento autorizados</strong>):
              </p>
              <div className="space-y-1.5 font-mono text-xs">
                <div className="flex items-center justify-between gap-2 bg-background px-3 py-2 rounded-lg border border-border">
                  <span className="text-emerald-400 font-bold break-all">
                    {typeof window !== 'undefined' ? `${window.location.origin}/api/integrations/google/callback` : 'http://localhost:3000/api/integrations/google/callback'}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2 font-semibold"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        navigator.clipboard.writeText(`${window.location.origin}/api/integrations/google/callback`);
                        toast.success("URI copiada al portapapeles");
                      }
                    }}
                  >
                    Copiar
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 bg-background px-3 py-2 rounded-lg border border-border">
                  <span className="text-emerald-400 font-bold break-all">
                    http://127.0.0.1:3000/api/integrations/google/callback
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2 font-semibold"
                    onClick={() => {
                      navigator.clipboard.writeText('http://127.0.0.1:3000/api/integrations/google/callback');
                      toast.success("URI copiada al portapapeles");
                    }}
                  >
                    Copiar
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label className="text-xs">Google Client ID</Label>
                <Input
                  value={gcalForm.clientId}
                  onChange={(e) => setGcalForm((c) => ({ ...c, clientId: e.target.value }))}
                  placeholder="ej: 123456789-abc.apps.googleusercontent.com"
                  className="text-xs"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">
                  Google Client Secret {gcal.data?.hasClientSecret ? "(Configurado)" : ""}
                </Label>
                <Input
                  type="password"
                  value={gcalForm.clientSecret}
                  onChange={(e) => setGcalForm((c) => ({ ...c, clientSecret: e.target.value }))}
                  placeholder={gcal.data?.hasClientSecret ? "Dejar en blanco para mantener" : "ej: GOCSPX-..."}
                  className="text-xs"
                />
              </div>
            </div>
            <Button
              onClick={onSaveGcalCreds}
              disabled={updateGcalCreds.isPending}
              variant="outline"
              size="sm"
              className="w-fit text-xs font-semibold"
            >
              Guardar Credenciales de Google
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WhatsApp API</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>API URL</Label>
            <Input value={waForm.apiUrl} onChange={e => setWaForm(c => ({...c, apiUrl: e.target.value}))} />
          </div>
          <div className="grid gap-2">
            <Label>API Key {wa.data?.hasApiKey ? "(Configurada)" : ""}</Label>
            <Input type="password" value={waForm.apiKey} onChange={e => setWaForm(c => ({...c, apiKey: e.target.value}))} placeholder={wa.data?.hasApiKey ? "Dejar en blanco para mantener actual" : ""} />
          </div>
          <Button onClick={onSaveWa} disabled={updateWa.isPending} className="w-fit">Guardar WhatsApp</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SMTP</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Host</Label>
              <Input value={smtpForm.host} onChange={e => setSmtpForm(c => ({...c, host: e.target.value}))} />
            </div>
            <div className="grid gap-2">
              <Label>Puerto</Label>
              <Input value={smtpForm.port} onChange={e => setSmtpForm(c => ({...c, port: e.target.value}))} />
            </div>
            <div className="grid gap-2">
              <Label>Usuario</Label>
              <Input value={smtpForm.user} onChange={e => setSmtpForm(c => ({...c, user: e.target.value}))} />
            </div>
            <div className="grid gap-2">
              <Label>Contraseña {smtp.data?.hasPassword ? "(Configurada)" : ""}</Label>
              <Input type="password" value={smtpForm.password} onChange={e => setSmtpForm(c => ({...c, password: e.target.value}))} placeholder={smtp.data?.hasPassword ? "Dejar en blanco para mantener" : ""} />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>Email de remitente</Label>
              <Input value={smtpForm.fromEmail} onChange={e => setSmtpForm(c => ({...c, fromEmail: e.target.value}))} />
            </div>
          </div>
          <Button onClick={onSaveSmtp} disabled={updateSmtp.isPending} className="w-fit">Guardar SMTP</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>URL</Label>
            <Input value={whForm.url} onChange={e => setWhForm(c => ({...c, url: e.target.value}))} />
          </div>
          <div className="grid gap-2">
            <Label>Eventos (separados por coma)</Label>
            <Input value={whForm.events} onChange={e => setWhForm(c => ({...c, events: e.target.value}))} />
          </div>
          <Button onClick={onSaveWh} disabled={updateWh.isPending} className="w-fit">Guardar Webhooks</Button>
        </CardContent>
      </Card>
    </div>
  )
}

function IaTab() {
  const ai = trpc.integrations.getAiConfig.useQuery()
  const updateAi = trpc.integrations.updateAiConfig.useMutation()
  const utils = trpc.useUtils()

  const [form, setForm] = React.useState({ provider: "openai", apiKey: "" })

  React.useEffect(() => {
    if (ai.data && form.provider === "openai" && !form.apiKey) {
      setForm({ provider: ai.data.provider, apiKey: "" })
    }
  }, [ai.data])

  async function onSave() {
    try {
      await updateAi.mutateAsync({
        provider: form.provider as "openai" | "anthropic" | "gemini" | "deepseek",
        apiKey: form.apiKey || undefined
      })
      toast.success("Configuración IA guardada")
      utils.integrations.getAiConfig.invalidate()
    } catch (e) {
      toast.error("Error al guardar IA")
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Inteligencia Artificial</CardTitle>
          <CardDescription>
            Configura tu propio proveedor de IA para los resúmenes y agentes.
            {ai.data?.usingPlatformKey ? " Actualmente usando clave de la plataforma." : " Actualmente usando clave propia."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Proveedor</Label>
            <Select value={form.provider} onValueChange={v => setForm(c => ({...c, provider: v}))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
                <SelectItem value="deepseek">Deepseek</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>API Key {ai.data?.hasApiKey ? "(Configurada)" : ""}</Label>
            <Input type="password" value={form.apiKey} onChange={e => setForm(c => ({...c, apiKey: e.target.value}))} placeholder={ai.data?.hasApiKey ? "Dejar en blanco para mantener" : ""} />
          </div>
          <Button onClick={onSave} disabled={updateAi.isPending} className="w-fit">Guardar IA</Button>
        </CardContent>
      </Card>
    </div>
  )
}

function SuscripcionTab() {
  const sub = trpc.subscription.getCurrent.useQuery()

  if (!sub.data) return <div className="animate-pulse h-48 bg-muted rounded-xl" />

  const { planName, usage } = sub.data

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tu Plan: {planName.toUpperCase()}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <div className="flex justify-between">
              <Label>Usuarios</Label>
              <span className="text-sm text-muted-foreground">{usage.usersCount} / {usage.maxUsers}</span>
            </div>
            <Progress value={(usage.usersCount / usage.maxUsers) * 100} />
          </div>
          
          <div className="grid gap-2">
            <div className="flex justify-between">
              <Label>Clientes Activos</Label>
              <span className="text-sm text-muted-foreground">{usage.clientsCount} / {usage.maxClients}</span>
            </div>
            <Progress value={(usage.clientsCount / usage.maxClients) * 100} />
          </div>

          <div className="grid gap-2">
            <div className="flex justify-between">
              <Label>Visitas del Mes</Label>
              <span className="text-sm text-muted-foreground">{usage.visitsThisMonth} / {usage.maxVisitsMonth}</span>
            </div>
            <Progress value={(usage.visitsThisMonth / usage.maxVisitsMonth) * 100} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
