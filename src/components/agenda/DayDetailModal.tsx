"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  ExternalLink,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Edit3,
  DollarSign,
  User,
  Plus
} from "lucide-react"

import { trpc } from "@/lib/trpc"
import { formatCurrency, formatDate } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LoadingSpinner } from "@/components/ui/loading-spinner"

interface DayDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  date: Date | null
  onEditVisit: (visitId: string) => void
  onNewVisitOnDate: (date: Date) => void
}

const STATUS_CONFIG: Record<string, { label: string; badge: string; bg: string }> = {
  PENDING_CONFIRM: {
    label: "Por confirmar",
    badge: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    bg: "border-l-4 border-l-amber-500",
  },
  CONFIRMED: {
    label: "Confirmada",
    badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    bg: "border-l-4 border-l-indigo-500",
  },
  COMPLETED: {
    label: "Realizada",
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    bg: "border-l-4 border-l-emerald-500",
  },
  CANCELLED: {
    label: "Cancelada",
    badge: "bg-red-500/10 text-red-400 border-red-500/30",
    bg: "border-l-4 border-l-red-500",
  },
  SKIPPED: {
    label: "Omitida",
    badge: "bg-slate-500/10 text-slate-400 border-slate-500/30",
    bg: "border-l-4 border-l-slate-500",
  },
}

export function DayDetailModal({
  open,
  onOpenChange,
  date,
  onEditVisit,
  onNewVisitOnDate,
}: DayDetailModalProps) {
  const utils = trpc.useUtils()

  const startOfDay = React.useMemo(() => {
    if (!date) return new Date()
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d
  }, [date])

  const endOfDay = React.useMemo(() => {
    if (!date) return new Date()
    const d = new Date(date)
    d.setHours(23, 59, 59, 999)
    return d
  }, [date])

  const { data: visitsData, isLoading } = trpc.visits.list.useQuery(
    {
      startDate: startOfDay,
      endDate: endOfDay,
      limit: 100,
    },
    { enabled: open && Boolean(date) }
  )

  const updateStatus = trpc.visits.updateStatus.useMutation({
    onSuccess: () => {
      utils.visits.invalidate()
      utils.dashboard.invalidate()
    },
    onError: (err) => toast.error(err.message),
  })

  const formattedDayTitle = React.useMemo(() => {
    if (!date) return ""
    return date.toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  }, [date])

  const sortedVisits = React.useMemo(() => {
    if (!visitsData?.items) return []
    return [...visitsData.items].sort((a, b) => {
      const timeA = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0
      const timeB = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0
      return timeA - timeB
    })
  }, [visitsData])

  async function handleStatusChange(visitId: string, newStatus: "COMPLETED" | "PENDING_CONFIRM" | "CANCELLED") {
    try {
      await updateStatus.mutateAsync({ id: visitId, status: newStatus })
      const statusLabels = {
        COMPLETED: "Visita marcada como realizada",
        PENDING_CONFIRM: "Visita movida a pendientes",
        CANCELLED: "Visita cancelada",
      }
      toast.success(statusLabels[newStatus])
    } catch {
      // error handled in onError
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full max-h-[85vh] flex flex-col p-6 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <DialogHeader className="pb-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle className="text-xl font-bold capitalize flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-indigo-500" />
                {formattedDayTitle}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {sortedVisits.length} {sortedVisits.length === 1 ? "trabajo programado" : "trabajos programados"} para este día
              </DialogDescription>
            </div>
            {date && (
              <Button
                size="sm"
                className="gap-1.5 font-bold shadow-sm"
                onClick={() => {
                  onOpenChange(false)
                  onNewVisitOnDate(date)
                }}
              >
                <Plus className="h-4 w-4" />
                Nueva visita
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 pr-1 space-y-3">
          {isLoading ? (
            <LoadingSpinner label="Cargando visitas del día..." size="md" className="py-12" />
          ) : sortedVisits.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-xl border border-dashed border-border bg-muted/20 space-y-3">
              <Clock className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
              <h3 className="font-semibold text-base">Sin trabajos este día</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                No hay turnos o visitas agendadas para la fecha seleccionada.
              </p>
              {date && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 text-xs font-semibold gap-1.5"
                  onClick={() => {
                    onOpenChange(false)
                    onNewVisitOnDate(date)
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agendar trabajo para hoy
                </Button>
              )}
            </div>
          ) : (
            sortedVisits.map((visit) => {
              const statusCfg = STATUS_CONFIG[visit.status] ?? STATUS_CONFIG.SKIPPED
              const startTimeStr = visit.scheduledAt
                ? new Date(visit.scheduledAt).toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "--:--"

              const durationMins = visit.durationMinutes || 45
              const priceVal = Number(visit.price)

              return (
                <div
                  key={visit.id}
                  className={`p-4 rounded-xl border border-border bg-background shadow-sm hover:shadow-md transition-all space-y-3 ${statusCfg.bg}`}
                >
                  {/* Top Header: Time, Status, Title */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 font-extrabold text-xs border border-indigo-500/20">
                          <Clock className="h-3 w-3" />
                          {startTimeStr} hs ({durationMins} min)
                        </span>
                        <Badge variant="outline" className={`text-[11px] font-bold ${statusCfg.badge}`}>
                          {statusCfg.label}
                        </Badge>
                        {visit.serviceType && (
                          <Badge variant="secondary" className="text-[11px] font-medium">
                            {visit.serviceType}
                          </Badge>
                        )}
                      </div>
                      <h4 className="text-base font-bold text-foreground flex items-center gap-2">
                        <User className="h-4 w-4 text-indigo-400 shrink-0" />
                        {visit.client.name}
                      </h4>
                    </div>

                    {/* Price Tag */}
                    <div className="text-right">
                      <span className="text-xs font-semibold text-muted-foreground block">Valor</span>
                      <span className="text-base font-extrabold text-foreground">
                        {priceVal > 0 ? formatCurrency(priceVal) : "Sin valor"}
                      </span>
                    </div>
                  </div>

                  {/* Address with Direct Maps Link */}
                  {visit.client.address ? (
                    <div className="flex items-center justify-between gap-3 text-xs bg-muted/40 p-2.5 rounded-lg border border-border/60">
                      <span className="truncate flex items-center gap-1.5 text-muted-foreground font-medium">
                        <MapPin className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                        <span className="truncate text-foreground">{visit.client.address}</span>
                      </span>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.client.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:text-sky-300 bg-sky-500/15 hover:bg-sky-500/25 px-2.5 py-1 rounded-md border border-sky-500/30 transition-all"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Abrir Maps
                      </a>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 opacity-40" /> Sin dirección registrada
                    </p>
                  )}

                  {/* Notes if any */}
                  {visit.notes && (
                    <p className="text-xs text-muted-foreground bg-amber-500/5 border border-amber-500/15 p-2 rounded-md">
                      <strong>Notas:</strong> {visit.notes}
                    </p>
                  )}

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-border/50 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Mark Completed Button */}
                      {visit.status !== "COMPLETED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs font-bold text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15 gap-1.5"
                          disabled={updateStatus.isPending}
                          onClick={() => handleStatusChange(visit.id, "COMPLETED")}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          Marcar realizada
                        </Button>
                      )}

                      {/* Move back to Pending / Cancel */}
                      {visit.status !== "PENDING_CONFIRM" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs font-semibold text-amber-400 border-amber-500/30 hover:bg-amber-500/15 gap-1.5"
                          disabled={updateStatus.isPending}
                          onClick={() => handleStatusChange(visit.id, "PENDING_CONFIRM")}
                        >
                          <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
                          Volver a pendientes
                        </Button>
                      )}

                      {visit.status !== "CANCELLED" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-1"
                          disabled={updateStatus.isPending}
                          onClick={() => handleStatusChange(visit.id, "CANCELLED")}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Cancelar
                        </Button>
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 text-xs font-semibold gap-1.5"
                      onClick={() => {
                        onOpenChange(false)
                        onEditVisit(visit.id)
                      }}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
