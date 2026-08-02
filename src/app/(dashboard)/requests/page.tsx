"use client"

import * as React from "react"
import { CalendarPlus, ClipboardList, Plus, Check, MapPin, Phone } from "lucide-react"
import { toast } from "sonner"

import { trpc } from "@/lib/trpc"
import { formatLongDateTime, formatPhone } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/shared/EmptyState"
import { RequestForm } from "@/components/requests/RequestForm"
import { ScheduleRequestDialog } from "@/components/requests/ScheduleRequestDialog"

type RequestStatus = "PENDING" | "SCHEDULED" | "CLOSED"

const TABS: { value: RequestStatus; label: string }[] = [
  { value: "PENDING", label: "Pendientes" },
  { value: "SCHEDULED", label: "Agendadas" },
  { value: "CLOSED", label: "Cerradas" },
]

const URGENCY = {
  HIGH: { label: "Alta", className: "bg-red-500/10 text-red-500" },
  MEDIUM: { label: "Media", className: "bg-amber-500/10 text-amber-500" },
  LOW: { label: "Baja", className: "bg-slate-500/10 text-slate-500" },
} as const

type ScheduleTarget = {
  id: string
  clientId: string
  clientName: string
  serviceTypes: string[]
}

export default function RequestsPage() {
  const [status, setStatus] = React.useState<RequestStatus>("PENDING")
  const [formOpen, setFormOpen] = React.useState(false)
  const [scheduleTarget, setScheduleTarget] = React.useState<ScheduleTarget | null>(null)

  const utils = trpc.useUtils()
  const counts = trpc.requests.counts.useQuery()
  const { data, isLoading } = trpc.requests.list.useQuery({ status, limit: 100 })

  const closeRequest = trpc.requests.close.useMutation({
    onSuccess: async () => {
      toast.success("Solicitud cerrada")
      await utils.requests.invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  const items = data?.items ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Solicitudes</h1>
          <p className="text-muted-foreground">
            Pedidos de clientes esperando ser agendados.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva solicitud
        </Button>
      </div>

      <div className="flex gap-2">
        {TABS.map((tab) => (
          <Button
            key={tab.value}
            variant={status === tab.value ? "default" : "outline"}
            size="sm"
            onClick={() => setStatus(tab.value)}
          >
            {tab.label}
            {counts.data ? (
              <span
                className={`ml-2 rounded-full px-1.5 text-xs ${
                  status === tab.value ? "bg-primary-foreground/20" : "bg-muted"
                }`}
              >
                {counts.data[tab.value]}
              </span>
            ) : null}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="Sin solicitudes acá"
            description={
              status === "PENDING"
                ? "Cuando entre un pedido nuevo lo vas a ver en esta lista."
                : "No hay solicitudes en este estado."
            }
            actionLabel={status === "PENDING" ? "Nueva solicitud" : undefined}
            onAction={status === "PENDING" ? () => setFormOpen(true) : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((request) => {
            const urgency = URGENCY[request.urgency]
            const scheduledVisit = request.visits[0]

            return (
              <Card key={request.id} className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">
                        {request.client?.name ?? request.clientName}
                      </h3>
                      <Badge variant="outline" className={`border-none ${urgency.className}`}>
                        {urgency.label}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {request.client?.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {formatPhone(request.client.phone)}
                        </span>
                      )}
                      {request.client?.address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {request.client.address}
                        </span>
                      )}
                    </div>

                    {request.serviceTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {request.serviceTypes.map((service) => (
                          <Badge key={service} variant="secondary" className="font-normal">
                            {service}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {request.comment && (
                      <p className="text-sm text-muted-foreground">{request.comment}</p>
                    )}

                    {scheduledVisit?.scheduledAt && (
                      <p className="text-sm text-emerald-600">
                        Visita agendada para {formatLongDateTime(scheduledVisit.scheduledAt)}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {request.status === "PENDING" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          setScheduleTarget({
                            id: request.id,
                            clientId: request.clientId,
                            clientName: request.client?.name ?? request.clientName ?? "",
                            serviceTypes: request.serviceTypes,
                          })
                        }
                      >
                        <CalendarPlus className="mr-2 h-4 w-4" />
                        Agendar
                      </Button>
                    )}
                    {request.status !== "CLOSED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={closeRequest.isPending}
                        onClick={() => closeRequest.mutate({ id: request.id })}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Cerrar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <RequestForm open={formOpen} onOpenChange={setFormOpen} />
      <ScheduleRequestDialog
        open={Boolean(scheduleTarget)}
        onOpenChange={(open) => !open && setScheduleTarget(null)}
        request={scheduleTarget}
      />
    </div>
  )
}
