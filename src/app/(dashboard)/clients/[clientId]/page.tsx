"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowLeft,
  CalendarPlus,
  ClipboardList,
  DollarSign,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Repeat,
} from "lucide-react"

import { trpc } from "@/lib/trpc"
import { formatCurrency, formatDate, formatLongDateTime, formatPhone } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge, VisitStatus } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { ClientForm } from "@/components/clients/ClientForm"
import { ClientJobs } from "@/components/clients/ClientJobs"
import { VisitForm } from "@/components/agenda/VisitForm"

const PAYMENT_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "A cobrar", className: "bg-amber-500/10 text-amber-600" },
  PAID: { label: "Cobrada", className: "bg-emerald-500/10 text-emerald-600" },
  WAIVED: { label: "Sin cargo", className: "bg-slate-500/10 text-slate-600" },
}

const URGENCY_LABELS: Record<string, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
}

const REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  SCHEDULED: "Agendada",
  CLOSED: "Cerrada",
}

export default function ClientDetailPage() {
  const params = useParams<{ clientId: string }>()
  const clientId = params.clientId

  const [editOpen, setEditOpen] = React.useState(false)
  const [visitOpen, setVisitOpen] = React.useState(false)

  // Declared before the early returns below so hook order stays stable.
  const tomorrow9am = React.useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    date.setHours(9, 0, 0, 0)
    return date
  }, [])

  const { data, isLoading, error } = trpc.clients.detail.useQuery({ id: clientId })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <EmptyState
          icon={ClipboardList}
          title="Cliente no encontrado"
          description="Puede haber sido eliminado o pertenecer a otro negocio."
        />
      </Card>
    )
  }

  const { client, visits, requests, stats } = data

  /** Opens the visit dialog pre-filled for this client. */
  function newVisit() {
    setVisitOpen(true)
  }

  return (
    <div className="space-y-6">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a clientes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
            <Badge
              variant="outline"
              className={
                client.relationshipType === "CONTRACT"
                  ? "border-none bg-indigo-500/10 text-indigo-500"
                  : "border-none bg-slate-500/10 text-slate-500"
              }
            >
              {client.relationshipType === "CONTRACT" ? "Contrato" : "Ocasional"}
            </Badge>
            {client.status === "INACTIVE" && (
              <Badge variant="outline" className="border-none bg-red-500/10 text-red-500">
                Inactivo
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {client.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {formatPhone(client.phone)}
              </span>
            )}
            {client.email && (
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {client.email}
              </span>
            )}
            {client.address && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {client.address}
              </span>
            )}
          </div>

          {client.serviceTypes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {client.serviceTypes.map((service) => (
                <Badge key={service} variant="secondary" className="font-normal">
                  {service}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar
          </Button>
          <Button onClick={newVisit}>
            <CalendarPlus className="mr-2 h-4 w-4" />
            Nueva visita
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Facturado</p>
              <p className="mt-1 text-xl font-bold">{formatCurrency(stats.totalBilled)}</p>
            </div>
            <DollarSign className="h-6 w-6 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Visitas totales</p>
            <p className="mt-1 text-xl font-bold">{stats.totalVisits}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Completadas</p>
            <p className="mt-1 text-xl font-bold">{stats.completedVisits}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Por hacer</p>
            <p className="mt-1 text-xl font-bold">{stats.upcomingVisits}</p>
          </CardContent>
        </Card>
      </div>

      {(client.preferredDays.length > 0 || client.preferredSlots.length > 0 || client.notes) && (
        <Card className="p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {client.preferredDays.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Días preferidos
                </p>
                <p className="mt-1 text-sm">{client.preferredDays.join(", ")}</p>
              </div>
            )}
            {client.preferredSlots.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Franja
                </p>
                <p className="mt-1 text-sm">{client.preferredSlots.join(", ")}</p>
              </div>
            )}
            {client.notes && (
              <div className="sm:col-span-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Notas
                </p>
                <p className="mt-1 whitespace-pre-line text-sm">{client.notes}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      <ClientJobs clientId={clientId} />

      <section className="space-y-3">
        <h2 className="font-semibold">Historial de visitas</h2>
        <Card>
          {visits.length === 0 ? (
            <EmptyState
              icon={CalendarPlus}
              title="Sin visitas todavía"
              description="Agendá la primera visita para este cliente."
              actionLabel="Nueva visita"
              onAction={newVisit}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Servicio</TableHead>
                  <TableHead>Asignada a</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Cobro</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visits.map((visit) => {
                  const payment = PAYMENT_LABELS[visit.paymentStatus]
                  return (
                    <TableRow key={visit.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {visit.scheduledAt ? (
                          formatLongDateTime(visit.scheduledAt)
                        ) : (
                          <span className="text-muted-foreground">Sin agendar</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {visit.serviceType ?? "—"}
                        {visit.job && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Repeat className="h-3 w-3" />
                            {visit.applicationNumber}/{visit.job.totalApplications}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {visit.assignedUser?.name ?? "Sin asignar"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={visit.status as VisitStatus} size="sm" />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`border-none ${payment.className}`}>
                          {payment.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(visit.price)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </section>

      {requests.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Solicitudes</h2>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Servicios</TableHead>
                  <TableHead>Urgencia</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(request.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {request.serviceTypes.join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{URGENCY_LABELS[request.urgency]}</TableCell>
                    <TableCell className="text-sm">
                      {REQUEST_STATUS_LABELS[request.status]}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>
      )}

      <ClientForm open={editOpen} onOpenChange={setEditOpen} clientId={clientId} />
      <VisitForm
        open={visitOpen}
        onOpenChange={setVisitOpen}
        defaultClientId={clientId}
        defaultStart={tomorrow9am}
      />
    </div>
  )
}
